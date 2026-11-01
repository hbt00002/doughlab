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
