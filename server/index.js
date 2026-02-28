require('dotenv').config();
const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const fs = require('fs');
const db = require('./db');
const { signToken, verifyToken, authMiddleware, requireAdmin } = require('./auth');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const hasClientBuild = fs.existsSync(clientDist);
const SALT_ROUNDS = 10;
const EDIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

function now() {
  return Math.floor(Date.now() / 1000);
}

async function updateLastSeen(userId) {
  await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), userId);
}

// --- REST API ---

// Register (username, password, optional display_name)
app.post('/api/register', async (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password required (min 6 characters)' });
  }
  const name = (display_name || username).trim().slice(0, 100);
  const uname = username.trim().slice(0, 64);
  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const stmt = db.prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)');
    const result = await stmt.run(uname, name || uname, password_hash, 0);
    const row = await db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
    const user = { id: row.id, username: row.username, display_name: row.display_name, is_admin: !!row.is_admin };
    const token = signToken(user.id);
    res.status(201).json({ user, token });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || (e.code && String(e.code).includes('CONSTRAINT') && String(e.code).includes('UNIQUE'))) {
      return res.status(409).json({ error: 'username taken' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Login (username, password)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const row = await db.prepare('SELECT id, username, display_name, password_hash, is_admin FROM users WHERE username = ?').get(username.trim());
  if (!row || !row.password_hash) {
    return res.status(401).json({ error: 'invalid username or password' });
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'invalid username or password' });
  }
  const user = { id: row.id, username: row.username, display_name: row.display_name, is_admin: !!(row.is_admin) };
  const token = signToken(user.id);
  res.json({ user, token });
});

// Current user (for refresh / is_admin, about, last_seen)
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    await updateLastSeen(req.userId);
    const row = await db.prepare('SELECT id, username, display_name, is_admin, about, last_seen_at FROM users WHERE id = ?').get(req.userId);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      is_admin: !!row.is_admin,
      about: row.about || '',
      last_seen_at: row.last_seen_at ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update profile (about, display_name)
