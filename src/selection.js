import { recordChange, undo, redo } from './history-ui.js';
import * as THREE from 'three';
import { t } from './i18n.js';
import { pieces, analysisState, state } from './state.js';
import { showToast } from './ui.js';
import { viewport, renderer, scene, camera, orbit, gizmo, raycaster, rayFromEvent } from './scene.js';
import { refreshPoints, removePiece, duplicatePiece } from './pieces.js';
import { renderList, renderProps, updateStatus } from './panels.js';
import { scheduleAnalysis } from './analysis-ui.js';
import { showGhostRow } from './ghost-ui.js';

gizmo.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  // Scaling changes the volume, so the observation count has to be recomputed
  if (!e.value && state.selection.length) {
    recordChange();
    state.selection.forEach(refreshPoints);
    if (gizmo.object === pivot) capturePivot();
    renderList();
    renderProps();
    updateStatus();
  }
});
gizmo.addEventListener('objectChange', () => {
  if (gizmo.object === pivot) applyPivot();
  scheduleAnalysis();
});
// With several pieces selected the gizmo drives an invisible pivot at their centre,
// and every piece follows the pivot's change since the drag started
export const pivot = new THREE.Object3D();
scene.add(pivot);
let pivotStart = null;

export function capturePivot() {
  pivot.updateMatrixWorld();
  pivotStart = {
    inverse: pivot.matrixWorld.clone().invert(),
    members: state.selection.map((p) => {
      p.mesh.updateMatrixWorld();
      return { mesh: p.mesh, matrix: p.mesh.matrixWorld.clone() };
    }),
  };
}

export function applyPivot() {
  if (!pivotStart) return;
  pivot.updateMatrixWorld();
  const delta = pivot.matrixWorld.clone().multiply(pivotStart.inverse);
  const m = new THREE.Matrix4();
  for (const { mesh, matrix } of pivotStart.members) {
    m.multiplyMatrices(delta, matrix).decompose(mesh.position, mesh.quaternion, mesh.scale);
  }
}
// ---------------------------------------------------------------------------
// Selection and picking
// ---------------------------------------------------------------------------

// The given pieces plus everything grouped with them
export function withLinked(list) {
  const links = new Set(list.map((p) => p.link).filter(Boolean));
  return pieces.filter((p) => list.includes(p) || links.has(p.link));
}

export function setSelection(list, render = true) {
  state.selection = withLinked(list);
  state.selected = state.selection.length === 1 ? state.selection[0] : null;
  attachGizmo();
  document.getElementById('tool-duplicate').disabled = !state.selection.length;
  document.getElementById('tool-delete').disabled = !state.selection.length;
  if (!render) return;
  renderList();
  renderProps();
  if (analysisState.scope === 'selected') scheduleAnalysis();
}

export function select(piece) {
  setSelection(piece ? [piece] : []);
}

// Shift+click: add the piece (and its group) or take it out again
export function toggleSelection(piece) {
  const group = withLinked([piece]);
  const allIn = group.every((p) => state.selection.includes(p));
  setSelection(allIn ? state.selection.filter((p) => !group.includes(p)) : [...state.selection, ...group]);
}

export function attachGizmo() {
  pivotStart = null;
  if (!state.selection.length) gizmo.detach();
  else if (state.selection.length === 1) gizmo.attach(state.selection[0].mesh);
  else {
    pivot.position.set(0, 0, 0);
    for (const p of state.selection) pivot.position.add(p.mesh.position);
    pivot.position.divideScalar(state.selection.length);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
    capturePivot();
    gizmo.attach(pivot);
  }
}

// Ctrl+G: the pieces share the first selected piece's group name and move as one
export function groupSelection() {
  if (state.selection.length < 2) {
    showToast(t('toast.needTwo'));
    return;
  }
  const link = `g${++state.linkCounter}`;
  const name = state.selection[0].group;
  for (const p of state.selection) {
    p.link = link;
    p.group = name;
  }
  showToast(t('toast.grouped', { n: state.selection.length, name }));
  renderList();
  renderProps();
  scheduleAnalysis();
  recordChange();
}

// Ctrl+Shift+G: the pieces move on their own again; their group names stay
export function ungroupSelection() {
  if (!state.selection.some((p) => p.link)) return;
  for (const p of state.selection) p.link = null;
  showToast(t('toast.ungrouped'));
  renderList();
  renderProps();
  recordChange();
}

export function deleteSelection() {
  for (const p of [...state.selection]) removePiece(p);
  recordChange();
}

export function setMode(mode) {
  gizmo.setMode(mode);
  for (const b of document.querySelectorAll('#mode-buttons button')) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
}

