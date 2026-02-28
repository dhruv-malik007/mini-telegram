/**
 * Simple in-memory TTL cache for API responses.
 * No external dependencies.
 */

const store = new Map();

/**
 * Get cached value if not expired.
 * @param {string} key
 * @returns {*} cached value or null
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set cached value with TTL in seconds.
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds
 */
function set(key, value, ttlSeconds = 10) {
  store.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Invalidate cache entries matching a prefix (e.g. "me:123" invalidates "me:123").
 * @param {string} keyOrPrefix - exact key or prefix (we delete keys that start with this)
 */
function invalidate(keyOrPrefix) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix + ':')) {
      store.delete(key);
    }
  }
}

/**
 * Invalidate all cache entries for a user (e.g. when they update profile).
 * @param {number} userId
 */
function invalidateUser(userId) {
  invalidate(`me:${userId}`);
  invalidate(`users:${userId}`);
}

/** Canonical key for a conversation (order-independent) */
function convKey(a, b) {
  return `conv:${Math.min(a, b)}:${Math.max(a, b)}`;
}

const MESSAGE_CACHE_SIZE = 50;
const messageStore = new Map();
const convTTL = 5 * 60 * 1000; // 5 minutes

/** Get cached last N messages for conversation */
function getConvMessages(userId, otherId) {
  const key = convKey(userId, otherId);
  const entry = messageStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    messageStore.delete(key);
    return null;
  }
  return entry.messages;
}

/** Set cached messages (last 50, ASC order) */
function setConvMessages(userId, otherId, messages) {
  const key = convKey(userId, otherId);
  const trimmed = Array.isArray(messages) ? messages.slice(-MESSAGE_CACHE_SIZE) : [];
  messageStore.set(key, {
    messages: trimmed,
    expiry: Date.now() + convTTL,
  });
}

/** Append new message to cache (e.g. from socket) */
function appendConvMessage(senderId, recipientId, message) {
  const key = convKey(senderId, recipientId);
  const entry = messageStore.get(key);
  if (!entry) return;
  const arr = [...entry.messages, message].filter((m) => !m.deleted_at);
  entry.messages = arr.slice(-MESSAGE_CACHE_SIZE);
  entry.expiry = Date.now() + convTTL;
}

/** Invalidate conversation cache (on edit/delete) */
function invalidateConv(userId, otherId) {
  messageStore.delete(convKey(userId, otherId));
}

/** Invalidate all conversation caches that include this user (e.g. when user is deleted) */
function invalidateConvsForUser(userId) {
  const id = Number(userId);
  if (isNaN(id)) return;
  for (const key of messageStore.keys()) {
    const m = key.match(/^conv:(\d+):(\d+)$/);
    if (m && (Number(m[1]) === id || Number(m[2]) === id)) {
      messageStore.delete(key);
    }
  }
}

module.exports = {
  get,
  set,
  invalidate,
  invalidateUser,
  getConvMessages,
  setConvMessages,
  appendConvMessage,
  invalidateConv,
  invalidateConvsForUser,
  MESSAGE_CACHE_SIZE,
};
