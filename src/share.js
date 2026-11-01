// The Share button and opening a shared link
import { encodeShare, decodeShare, shareTokenFromHash } from './storage.js';
import { autosavePayload } from './autosave.js';
import { loadScene } from './pieces.js';
import { applyGhostDescriptor, removeGhost } from './ghost-ui.js';
import { recordChange } from './history-ui.js';
import { ghostState } from './state.js';
import { showToast, showLinkDialog } from './ui.js';
import { t, errorText } from './i18n.js';

const LONG_LINK = 8000;

export async function shareScene() {
  const url = `${location.origin}${location.pathname}#scene=${await encodeShare(autosavePayload())}`;
  const notes = [];
  if (ghostState.table && ghostState.source !== 'gapminder') notes.push(t('toast.sharedNoCsv'));
  if (url.length > LONG_LINK) notes.push(t('toast.longLink'));
  try {
    await navigator.clipboard.writeText(url);
    showToast([t('toast.shared'), ...notes].join(' '));
  } catch {
    showLinkDialog(url);
    if (notes.length) showToast(notes.join(' '));
  }
}

// Startup: a #scene=… link replaces the autosaved scene; one undo brings the autosave back
export async function openSharedLink() {
  const token = shareTokenFromHash(location.hash);
  if (!token) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const payload = await decodeShare(token);
    // Even an empty shared scene replaces what was there
    loadScene(payload.scene);
    if (payload.ghost) await applyGhostDescriptor(payload.ghost);
    else if (ghostState.table) removeGhost();
    recordChange();
  } catch (err) {
    showToast(errorText(err));
  }
}
