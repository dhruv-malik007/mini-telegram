/**
 * Cloudinary as data lake for media (photos/videos).
 * Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env to enable.
 */
const cloudinary = require('cloudinary').v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

function isEnabled() {
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Upload buffer to Cloudinary and return public URL.
 * @param {Buffer} buffer
 * @param {string} filename - original filename (used for extension)
 * @param {string} [mimetype] - MIME type (e.g. image/jpeg, video/mp4)
 * @returns {Promise<{ url: string }>}
 */
async function uploadBuffer(buffer, filename, mimetype) {
  if (!isEnabled()) {
    throw new Error('Cloudinary not configured (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
  }

  const isVideo = /^video\//.test(mimetype || '') || /\.(mp4|webm|mov)$/i.test(filename || '');
  const resourceType = isVideo ? 'video' : 'image';
  const publicId = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}`.replace(/[^a-zA-Z0-9._-]/g, '_');

  const dataUri = `data:${mimetype || (isVideo ? 'video/mp4' : 'image/jpeg')};base64,${buffer.toString('base64')}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: resourceType,
    public_id: publicId,
    overwrite: true,
  });

  return { url: result.secure_url };
}

module.exports = { isEnabled, uploadBuffer };
