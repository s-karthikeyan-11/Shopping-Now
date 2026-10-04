const crypto = require('crypto');

const MAX_EVIDENCE_BYTES = Number.parseInt(process.env.EVIDENCE_UPLOAD_MAX_BYTES || '10485760', 10);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);

const storageConfigured = () => Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_EVIDENCE_UPLOAD_PRESET);

const cleanFilename = (value) => String(value || 'evidence').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'evidence';

const hasExpectedSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'video/mp4') return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mimeType === 'video/webm') return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  return false;
};

const validateUpload = ({ buffer, mimeType }) => {
  if (!Number.isSafeInteger(MAX_EVIDENCE_BYTES) || MAX_EVIDENCE_BYTES < 1024) {
    throw Object.assign(new Error('EVIDENCE_UPLOAD_MAX_BYTES is invalid'), { status: 500 });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw Object.assign(new Error('An evidence file is required'), { status: 400 });
  if (buffer.length > MAX_EVIDENCE_BYTES) throw Object.assign(new Error(`Evidence files must be at most ${MAX_EVIDENCE_BYTES} bytes`), { status: 413 });
  if (!ALLOWED_TYPES.has(mimeType)) throw Object.assign(new Error('Only JPEG, PNG, WebP, MP4, and WebM evidence files are allowed'), { status: 415 });
  if (!hasExpectedSignature(buffer, mimeType)) throw Object.assign(new Error('The uploaded file content does not match its media type'), { status: 415 });
};

const uploadEvidence = async ({ buffer, mimeType, filename, orderId, packageId }) => {
  validateUpload({ buffer, mimeType });
  if (!storageConfigured()) {
    throw Object.assign(new Error('Evidence storage is not configured. Set Cloudinary evidence variables before uploading files.'), { status: 503 });
  }

  const publicId = `${packageId}/${Date.now()}_${crypto.randomUUID()}`;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), cleanFilename(filename));
  form.append('upload_preset', process.env.CLOUDINARY_EVIDENCE_UPLOAD_PRESET);
  form.append('folder', `marketplace-evidence/${orderId}`);
  form.append('public_id', publicId);
  form.append('context', `order_id=${orderId}|package_id=${packageId}`);

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME)}/auto/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw Object.assign(new Error('Evidence storage could not be reached'), { status: 502 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url || !data.public_id) {
    throw Object.assign(new Error(data.error?.message || 'Evidence storage rejected the upload'), { status: 502 });
  }
  return {
    provider: 'cloudinary',
    publicId: data.public_id,
    secureUrl: data.secure_url,
    resourceType: ['image', 'video'].includes(data.resource_type) ? data.resource_type : 'raw',
  };
};

module.exports = { MAX_EVIDENCE_BYTES, storageConfigured, uploadEvidence, validateUpload };
