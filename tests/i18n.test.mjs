import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../src/i18n.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every key exists in both languages', () => {
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
});

test('placeholders match between languages', () => {
  for (const key of Object.keys(STRINGS.tr)) {
    assert.deepEqual(placeholders(STRINGS.en[key] ?? ''), placeholders(STRINGS.tr[key]), key);
  }
});
