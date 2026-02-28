const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (_) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = userId;
  next();
}

function requireAdmin(db) {
  return async (req, res, next) => {
    try {
      const row = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
      if (!row || !row.is_admin) {
        return res.status(403).json({ error: 'Admin only' });
      }
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { signToken, verifyToken, authMiddleware, requireAdmin, JWT_SECRET };
