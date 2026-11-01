// Saves the scene (and a Gapminder ghost) in the browser after every change, and restores it on load.
import { saveLocal, loadLocal } from './storage.js';
import { serializeScene, loadScene } from './pieces.js';
import { ghostDescriptor, applyGhostDescriptor, onGhostChange } from './ghost-ui.js';
import { onSceneChange } from './history-ui.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

export const AUTOSAVE_KEY = 'doughlab-autosave';
const DEBOUNCE_MS = 500;
let timer = null;
// While the saved ghost is still being fetched, saving would overwrite it with "no ghost"
let restoring = false;

export function autosavePayload() {
  return { v: 1, scene: serializeScene(), ghost: ghostDescriptor() };
}

function scheduleSave() {
  if (restoring) return;
  clearTimeout(timer);
  timer = setTimeout(() => saveLocal(AUTOSAVE_KEY, autosavePayload()), DEBOUNCE_MS);
}

onSceneChange(scheduleSave);
onGhostChange(scheduleSave);

// Loads a saved payload ({ scene, ghost }); the scene is applied at once, the ghost when it arrives
export function applyPayload(payload) {
  let loaded = false;
  if (payload?.scene?.pieces?.length) {
    try {
      loadScene(payload.scene);
      loaded = true;
    } catch {
      // Not a scene we can read; start empty
    }
  }
  const ghost = payload?.ghost ? applyGhostDescriptor(payload.ghost) : Promise.resolve();
  return { loaded: loaded || !!payload?.ghost, ghost };
}

// Startup: brings back the previous session's work, if any
export function restoreAutosave() {
  const saved = loadLocal(AUTOSAVE_KEY);
  if (!saved) return;
  restoring = true;
  const { loaded, ghost } = applyPayload(saved);
  ghost.finally(() => {
    restoring = false;
  });
  if (loaded) showToast(t('toast.restored'));
}
