const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-only-used-by-local-unit-tests';

const {
  createDeliveryPin,
  createVerificationToken,
  decrypt,
  encrypt,
  hashPin,
  matchesPin,
  tokenHash,
} = require('../services/packageSecurity');

test('package verification token is high entropy and hash-stable', () => {
  const first = createVerificationToken();
  const second = createVerificationToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 32);
  assert.match(tokenHash(first), /^[a-f0-9]{64}$/);
  assert.equal(tokenHash(first), tokenHash(first));
});

test('package delivery PIN is a six-digit secret with bcrypt verification', async () => {
  const pin = createDeliveryPin();
  assert.match(pin, /^\d{6}$/);
  const hash = await hashPin(pin);
  assert.notEqual(hash, pin);
  assert.equal(await matchesPin(pin, hash), true);
  assert.equal(await matchesPin('000000', hash), false);
});

test('package token encryption authenticates and round-trips the plaintext', () => {
  const plaintext = createVerificationToken();
  const ciphertext = encrypt(plaintext);
  assert.notEqual(ciphertext, plaintext);
  assert.equal(decrypt(ciphertext), plaintext);

  const [iv, tag, payload] = ciphertext.split('.');
  const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decrypt([iv, tag, changedPayload].join('.')));
});
