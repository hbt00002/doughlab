import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/history.js';

const snap = (name) => ({ scene: { pieces: [name] }, selection: [] });

test('commit then undo returns the previous snapshot', () => {
  const h = createHistory();
  h.reset(snap('a'));
  h.commit(snap('b'));
  assert.deepEqual(h.undo(), snap('a'));
});

test('redo after undo returns the newer snapshot', () => {
  const h = createHistory();
  h.reset(snap('a'));
  h.commit(snap('b'));
  h.undo();
  assert.deepEqual(h.redo(), snap('b'));
  assert.equal(h.redo(), null);
});

test('commit of an identical snapshot is a no-op', () => {
  const h = createHistory();
  h.reset(snap('a'));
  assert.equal(h.commit(snap('a')), false);
  assert.equal(h.canUndo(), false);
});

test('a new commit clears the redo stack', () => {
  const h = createHistory();
  h.reset(snap('a'));
  h.commit(snap('b'));
  h.undo();
  h.commit(snap('c'));
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), snap('a'));
});

test('history keeps at most `limit` undo steps', () => {
  const h = createHistory(3);
  h.reset(snap(0));
  for (let i = 1; i <= 5; i++) h.commit(snap(i));
  assert.deepEqual(h.undo(), snap(4));
  assert.deepEqual(h.undo(), snap(3));
  assert.deepEqual(h.undo(), snap(2));
  assert.equal(h.undo(), null);
});

test('undo after reset-with-previous restores the previous scene', () => {
  // A shared link replacing the autosaved scene: reset with the autosave, commit the link
  const h = createHistory();
  h.reset(snap('autosave'));
  h.commit(snap('shared'));
  assert.deepEqual(h.undo(), snap('autosave'));
});

test('returned snapshots are copies, not live references', () => {
  const h = createHistory();
  const a = snap('a');
  h.reset(a);
  h.commit(snap('b'));
  const back = h.undo();
  back.scene.pieces.push('mutated');
  h.redo();
  assert.deepEqual(h.undo(), snap('a'));
});