app.patch('/api/me', authMiddleware, async (req, res) => {
  try {
    const { about, display_name } = req.body || {};
    if (about !== undefined) {
      const val = String(about).trim().slice(0, 150);
      await db.prepare('UPDATE users SET about = ? WHERE id = ?').run(val, req.userId);
    }
    if (display_name !== undefined) {
      const val = String(display_name).trim().slice(0, 100);
      await db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(val || null, req.userId);
    }
    const row = await db.prepare('SELECT id, username, display_name, is_admin, about, last_seen_at FROM users WHERE id = ?').get(req.userId);
    res.json({
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      is_admin: !!row.is_admin,
      about: row.about || '',
      last_seen_at: row.last_seen_at ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Protected routes — list users with last_seen_at, about, unread_count
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    await updateLastSeen(req.userId);
    const users = await db.prepare('SELECT id, username, display_name, about, last_seen_at FROM users WHERE id != ? ORDER BY username').all(req.userId);
    const receipts = await db.prepare('SELECT other_user_id, last_read_message_id FROM read_receipts WHERE user_id = ?').all(req.userId);
    const lastReadByOther = new Map(receipts.map((r) => [r.other_user_id, r.last_read_message_id]));
    const result = [];
    for (const u of users) {
      const otherId = u.id;
      const lastRead = lastReadByOther.get(otherId) ?? 0;
      const unreadRow = await db.prepare(`
        SELECT COUNT(*) AS c FROM messages m
        LEFT JOIN message_hidden h ON h.message_id = m.id AND h.user_id = ?
        WHERE m.sender_id = ? AND m.recipient_id = ? AND m.deleted_at IS NULL AND h.message_id IS NULL AND m.id > ?
      `).get(req.userId, otherId, req.userId, lastRead);
      result.push({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        about: u.about || '',
        last_seen_at: u.last_seen_at ?? null,
        unread_count: unreadRow?.c ?? 0,
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/conversation/:otherId', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const otherId = parseInt(req.params.otherId, 10);
  if (isNaN(otherId)) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  try {
    await updateLastSeen(userId);
    const messages = await db.prepare(`
      SELECT m.id, m.sender_id, m.recipient_id, m.content, m.created_at, m.reply_to_id, m.edited_at, m.deleted_at
      FROM messages m
      LEFT JOIN message_hidden h ON h.message_id = m.id AND h.user_id = ?
      WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
        AND h.message_id IS NULL
      ORDER BY m.created_at ASC
    `).all(userId, userId, otherId, otherId, userId);
    const filtered = messages.filter((m) => !m.deleted_at).map(({ deleted_at, ...m }) => ({ ...m, reply_to_id: m.reply_to_id ?? null, edited_at: m.edited_at ?? null }));
    const maxId = filtered.length ? Math.max(...filtered.map((m) => m.id)) : 0;
    const n = now();
    const upsertReceipt = db.prepare(`
      INSERT INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, other_user_id) DO UPDATE SET
        last_read_message_id = max(read_receipts.last_read_message_id, excluded.last_read_message_id),
        read_at = excluded.read_at
    `);
    try {
      await upsertReceipt.run(userId, otherId, maxId, n);
    } catch (_) {
      await db.prepare('REPLACE INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)').run(userId, otherId, maxId, n);
    }
    const otherReceipt = await db.prepare('SELECT last_read_message_id FROM read_receipts WHERE user_id = ? AND other_user_id = ?').get(otherId, userId);
    const lastReadByOther = otherReceipt?.last_read_message_id ?? 0;
    res.json({ messages: filtered, lastReadByOther });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark conversation as read (optional; GET conversation already does this)
app.post('/api/conversation/:otherId/read', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const otherId = parseInt(req.params.otherId, 10);
  if (isNaN(otherId)) return res.status(400).json({ error: 'invalid user id' });
  try {
    await updateLastSeen(userId);
    const maxRow = await db.prepare(`
      SELECT MAX(id) AS mid FROM messages m
      LEFT JOIN message_hidden h ON h.message_id = m.id AND h.user_id = ?
      WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) AND m.deleted_at IS NULL AND h.message_id IS NULL
    `).get(userId, userId, otherId, otherId, userId);
    const maxId = maxRow?.mid ?? 0;
    const n = now();
    try {
      await db.prepare(`
        INSERT INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, other_user_id) DO UPDATE SET last_read_message_id = max(read_receipts.last_read_message_id, excluded.last_read_message_id), read_at = excluded.read_at
      `).run(userId, otherId, maxId, n);
    } catch (_) {
      await db.prepare('REPLACE INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)').run(userId, otherId, maxId, n);
    }
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit message (sender only, within 15 min)
app.patch('/api/messages/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = parseInt(req.params.id, 10);
  const { content } = req.body || {};
  if (isNaN(id) || typeof content !== 'string') return res.status(400).json({ error: 'invalid request' });
  const trimmed = content.trim().slice(0, 10000);
  if (!trimmed) return res.status(400).json({ error: 'content required' });
  try {
    const row = await db.prepare('SELECT id, sender_id, created_at FROM messages WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!row) return res.status(404).json({ error: 'message not found' });
    if (row.sender_id !== userId) return res.status(403).json({ error: 'not your message' });
    if (now() - row.created_at > EDIT_WINDOW_SECONDS) return res.status(400).json({ error: 'edit window expired (15 min)' });
    await db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(trimmed, now(), id);
    const updated = await db.prepare('SELECT id, sender_id, recipient_id, content, created_at, reply_to_id, edited_at, deleted_at FROM messages WHERE id = ?').get(id);
    [updated.sender_id, updated.recipient_id].forEach((uid) => {
      const socks = onlineByUserId.get(uid);
      if (socks) socks.forEach((sid) => io.to(sid).emit('message_updated', updated));
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete for everyone (sender only; soft delete)
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid message id' });
  try {
    const row = await db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'message not found' });
    if (row.sender_id !== userId) return res.status(403).json({ error: 'not your message' });
    await db.prepare('UPDATE messages SET deleted_at = ?, content = ? WHERE id = ?').run(now(), '', id);
    [row.sender_id, row.recipient_id].forEach((uid) => {
      const socks = onlineByUserId.get(uid);
      if (socks) socks.forEach((sid) => io.to(sid).emit('message_deleted', { id }));
    });
    res.json({ id, deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete for me (hide message from my view)
app.post('/api/messages/:id/hide', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid message id' });
  try {
    const row = await db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'message not found' });
    if (row.sender_id !== userId && row.recipient_id !== userId) return res.status(403).json({ error: 'not in this conversation' });
    await db.prepare('INSERT OR IGNORE INTO message_hidden (user_id, message_id) VALUES (?, ?)').run(userId, id);
    res.json({ id, hidden: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete own conversation with another user (all messages between the two)
app.delete('/api/conversation/:otherId', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const otherId = parseInt(req.params.otherId, 10);
  if (isNaN(otherId)) return res.status(400).json({ error: 'invalid user id' });
  try {
    await db.prepare(`
      DELETE FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    `).run(userId, otherId, otherId, userId);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin routes
const adminMiddleware = [authMiddleware, requireAdmin(db)];

app.get('/api/admin/users', ...adminMiddleware, async (req, res) => {
  try {
    const users = await db.prepare('SELECT id, username, display_name, is_admin FROM users ORDER BY username').all();
    res.json(users.map((r) => ({ ...r, is_admin: !!r.is_admin })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete any conversation (between userId and otherId)
app.delete('/api/admin/conversation', ...adminMiddleware, async (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const otherId = parseInt(req.query.otherId, 10);
  if (isNaN(userId) || isNaN(otherId)) return res.status(400).json({ error: 'invalid user ids' });
  try {
    await db.prepare(`
      DELETE FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    `).run(userId, otherId, otherId, userId);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete a user and all their messages
app.delete('/api/admin/users/:id', ...adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid user id' });
  if (id === req.userId) return res.status(400).json({ error: 'cannot delete yourself' });
  try {
    await db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(id, id);
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: set user as admin
app.post('/api/admin/users/:id/admin', ...adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid user id' });
  try {
    await db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Socket.io: real-time messaging (auth via token) ---
const onlineByUserId = new Map();

function broadcastOnlineUsers() {
  const userIds = Array.from(onlineByUserId.keys());
  io.emit('online_users', userIds);
}

io.on('connection', (socket) => {
  socket.on('join', (token) => {
    const userId = token ? verifyToken(token) : null;
    if (typeof userId !== 'number') return;
    socket.userId = userId;
    if (!onlineByUserId.has(userId)) onlineByUserId.set(userId, new Set());
    onlineByUserId.get(userId).add(socket.id);
    broadcastOnlineUsers();
  });

  socket.on('typing', (payload) => {
    const recipientId = payload && typeof payload.recipientId === 'number' ? payload.recipientId : null;
    if (!socket.userId || !recipientId) return;
    const recipientSockets = onlineByUserId.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((sid) => io.to(sid).emit('user_typing', { userId: socket.userId }));
    }
  });

  socket.on('send_message', async (payload) => {
    const { recipientId, content, replyToId } = payload || {};
    if (typeof recipientId !== 'number' || typeof content !== 'string' || !socket.userId) return;
    const trimmed = content.trim().slice(0, 10000);
    if (!trimmed) return;
    const replyTo = replyToId != null ? parseInt(replyToId, 10) : null;
    try {
      const stmt = db.prepare('INSERT INTO messages (sender_id, recipient_id, content, reply_to_id) VALUES (?, ?, ?, ?)');
      const result = await stmt.run(socket.userId, recipientId, trimmed, replyTo && !isNaN(replyTo) ? replyTo : null);
      const row = await db.prepare('SELECT id, sender_id, recipient_id, content, created_at, reply_to_id, edited_at, deleted_at FROM messages WHERE id = ?').get(result.lastInsertRowid);
      await updateLastSeen(socket.userId);
      socket.emit('new_message', row);
      const recipientSockets = onlineByUserId.get(recipientId);
      if (recipientSockets) {
        recipientSockets.forEach((sid) => io.to(sid).emit('new_message', row));
      }
    } catch (e) {
      socket.emit('error', { message: e.message });
    }
  });

  socket.on('mark_read', async (payload) => {
    const { otherUserId, lastReadMessageId } = payload || {};
    if (typeof otherUserId !== 'number' || !socket.userId) return;
    const mid = lastReadMessageId != null ? parseInt(lastReadMessageId, 10) : 0;
    try {
      await updateLastSeen(socket.userId);
      const n = now();
      try {
        await db.prepare(`
          INSERT INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, other_user_id) DO UPDATE SET last_read_message_id = max(read_receipts.last_read_message_id, excluded.last_read_message_id), read_at = excluded.read_at
        `).run(socket.userId, otherUserId, mid, n);
      } catch (_) {
        await db.prepare('REPLACE INTO read_receipts (user_id, other_user_id, last_read_message_id, read_at) VALUES (?, ?, ?, ?)').run(socket.userId, otherUserId, mid, n);
      }
      const recipientSockets = onlineByUserId.get(otherUserId);
      if (recipientSockets) {
        recipientSockets.forEach((sid) => io.to(sid).emit('read_receipt', { userId: socket.userId, lastReadMessageId: mid }));
      }
    } catch (_) {}
  });

  socket.on('disconnect', () => {
    if (socket.userId && onlineByUserId.has(socket.userId)) {
      onlineByUserId.get(socket.userId).delete(socket.id);
      if (onlineByUserId.get(socket.userId).size === 0) {
        onlineByUserId.delete(socket.userId);
      }
      broadcastOnlineUsers();
    }
  });
});

// Seed default admin account if missing (username: admin, password: admin112233)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin112233';
async function ensureAdminUser() {
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (existing) return;
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  await db.prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(ADMIN_USERNAME, 'Admin', password_hash, 1);
  console.log('Default admin account created: username=%s', ADMIN_USERNAME);
}

// Serve built frontend (so one server works for app + API)
if (hasClientBuild) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(
      '<h1>Mini Telegram</h1><p>API is running. For the app, run from project root: <code>npm run dev</code> (dev) or <code>cd client && npm run build</code> then restart the server (production).</p>'
    );
  });
}

db.ready
  .then(() => ensureAdminUser())
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      if (process.env.TURSO_DATABASE_URL) {
        console.log('Using Turso (online) database.');
      } else {
        console.log('Using local SQLite database (data/).');
      }
      if (!hasClientBuild) {
        console.log('No client build found. Run "cd client && npm run build" to serve the app from this server.');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
