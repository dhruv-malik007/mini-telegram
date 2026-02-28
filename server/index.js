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

// Current user (for refresh / is_admin)
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const row = await db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(req.userId);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ id: row.id, username: row.username, display_name: row.display_name, is_admin: !!row.is_admin });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Protected routes
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.prepare('SELECT id, username, display_name FROM users WHERE id != ? ORDER BY username').all(req.userId);
    res.json(users);
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
    const messages = await db.prepare(`
      SELECT id, sender_id, recipient_id, content, created_at
      FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY created_at ASC
    `).all(userId, otherId, otherId, userId);
    res.json(messages);
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
    const { recipientId, content } = payload || {};
    if (typeof recipientId !== 'number' || typeof content !== 'string' || !socket.userId) return;
    const trimmed = content.trim().slice(0, 10000);
    if (!trimmed) return;
    try {
      const stmt = db.prepare('INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)');
      const result = await stmt.run(socket.userId, recipientId, trimmed);
      const row = await db.prepare('SELECT id, sender_id, recipient_id, content, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid);
      // Emit to sender (confirm) and to recipient if online
      socket.emit('new_message', row);
      const recipientSockets = onlineByUserId.get(recipientId);
      if (recipientSockets) {
        recipientSockets.forEach((sid) => io.to(sid).emit('new_message', row));
      }
    } catch (e) {
      socket.emit('error', { message: e.message });
    }
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
