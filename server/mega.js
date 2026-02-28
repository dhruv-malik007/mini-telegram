/**
 * MEGA cloud storage as data lake for media (photos/videos).
 * Set MEGA_EMAIL and MEGA_PASSWORD in .env to enable.
 */
const path = require('path');
const nodeCrypto = require('crypto');

// megajs requires globalThis.crypto.getRandomValues and .subtle — set them right before loading megajs
(function ensureCrypto() {
  const webcrypto = nodeCrypto.webcrypto;
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    globalThis.crypto = webcrypto;
    return;
  }
  const fallback = {
    getRandomValues(arr) {
      nodeCrypto.randomFillSync(arr);
      return arr;
    },
  };
  if (webcrypto && webcrypto.subtle) fallback.subtle = webcrypto.subtle;
  globalThis.crypto = fallback;
})();

const { Storage } = require('megajs');

const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

let storagePromise = null;

function getStorage() {
  if (!MEGA_EMAIL || !MEGA_PASSWORD) return null;
  if (!storagePromise) {
    storagePromise = new Promise((resolve, reject) => {
      const storage = new Storage({
        email: MEGA_EMAIL,
        password: MEGA_PASSWORD,
      });
      storage.ready
        .then(() => resolve(storage))
        .catch(reject);
    });
  }
  return storagePromise;
}

function isEnabled() {
  return Boolean(MEGA_EMAIL && MEGA_PASSWORD);
}

/**
 * Upload buffer to MEGA and return public link.
 * @param {Buffer} buffer
 * @param {string} filename - original filename (used for extension)
 * @returns {Promise<{ url: string }>}
 */
async function uploadBuffer(buffer, filename) {
  const storage = await getStorage();
  if (!storage) throw new Error('MEGA storage not configured (set MEGA_EMAIL and MEGA_PASSWORD)');
  const ext = (filename && path.extname(filename)) || '';
  const name = `mt-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadStream = storage.upload({ name, size: buffer.length }, buffer);
  const file = await uploadStream.complete;
  const link = await file.link();
  return { url: link };
}

module.exports = { isEnabled, uploadBuffer };
