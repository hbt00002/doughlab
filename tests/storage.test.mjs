import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveLocal, loadLocal, clearLocal } from '../src/storage.js';

// Minimal in-memory localStorage; individual tests swap in failing versions
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
});

test('saveLocal then loadLocal round-trips', () => {
  assert.equal(saveLocal('k', { a: 1, name: 'Çin' }), true);
  assert.deepEqual(loadLocal('k'), { a: 1, name: 'Çin' });
});

test('loadLocal returns null on bad JSON', () => {
  localStorage.setItem('k', '{oops');
  assert.equal(loadLocal('k'), null);
});

test('loadLocal returns null for a non-object value', () => {
  for (const raw of ['42', '"x"', 'null', '[1,2]']) {
    localStorage.setItem('k', raw);
    assert.equal(loadLocal('k'), null, raw);
  }
});

test('loadLocal returns null for a missing key', () => {
  assert.equal(loadLocal('missing'), null);
});

test('saveLocal swallows storage errors', () => {
  globalThis.localStorage = {
    ...memoryStorage(),
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(saveLocal('k', { a: 1 }), false);
});

test('loadLocal returns null when localStorage access throws', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(loadLocal('k'), null);
  assert.equal(saveLocal('k', {}), false);
  assert.doesNotThrow(() => clearLocal('k'));
  delete globalThis.localStorage;
});

test('clearLocal removes the value', () => {
  saveLocal('k', { a: 1 });
  clearLocal('k');
  assert.equal(loadLocal('k'), null);
});

import { encodeShare, decodeShare, shareTokenFromHash } from '../src/storage.js';

const sample = {
  v: 1,
  scene: { app: 'doughlab', version: 1, pieces: [{ type: 'ball', name: 'Çin', group: 'Ağaç İş', params: { radius: 0.7 } }] },
  ghost: null,
};

test('encodeShare/decodeShare round-trip a scene with Turkish text', async () => {
  assert.deepEqual(await decodeShare(await encodeShare(sample)), sample);
});

test('encoded token is URL-safe', async () => {
  assert.match(await encodeShare(sample), /^[01]\.[A-Za-z0-9_-]+$/);
});

test('decodeShare rejects garbage with err.badLink', async () => {
  for (const bad of ['zzz', '1.!!!', '', '1.', '0.bm90IGpzb24']) {
    await assert.rejects(decodeShare(bad), (err) => err.key === 'err.badLink', JSON.stringify(bad));
  }
});

test('decodeShare reads an uncompressed (0.) token', async () => {
  const raw = Buffer.from(JSON.stringify(sample), 'utf8').toString('base64url');
  assert.deepEqual(await decodeShare(`0.${raw}`), sample);
});

test('shareTokenFromHash extracts the token', () => {
  assert.equal(shareTokenFromHash('#scene=1.abc'), '1.abc');
  assert.equal(shareTokenFromHash('#x=1'), null);
  assert.equal(shareTokenFromHash(''), null);
});
