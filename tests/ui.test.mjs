import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTextEntry } from '../src/ui.js';

// Minimal stand-ins for DOM elements: only what isTextEntry looks at
const node = (tagName, extra = {}) => ({ tagName, isContentEditable: false, ...extra });

test('text fields keep their own Ctrl+Z', () => {
  for (const type of ['text', 'number', 'search', 'url', 'email', '']) {
    assert.equal(isTextEntry(node('INPUT', { type })), true, type || 'no type');
  }
  assert.equal(isTextEntry(node('TEXTAREA')), true);
  assert.equal(isTextEntry(node('DIV', { isContentEditable: true })), true);
});

test('sliders, selects, checkboxes and colour pickers do not block app shortcuts', () => {
  for (const type of ['range', 'checkbox', 'color', 'radio', 'button']) {
    assert.equal(isTextEntry(node('INPUT', { type })), false, type);
  }
  assert.equal(isTextEntry(node('SELECT')), false);
  assert.equal(isTextEntry(node('BUTTON')), false);
  assert.equal(isTextEntry(null), false);
});
