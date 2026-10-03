const crypto = require('crypto');

const getEncryptionKey = () => {
  const configuredKey = process.env.SELLER_PAYOUT_ENCRYPTION_KEY;
  if (configuredKey && /^[a-f0-9]{64}$/i.test(configuredKey)) return Buffer.from(configuredKey, 'hex');
  if (process.env.NODE_ENV === 'production') throw new Error('Seller payout encryption is not configured');
  if (!process.env.JWT_SECRET) throw new Error('Payout encryption key is unavailable');
  return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
};

const encryptPayoutAccount = (account) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(account), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString('base64')).join('.');
};

const decryptPayoutAccount = (profile) => {
  if (!profile?.payoutAccountEncrypted) return profile?.payoutAccount || {};
  const [ivValue, tagValue, ciphertextValue] = profile.payoutAccountEncrypted.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Seller payout account data is invalid');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
};

const storePayoutAccount = (profile, account) => {
  profile.payoutAccountEncrypted = encryptPayoutAccount(account);
  profile.payoutAccount = {
    bankName: account.bankName || '',
    accountHolderName: account.accountHolderName || '',
    accountNumber: '',
    ifscCode: account.ifscCode || '',
  };
};

const maskAccountNumber = (accountNumber) => {
  const value = String(accountNumber || '');
  return value ? `••••${value.slice(-4)}` : '';
};

module.exports = { decryptPayoutAccount, encryptPayoutAccount, maskAccountNumber, storePayoutAccount };
