// Turns a CSV into a 3D "ghost" point cloud via PCA. No Three.js here, so it runs anywhere.
import { mean, pca } from './analysis.js';

export const GHOST_SPAN = 10; // PC1 is scaled to span this many scene units
const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
const NO_GROUP_COLOR = '#6b6158';

function detectDelimiter(firstLine) {
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. Detects , ; or tab.
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text.slice(0, text.indexOf('\n') >>> 0));
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.length > 1 || r[0].trim() !== '');
  const header = (nonEmpty.shift() ?? []).map((h, i) => h.trim() || `sütun ${i + 1}`);
  return { header, rows: nonEmpty, delimiter };
}

// Semicolon CSVs (e.g. Turkish Excel exports) usually use a decimal comma
export function parseNumber(s, delimiter) {
  if (s === undefined) return NaN;
  const t = s.trim();
  if (t === '') return NaN;
  return Number(delimiter === ',' ? t : t.replace(',', '.'));
}

export function describeColumns(table) {
  return table.header.map((name, index) => {
    let filled = 0, numeric = 0;
    const unique = new Set();
    for (const r of table.rows) {
      const v = (r[index] ?? '').trim();
      if (v === '') continue;
      filled++;
      if (Number.isFinite(parseNumber(v, table.delimiter))) numeric++;
      if (unique.size <= 50) unique.add(v);
    }
    return { name, index, numeric: filled > 0 && numeric >= 0.95 * filled, unique: unique.size };
  });
}

export function skewness(a) {
  const m = mean(a);
  let m2 = 0, m3 = 0;
  for (const v of a) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= a.length;
  m3 /= a.length;
  return m2 > 0 ? m3 / m2 ** 1.5 : 0;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// columns: indices of numeric columns to use (at least 3); colorBy: column index or -1
export function buildGhostData(table, { columns, colorBy, standardize, logSkewed }) {
  const { header, rows, delimiter } = table;

  // Listwise deletion: keep rows where every chosen variable is a number
  const keep = [];
  const X = columns.map(() => []);
  rows.forEach((r, i) => {
    const vals = columns.map((c) => parseNumber(r[c], delimiter));
    if (vals.every(Number.isFinite)) {
      keep.push(i);
      vals.forEach((v, j) => X[j].push(v));
    }
  });
  const n = keep.length;
  if (n < 3) throw new Error('Seçilen sütunlarda eksiksiz en az 3 satır gerekli.');

  const logged = [];
  if (logSkewed) {
    X.forEach((col, j) => {
      let min = Infinity;
      for (const v of col) min = Math.min(min, v);
      if (min > 0 && skewness(col) > 1) {
        for (let k = 0; k < n; k++) col[k] = Math.log10(col[k]);
        logged.push(header[columns[j]]);
      }
    });
  }

  // Centre every variable; standardising puts different units on equal footing
  for (const col of X) {
    const m = mean(col);
    let ss = 0;
    for (const v of col) ss += (v - m) ** 2;
    const sd = Math.sqrt(ss / (n - 1));
    const div = standardize && sd > 0 ? sd : 1;
    for (let k = 0; k < n; k++) col[k] = (col[k] - m) / div;
  }

  const { components } = pca(X);
  const top = components.slice(0, 3);
  const scores = top.map(({ vector }) => {
    const s = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let t = 0;
      for (let j = 0; j < X.length; j++) t += vector[j] * X[j][k];
      s[k] = t;
    }
    return s;
  });

  let lo = Infinity, hi = -Infinity;
  for (const v of scores[0]) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const scale = hi > lo ? GHOST_SPAN / (hi - lo) : 1;

  // Scene mapping: PC1 → x, PC2 → z (the floor), PC3 → y (up); lifted to sit above the ground
  let minY = Infinity;
  for (const v of scores[2]) minY = Math.min(minY, v * scale);
  const lift = 0.3 - minY;
  const positions = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    positions[k * 3] = scores[0][k] * scale;
    positions[k * 3 + 1] = scores[2][k] * scale + lift;
    positions[k * 3 + 2] = scores[1][k] * scale;
  }

  // sRGB colour per point; the renderer converts to linear
  const categories = [];
  const colors = new Float32Array(n * 3);
  if (colorBy >= 0) {
    const lookup = new Map();
    keep.forEach((rowIdx, k) => {
      const name = (rows[rowIdx][colorBy] ?? '').trim() || '(boş)';
      if (!lookup.has(name)) {
        const color = PALETTE[lookup.size % PALETTE.length];
        lookup.set(name, hexToRgb(color));
        categories.push({ name, color });
      }
      colors.set(lookup.get(name), k * 3);
    });
  } else {
    const rgb = hexToRgb(NO_GROUP_COLOR);
    for (let k = 0; k < n; k++) colors.set(rgb, k * 3);
  }

  // Variable loadings in the same scene mapping (biplot arrows)
  const loadings = columns.map((c, j) => ({
    name: header[c],
    dir: [top[0].vector[j], top[2].vector[j], top[1].vector[j]],
  }));

  return {
    positions,
    colors,
    rowIndex: Int32Array.from(keep),
    ratios: top.map((c) => c.ratio),
    retained: top.reduce((t, c) => t + c.ratio, 0),
    loadings,
    logged,
    categories,
    dropped: rows.length - n,
    center: [0, lift, 0],
    span: GHOST_SPAN,
  };
}

function cellKey(x, y, z, cell) {
  return `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
}

function buildGrid(xs, ys, zs, cell) {
  const grid = new Map();
  for (let i = 0; i < xs.length; i++) {
    const key = cellKey(xs[i], ys[i], zs[i], cell);
    let list = grid.get(key);
    if (!list) grid.set(key, (list = []));
    list.push(i);
  }
  return grid;
}

function hasNeighbor(grid, xs, ys, zs, x, y, z, r) {
  const cx = Math.floor(x / r), cy = Math.floor(y / r), cz = Math.floor(z / r);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!list) continue;
        for (const i of list) {
          if ((xs[i] - x) ** 2 + (ys[i] - y) ** 2 + (zs[i] - z) ** 2 <= r * r) return true;
        }
      }
    }
  }
  return false;
}

// How well the dough fits the ghost:
//   coverage: share of ghost points with a dough point within `radius`
//   spill: share of dough points with no ghost point within `radius`
export function fitScores(ghostPositions, doughCols, radius) {
  const gn = ghostPositions.length / 3;
  const gx = new Float64Array(gn), gy = new Float64Array(gn), gz = new Float64Array(gn);
  for (let i = 0; i < gn; i++) {
    gx[i] = ghostPositions[i * 3];
    gy[i] = ghostPositions[i * 3 + 1];
    gz[i] = ghostPositions[i * 3 + 2];
  }
  const [dx, dy, dz] = doughCols;
  const dn = dx.length;
  if (!dn) return { coverage: 0, spill: NaN };

  const doughGrid = buildGrid(dx, dy, dz, radius);
  let covered = 0;
  for (let i = 0; i < gn; i++) if (hasNeighbor(doughGrid, dx, dy, dz, gx[i], gy[i], gz[i], radius)) covered++;

  const ghostGrid = buildGrid(gx, gy, gz, radius);
  let spilled = 0;
  for (let i = 0; i < dn; i++) if (!hasNeighbor(ghostGrid, gx, gy, gz, dx[i], dy[i], dz[i], radius)) spilled++;

  return { coverage: covered / gn, spill: spilled / dn };
}
