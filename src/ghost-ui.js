import * as THREE from 'three';
import { Ghost, parseCSV, describeColumns, buildGhostData, fitScores } from './ghost.js';
import { t, pct, errorText, keyedError } from './i18n.js';
import { pieces, ghostState } from './state.js';
import { el, selectField, withBold, checkbox } from './ui.js';
import { viewport, renderer, scene, camera, orbit, gizmo, raycaster, rayFromEvent } from './scene.js';
import { collectWorldPoints } from './analysis-ui.js';

// ---------------------------------------------------------------------------
// Ghost data: a CSV reduced to 3D with PCA, shown as a translucent cloud to sculpt over
// ---------------------------------------------------------------------------

export const GAPMINDER_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/gapminderDataFiveYear.csv';
export const GHOST_MAX_ROWS = 20000;
export const ghost = new Ghost(scene);

export function loadGhostTable(text, fileName) {
  const table = parseCSV(text);
  if (!table.header.length || !table.rows.length) throw keyedError('err.csvEmpty');
  const truncated = table.rows.length > GHOST_MAX_ROWS;
  if (truncated) table.rows = table.rows.slice(0, GHOST_MAX_ROWS);
  const info = describeColumns(table);
  const numeric = info.filter((c) => c.numeric);
  if (numeric.length < 3) throw keyedError('err.needNumeric');
  Object.assign(ghostState, {
    table,
    fileName,
    truncated,
    columnsInfo: info,
    columns: numeric.map((c) => c.index),
    // Default colouring: the first text column with a handful of categories (e.g. continent)
    colorBy: info.find((c) => !c.numeric && c.unique >= 2 && c.unique <= 12)?.index ?? -1,
    visible: true,
  });
  rebuildGhost();
  frameGhost();
}

// Moves the camera onto the bulk of the ghost cloud, keeping the current viewing direction.
// Frames 95% of the points so a few far outliers don't shrink the main body.
export function frameGhost() {
  const d = ghostState.data;
  if (!d) return;
  const pos = d.positions, n = pos.length / 3;
  const center = new THREE.Vector3();
  for (let i = 0; i < n; i++) center.x += pos[i * 3], center.y += pos[i * 3 + 1], center.z += pos[i * 3 + 2];
  center.divideScalar(n);
  const dist = Float64Array.from({ length: n }, (_, i) =>
    Math.hypot(pos[i * 3] - center.x, pos[i * 3 + 1] - center.y, pos[i * 3 + 2] - center.z),
  ).sort();
  const radius = dist[Math.floor(n * 0.95)] * 1.5;
  const dir = camera.position.clone().sub(orbit.target).normalize();
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
  orbit.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, distance);
}

export function rebuildGhost() {
  const s = ghostState;
  s.data = null;
  s.error = '';
  ghost.clear();
  if (s.columns.length >= 3) {
    try {
      s.data = buildGhostData(s.table, s);
      ghost.setData(s.data);
      ghost.setVisible(s.visible);
      ghost.setArrowsVisible(s.arrows);
    } catch (err) {
      s.error = errorText(err);
    }
  }
  renderGhostSettings();
  updateGhostFit();
}

export function renderGhostSettings() {
  const box = document.getElementById('ghost-settings');
  box.replaceChildren();
  const s = ghostState;
  if (!s.table) return;

  const rowsNote = s.truncated ? t('ghost.firstRows', { n: GHOST_MAX_ROWS }) : '';
  box.append(el('p', { class: 'ghost-file' }, t('ghost.rows', { file: s.fileName, n: s.table.rows.length }) + rowsNote));

  const numeric = s.columnsInfo.filter((c) => c.numeric);
  const vars = el('div', { class: 'checks' });
  for (const c of numeric) {
    const input = el('input', { type: 'checkbox' });
    input.checked = s.columns.includes(c.index);
    input.addEventListener('change', () => {
      const chosen = new Set(s.columns);
      if (input.checked) chosen.add(c.index);
      else chosen.delete(c.index);
      s.columns = numeric.filter((col) => chosen.has(col.index)).map((col) => col.index);
      rebuildGhost();
    });
    vars.append(el('label', { title: c.name }, input, el('span', {}, c.name)));
  }
  box.append(el('div', { class: 'field' }, el('span', { class: 'field-head' }, t('ghost.vars')), vars));

  const colorOptions = new Map([['-1', { label: t('ghost.none') }]]);
  for (const c of s.columnsInfo) if (c.unique >= 2 && c.unique <= 20) colorOptions.set(String(c.index), { label: c.name });
  box.append(
    selectField(t('ghost.colorBy'), colorOptions, String(s.colorBy), (v) => {
      s.colorBy = parseInt(v, 10);
      rebuildGhost();
    }),
    checkbox(t('ghost.standardize'), s.standardize, (v) => {
      s.standardize = v;
      rebuildGhost();
    }),
    checkbox(t('ghost.log'), s.logSkewed, (v) => {
      s.logSkewed = v;
      rebuildGhost();
    }),
    checkbox(t('ghost.show'), s.visible, (v) => {
      s.visible = v;
      ghost.setVisible(v);
    }),
    checkbox(t('ghost.arrows'), s.arrows, (v) => {
      s.arrows = v;
      ghost.setArrowsVisible(v);
    }),
  );

  const d = s.data;
  if (!d) {
    box.append(el('p', { class: 'ghost-info' }, s.error || t('ghost.needVars')));
  } else {
    const info = el(
      'div',
      { class: 'ghost-info' },
      withBold(t('ghost.retained', { pct: '\u0000' }), pct(d.retained)),
      el('div', { class: 'muted' }, d.ratios.map((r, i) => `PC${i + 1} ${pct(r)}`).join(' · ')),
    );
    if (d.logged.length) info.append(el('div', { class: 'muted' }, t('ghost.logged', { cols: d.logged.join(', ') })));
    if (d.dropped) info.append(el('div', { class: 'muted' }, t('ghost.dropped', { n: d.dropped })));
    box.append(info);

    if (d.categories.length) {
      const legend = el('div', { class: 'legend' });
      for (const c of d.categories.slice(0, 20)) {
        const dot = el('i');
        dot.style.background = c.color;
        legend.append(el('span', {}, dot, c.name));
      }
      box.append(legend);
    }
    box.append(el('div', { id: 'ghost-fit' }));
  }

  const remove = el('button', { class: 'danger' }, t('ghost.remove'));
  remove.addEventListener('click', removeGhost);
  box.append(el('div', { class: 'btn-row' }, remove));
}

