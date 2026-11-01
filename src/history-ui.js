// Connects the undo history to the scene: every recorded change stores a snapshot of all pieces
// plus the selection; undo / redo rebuild the scene from one.
import { createHistory } from './history.js';
import { pieces, state } from './state.js';
import { serializeScene, loadScene } from './pieces.js';
import { setSelection } from './selection.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

const history = createHistory(100);
const listeners = [];

// Called after any change to the scene, including undo / redo (autosave listens here)
export function onSceneChange(fn) {
  listeners.push(fn);
}

export function currentSnapshot() {
  return { scene: serializeScene(), selection: state.selection.map((p) => pieces.indexOf(p)) };
}

function changed() {
  document.getElementById('btn-undo').disabled = !history.canUndo();
  document.getElementById('btn-redo').disabled = !history.canRedo();
  for (const fn of listeners) fn();
}

// Starts a fresh history from the current scene (after startup restore)
export function resetHistory() {
  history.reset(currentSnapshot());
  changed();
}

export function recordChange() {
  if (history.commit(currentSnapshot())) changed();
}

function restore(snapshot) {
  loadScene(snapshot.scene);
  setSelection(snapshot.selection.map((i) => pieces[i]).filter(Boolean));
  changed();
}

export function undo() {
  const snapshot = history.undo();
  if (!snapshot) return;
  restore(snapshot);
  showToast(t('toast.undo'));
}

export function redo() {
  const snapshot = history.redo();
  if (!snapshot) return;
  restore(snapshot);
  showToast(t('toast.redo'));
}
