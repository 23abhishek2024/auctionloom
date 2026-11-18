const pool = require('../db');
const { AppError } = require('../utils/AppError');

/**
 * Upload Service
 * Stores uploaded images (auction pictures, commission receipts) in PostgreSQL and serves them back.
 *
 * Why the database and not the disk: the free Render instance loses its disk on every restart,
 * redeploy or sleep, so files saved there vanished after about 15 idle minutes. A real deployment
 * would use object storage (S3, Supabase Storage); a BYTEA column keeps this demo self-contained.
 *
 * Why the bytes are checked: the browser only *declares* a type. A file named evil.html sent as
 * "image/png" used to be saved as .html and served as a web page. Now the first bytes must be a
 * real JPEG/PNG/GIF/WEBP signature, the extension comes from that type (never from the file name),
 * and images are served with X-Content-Type-Options: nosniff.
 */

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// The image type the file's first bytes say it is, or null
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head = buffer.subarray(0, 6).toString('ascii');
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Save an uploaded file (from multer's memory storage) for `userId`.
 * Returns { id, url, mimeType, size }; url looks like /uploads/<uuid>.png
 */
async function saveImage(file, userId) {
  const detected = detectImageType(file && file.buffer);
  if (!detected || detected !== file.mimetype) {
    throw new AppError(400, 'The file is not a valid JPEG, PNG, WEBP or GIF image.');
  }

  const result = await pool.query(
    `INSERT INTO uploads (user_id, mime_type, size_bytes, data)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, detected, file.buffer.length, file.buffer]
  );
  const id = result.rows[0].id;
  return { id, url: `/uploads/${id}.${EXTENSION_BY_TYPE[detected]}`, mimeType: detected, size: file.buffer.length };
}

/**
 * The stored image for a file name like "<uuid>.png", or null if there is none.
 * Returns { mimeType, data }.
 */
async function getImage(fileName) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|gif|webp)$/i.exec(fileName || '');
  if (!match) return null;
  const result = await pool.query('SELECT mime_type, data FROM uploads WHERE id = $1', [match[1]]);
  if (result.rowCount === 0) return null;
  return { mimeType: result.rows[0].mime_type, data: result.rows[0].data };
}

module.exports = { saveImage, getImage, detectImageType };