// Coverage and spill of the dough against the ghost, using all pieces
export function updateGhostFit() {
  const box = document.getElementById('ghost-fit');
  const d = ghostState.data;
  if (!box || !d) return;
  const { cols, n } = collectWorldPoints(pieces);
  if (!n) {
    box.replaceChildren(el('p', { class: 'hint' }, t('fit.addDough')));
    return;
  }
  const { coverage, spill } = fitScores(d.positions, cols, d.span * 0.05);
  const row = (label, v, cls, title) => {
    const fill = el('span');
    fill.style.width = `${(v * 100).toFixed(1)}%`;
    return el('div', { class: `fit-row ${cls}`, title }, el('span', {}, label), el('span', { class: 'pc-bar' }, fill), el('b', {}, pct(v)));
  };
  box.replaceChildren(
    el('div', { class: 'field-head' }, t('fit.title')),
    row(t('fit.coverage'), coverage, '', t('fit.coverageTitle')),
    row(t('fit.spill'), spill, 'spill', t('fit.spillTitle')),
    el('p', { class: 'hint' }, t('fit.hint')),
  );
}

// Hovering a ghost point shows its CSV row
export const tooltip = document.getElementById('tooltip');
let hoverEvent = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!hoverEvent) requestAnimationFrame(updateHover);
  hoverEvent = e;
});
renderer.domElement.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});

export function updateHover() {
  const e = hoverEvent;
  hoverEvent = null;
  // Touch "moves" are drags; a tap is handled on pointerup instead
  if (e.pointerType !== 'mouse') return;
  showGhostRow(e.buttons || gizmo.dragging ? null : e);
}

// Shows the CSV row of the ghost point under the pointer, or hides the tooltip (e = null)
export function showGhostRow(e) {
  if (!e || !ghostState.data || !ghostState.visible) {
    tooltip.hidden = true;
    return;
  }
  rayFromEvent(e);
  const row = ghost.pick(raycaster);
  if (row < 0) {
    tooltip.hidden = true;
    return;
  }
  const { header, rows } = ghostState.table;
  tooltip.replaceChildren(...header.slice(0, 8).map((h, i) => el('div', {}, el('b', {}, `${h}: `), rows[row][i] ?? '')));
  tooltip.hidden = false;
  const rect = viewport.getBoundingClientRect();
  let left = e.clientX - rect.left + 14;
  if (left + tooltip.offsetWidth > rect.width - 8) left = e.clientX - rect.left - 14 - tooltip.offsetWidth;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${e.clientY - rect.top + 14}px`;
}

export const ghostFile = document.getElementById('ghost-file');
document.getElementById('ghost-load').addEventListener('click', () => ghostFile.click());
ghostFile.addEventListener('change', async () => {
  const file = ghostFile.files[0];
  ghostFile.value = '';
  if (!file) return;
  try {
    loadGhostTable(await file.text(), file.name);
  } catch (err) {
    alert(t('err.csvOpen', { msg: errorText(err) }));
  }
});

export function removeGhost() {
  ghost.clear();
  Object.assign(ghostState, { table: null, data: null });
  tooltip.hidden = true;
  renderGhostSettings();
}

export const gapminderButton = document.getElementById('ghost-gapminder');
gapminderButton.addEventListener('click', loadGapminder);

// Fetches the Gapminder sample and shows it as the ghost
export async function loadGapminder() {
  gapminderButton.disabled = true;
  gapminderButton.textContent = t('ghost.loading');
  try {
    const res = await fetch(GAPMINDER_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadGhostTable(await res.text(), 'gapminderDataFiveYear.csv');
  } catch (err) {
    alert(t('err.gapminder', { msg: errorText(err) }));
  } finally {
    gapminderButton.disabled = false;
    gapminderButton.textContent = t('ghost.gapminder');
  }
}
