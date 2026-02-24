const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const fs = require('fs');
const db = require('./db');
const { signToken, verifyToken, authMiddleware } = require('./auth');

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
    const stmt = db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)');
    const result = stmt.run(uname, name || uname, password_hash);
    const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = signToken(user.id);
    res.status(201).json({ user, token });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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
  const row = db.prepare('SELECT id, username, display_name, password_hash FROM users WHERE username = ?').get(username.trim());
  if (!row || !row.password_hash) {
    return res.status(401).json({ error: 'invalid username or password' });
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'invalid username or password' });
  }
  const user = { id: row.id, username: row.username, display_name: row.display_name };
  const token = signToken(user.id);
  res.json({ user, token });
});

// Protected routes
app.get('/api/users', authMiddleware, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, display_name FROM users WHERE id != ? ORDER BY username').all(req.userId);
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/conversation/:otherId', authMiddleware, (req, res) => {
  const userId = req.userId;
  const otherId = parseInt(req.params.otherId, 10);
  if (isNaN(otherId)) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  try {
    const messages = db.prepare(`
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

// --- Socket.io: real-time messaging (auth via token) ---
const onlineByUserId = new Map();

io.on('connection', (socket) => {
  socket.on('join', (token) => {
    const userId = token ? verifyToken(token) : null;
    if (typeof userId !== 'number') return;
    socket.userId = userId;
    if (!onlineByUserId.has(userId)) onlineByUserId.set(userId, new Set());
    onlineByUserId.get(userId).add(socket.id);
  });

  socket.on('send_message', (payload) => {
    const { recipientId, content } = payload || {};
    if (typeof recipientId !== 'number' || typeof content !== 'string' || !socket.userId) return;
    const trimmed = content.trim().slice(0, 10000);
    if (!trimmed) return;
    try {
      const stmt = db.prepare('INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)');
      const result = stmt.run(socket.userId, recipientId, trimmed);
      const row = db.prepare('SELECT id, sender_id, recipient_id, content, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid);
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
    }
  });
});

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

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!hasClientBuild) {
    console.log('No client build found. Run "cd client && npm run build" to serve the app from this server.');
  }
});