let downAt = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  // Ignore camera drags and clicks on the gizmo handles; fingers wobble more than a mouse
  if (moved > (e.pointerType === 'mouse' ? 4 : 10) || gizmo.dragging || gizmo.axis) return;
  rayFromEvent(e);
  const hit = raycaster.intersectObjects(pieces.map((p) => p.mesh), false)[0]?.object.userData.piece;
  if (e.shiftKey || state.multiSelect) {
    if (hit) toggleSelection(hit);
  } else select(hit ?? null);
  // There is no hover on a touch screen, so a tap on a ghost point shows its row instead
  if (e.pointerType !== 'mouse') showGhostRow(hit ? null : e);
});

// Shift + drag draws a selection box. Listening in the capture phase on the parent
// lets us switch the camera controls off before they see the pointerdown.
export const marquee = document.getElementById('marquee');
let box = null;
viewport.addEventListener(
  'pointerdown',
  (e) => {
    if (!e.shiftKey || e.button !== 0 || gizmo.axis) return;
    orbit.enabled = false;
    box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
  },
  true,
);
window.addEventListener('pointermove', (e) => {
  if (!box) return;
  box.x1 = e.clientX;
  box.y1 = e.clientY;
  const stage = viewport.getBoundingClientRect();
  Object.assign(marquee.style, {
    left: `${Math.min(box.x0, box.x1) - stage.left}px`,
    top: `${Math.min(box.y0, box.y1) - stage.top}px`,
    width: `${Math.abs(box.x1 - box.x0)}px`,
    height: `${Math.abs(box.y1 - box.y0)}px`,
  });
  marquee.hidden = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) < 4;
});
window.addEventListener('pointerup', () => {
  if (!box) return;
  const b = box;
  box = null;
  orbit.enabled = true;
  if (marquee.hidden) return; // too small: it was a Shift+click, handled above
  marquee.hidden = true;
  setSelection(piecesInRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.max(b.x0, b.x1), Math.max(b.y0, b.y1)));
});

// Pieces whose centre is inside a rectangle given in client (screen) coordinates
export function piecesInRect(left, top, right, bottom) {
  const rect = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3();
  return pieces.filter((p) => {
    const geo = p.mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    p.mesh.updateMatrixWorld();
    v.copy(geo.boundingSphere.center).applyMatrix4(p.mesh.matrixWorld).project(camera);
    if (v.z < -1 || v.z > 1) return false; // behind the camera
    const x = rect.left + ((v.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - v.y) / 2) * rect.height;
    return x >= left && x <= right && y >= top && y <= bottom;
  });
}

// Arrow keys nudge the selection while the 3D canvas has focus; one history step per key press
const NUDGE = { arrowleft: [-1, 0, 0], arrowright: [1, 0, 0], arrowup: [0, 0, -1], arrowdown: [0, 0, 1], pageup: [0, 1, 0], pagedown: [0, -1, 0] };
let nudged = false;
function nudge(e) {
  const dir = NUDGE[e.key.toLowerCase()];
  if (!dir || document.activeElement !== renderer.domElement || !state.selection.length) return false;
  e.preventDefault();
  const step = e.shiftKey ? 1 : 0.1;
  for (const p of state.selection) p.mesh.position.add(new THREE.Vector3(...dir).multiplyScalar(step));
  attachGizmo();
  scheduleAnalysis();
  nudged = true;
  return true;
}
window.addEventListener('keyup', (e) => {
  if (!nudged || !NUDGE[e.key.toLowerCase()]) return;
  nudged = false;
  recordChange();
  renderProps();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
  if (nudge(e)) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (k === 'z' && ctrl) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (k === 'y' && ctrl) {
    e.preventDefault();
    redo();
  } else if (k === 'd' && ctrl) {
    e.preventDefault();
    duplicateSelected();
  } else if (k === 'g' && ctrl) {
    // Overrides the browser's "find next"
    e.preventDefault();
    if (e.shiftKey) ungroupSelection();
    else groupSelection();
  } else if (k === 'a' && ctrl) {
    e.preventDefault();
    setSelection(pieces);
  } else if (ctrl || e.altKey) return;
  else if (k === 'w') setMode('translate');
  else if (k === 'e') setMode('rotate');
  else if (k === 'r') setMode('scale');
  else if (k === 'delete' || k === 'backspace') deleteSelection();
  else if (k === 'escape') select(null);
});

// Copies stay grouped with each other, not with the originals
export function duplicateSelected() {
  if (!state.selection.length) return;
  const newLinks = new Map();
  const copies = state.selection.map((p) => {
    if (p.link && !newLinks.has(p.link)) newLinks.set(p.link, `g${++state.linkCounter}`);
    return duplicatePiece(p, p.link ? newLinks.get(p.link) : null);
  });
  setSelection(copies);
  updateStatus();
  recordChange();
}
