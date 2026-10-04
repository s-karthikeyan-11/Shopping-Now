const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Package = require('../models/Package');
const Evidence = require('../models/Evidence');

test('user schema supports only marketplace roles', () => {
  const deliveryUser = new User({ name: 'Delivery', email: 'delivery@example.com', password: 'password123', role: 'delivery' });
  assert.equal(deliveryUser.validateSync(), undefined);

  const invalidUser = new User({ name: 'Invalid', email: 'invalid@example.com', password: 'password123', role: 'superuser' });
  assert.ok(invalidUser.validateSync()?.errors?.role);
});

test('package and evidence schemas require integrity and ownership fields', () => {
  const pkg = new Package({ packageId: 'PKG-2026-UNIT', status: 'Packing' });
  const packageError = pkg.validateSync();
  assert.ok(packageError.errors.order);
  assert.ok(packageError.errors.seller);
  assert.ok(packageError.errors.qrTokenHash);
  assert.ok(packageError.errors.deliveryPinHash);

  const evidence = new Evidence({ sha256: 'not-a-sha256' });
  const evidenceError = evidence.validateSync();
  assert.ok(evidenceError.errors.order);
  assert.ok(evidenceError.errors.package);
  assert.ok(evidenceError.errors.sha256);
});
