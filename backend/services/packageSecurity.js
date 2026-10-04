const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const getKey = () => {
  const configured = process.env.PACKAGE_SECURITY_KEY;
  if (configured && /^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PACKAGE_SECURITY_KEY must be a 32-byte hexadecimal key in production');
  }
  if (!process.env.JWT_SECRET) throw new Error('Package security key is unavailable');
  return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
};

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
};

const decrypt = (value) => {
  const [iv, tag, ciphertext] = String(value || '').split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Package security data is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createVerificationToken = () => crypto.randomBytes(24).toString('base64url');
const createDeliveryPin = () => crypto.randomInt(100000, 1000000).toString();
const hashPin = (pin) => bcrypt.hash(pin, 12);
const matchesPin = (pin, hash) => bcrypt.compare(String(pin || ''), hash);

module.exports = {
  createDeliveryPin,
  createVerificationToken,
  decrypt,
  encrypt,
  hashPin,
  matchesPin,
  tokenHash,
};
