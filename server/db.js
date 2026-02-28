/**
 * Database layer: local SQLite (data/app.db) or Turso (free online SQLite).
 * To use Turso, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (see README).
 */
const fs = require('fs');
const path = require('path');

const useTurso =
  process.env.TURSO_DATABASE_URL &&
  process.env.TURSO_AUTH_TOKEN;

let db;
let ready;

if (useTurso) {
  const { createClient } = require('@libsql/client');

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT,
    about TEXT,
    last_seen_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    reply_to_id INTEGER,
    edited_at INTEGER,
    deleted_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id),
    FOREIGN KEY (reply_to_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS message_hidden (
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS read_receipts (
    user_id INTEGER NOT NULL,
    other_user_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, other_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (other_user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `;

  async function initTurso() {
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sql of statements) {
      await client.execute(sql);
    }
    // Migrations: add columns/tables if missing (ignore errors if already exist)
    for (const sql of [
      'ALTER TABLE users ADD COLUMN password_hash TEXT',
      'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN about TEXT',
      'ALTER TABLE users ADD COLUMN last_seen_at INTEGER',
      'ALTER TABLE messages ADD COLUMN reply_to_id INTEGER',
      'ALTER TABLE messages ADD COLUMN edited_at INTEGER',
      'ALTER TABLE messages ADD COLUMN deleted_at INTEGER',
    ]) {
      try {
        await client.execute(sql);
      } catch (_) {}
    }
  }

  function rowToObject(row, columns) {
    if (!row || !columns || !columns.length) return row;
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      let val = row[i] ?? row[columns[i]];
      if (typeof val === 'bigint') val = Number(val);
      obj[columns[i]] = val;
    }
    return obj;
  }

  ready = initTurso();

  db = {
    ready,

    prepare(sql) {
      return {
        run: async (...args) => {
          const result = await client.execute({
            sql,
            args: args.length ? args : undefined,
          });
          const lastInsertRowid = result.lastInsertRowid != null ? Number(result.lastInsertRowid) : undefined;
          return { lastInsertRowid, changes: result.rowsAffected };
        },
        get: async (...args) => {
          const result = await client.execute({
            sql,
            args: args.length ? args : undefined,
          });
          const row = result.rows && result.rows[0];
          if (!row) return undefined;
          return rowToObject(row, result.columns || []);
        },
        all: async (...args) => {
          const result = await client.execute({
            sql,
            args: args.length ? args : undefined,
          });
          const cols = result.columns || [];
          const rows = result.rows || [];
          return rows.map((row) => rowToObject(row, cols));
        },
      };
    },
  };
} else {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlite = new Database(path.join(dataDir, 'app.db'));

  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT,
    about TEXT,
    last_seen_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    reply_to_id INTEGER,
    edited_at INTEGER,
    deleted_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id),
    FOREIGN KEY (reply_to_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS message_hidden (
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS read_receipts (
    user_id INTEGER NOT NULL,
    other_user_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (user_id, other_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (other_user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);

  try {
    let cols = sqlite.prepare('PRAGMA table_info(users)').all();
    if (!cols.some((c) => c.name === 'password_hash')) sqlite.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
    if (!cols.some((c) => c.name === 'is_admin')) sqlite.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    cols = sqlite.prepare('PRAGMA table_info(users)').all();
    if (!cols.some((c) => c.name === 'about')) sqlite.exec('ALTER TABLE users ADD COLUMN about TEXT');
    if (!cols.some((c) => c.name === 'last_seen_at')) sqlite.exec('ALTER TABLE users ADD COLUMN last_seen_at INTEGER');
    cols = sqlite.prepare('PRAGMA table_info(messages)').all();
    if (!cols.some((c) => c.name === 'reply_to_id')) sqlite.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER');
    if (!cols.some((c) => c.name === 'edited_at')) sqlite.exec('ALTER TABLE messages ADD COLUMN edited_at INTEGER');
    if (!cols.some((c) => c.name === 'deleted_at')) sqlite.exec('ALTER TABLE messages ADD COLUMN deleted_at INTEGER');
    sqlite.exec('CREATE TABLE IF NOT EXISTS message_hidden (user_id INTEGER NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY (user_id, message_id))');
    sqlite.exec('CREATE TABLE IF NOT EXISTS read_receipts (user_id INTEGER NOT NULL, other_user_id INTEGER NOT NULL, last_read_message_id INTEGER NOT NULL DEFAULT 0, read_at INTEGER DEFAULT (strftime(\'%s\', \'now\')), PRIMARY KEY (user_id, other_user_id))');
  } catch (_) {}

  ready = Promise.resolve();

  db = {
    ready,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        run: (...args) => Promise.resolve(stmt.run(...args)),
        get: (...args) => Promise.resolve(stmt.get(...args)),
        all: (...args) => Promise.resolve(stmt.all(...args)),
      };
    },
  };
}

module.exports = db;
