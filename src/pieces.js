import * as THREE from 'three';
import { buildGeometry, pieceVolume } from './geometry.js';
import { samplePiece } from './sampling.js';
import { t, tAll, keyedError } from './i18n.js';
import { pieces, typeCounters, settings, state } from './state.js';
import { download } from './ui.js';
import { scene } from './scene.js';
import { setSelection, select, setMode } from './selection.js';
import { renderList, updateStatus } from './panels.js';
import { scheduleAnalysis } from './analysis-ui.js';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const COLORS = [
  { key: 'red', hex: '#e5383b' },
  { key: 'orange', hex: '#f48c2f' },
  { key: 'yellow', hex: '#f6c90e' },
  { key: 'green', hex: '#4caf50' },
  { key: 'blue', hex: '#2f80ed' },
  { key: 'purple', hex: '#8e5bd0' },
  { key: 'pink', hex: '#ff7eb6' },
  { key: 'brown', hex: '#8d5b3f' },
  { key: 'white', hex: '#f1ede4' },
];

// Dough type only changes how the dough looks; it has no effect on the data
export const DOUGH_TYPES = {
  classic: { roughness: 0.9, metalness: 0, clearcoat: 0 },
  glossy: { roughness: 0.3, metalness: 0, clearcoat: 1 },
  glitter: { roughness: 0.4, metalness: 0.6, clearcoat: 0.3 },
};

export const SHAPES = {
  ball: { params: { radius: 1 } },
  snake: { params: { length: 4, radius: 0.4, curvature: 0 } },
  slab: { params: { width: 4, depth: 3, thickness: 0.4, curvature: 0 } },
};

export const PARAM_SPECS = {
  radius: { min: 0.1, max: 3, step: 0.05 },
  length: { min: 0.5, max: 10, step: 0.1 },
  width: { min: 0.5, max: 10, step: 0.1 },
  depth: { min: 0.5, max: 10, step: 0.1 },
  thickness: { min: 0.1, max: 2, step: 0.05 },
  curvature: { min: 0, max: 1, step: 0.01 },
};

export const MAX_POINTS_PER_PIECE = 5000;

export const colorKey = (hex) => COLORS.find((c) => c.hex === hex.toLowerCase())?.key ?? 'custom';
export const colorName = (hex) => t(`color.${colorKey(hex)}`);
// True while a group label is still the default colour name, in any language
export const isDefaultGroup = (group, hex) => tAll(`color.${colorKey(hex)}`).includes(group);
export const pointColor = (hex) => new THREE.Color(hex).lerp(new THREE.Color('#000000'), 0.35);

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function setVec(target, value) {
  if (!value) return;
  if (Array.isArray(value)) target.fromArray(value);
  else target.copy(value);
}

export function createPiece(type, opts = {}) {
  typeCounters[type]++;
  const color = opts.color ?? COLORS[pieces.length % COLORS.length].hex;
  const piece = {
    type,
    name: opts.name ?? `${t(`shape.${type}`)} ${typeCounters[type]}`,
    group: opts.group ?? colorName(color),
    color,
    dough: DOUGH_TYPES[opts.dough] ? opts.dough : 'classic',
    texture: opts.texture ?? 0.2,
    params: { ...SHAPES[type].params, ...opts.params },
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    link: typeof opts.link === 'string' ? opts.link : null,
    count: 0,
    points: null,
  };

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.piece = piece;
  setVec(mesh.position, opts.position);
  setVec(mesh.rotation, opts.rotation);
  setVec(mesh.scale, opts.scale);
  piece.mesh = mesh;
  scene.add(mesh);
  pieces.push(piece);

  rebuildGeometry(piece);
  updateMaterial(piece);
  refreshPoints(piece);
  return piece;
}

export function rebuildGeometry(piece) {
  const old = piece.mesh.geometry;
  piece.mesh.geometry = buildGeometry(piece.type, { ...piece.params, texture: piece.texture });
  old.dispose();
}

export function updateMaterial(piece) {
  const look = DOUGH_TYPES[piece.dough];
  const m = piece.mesh.material;
  m.color.set(piece.color);
  m.roughness = look.roughness;
  m.metalness = look.metalness;
  m.clearcoat = look.clearcoat;
  m.clearcoatRoughness = 0.15;
  if (piece.points) piece.points.material.color.copy(pointColor(piece.color));
  applyView(piece);
}

export function applyView(piece) {
  const m = piece.mesh.material;
  const seeThrough = settings.view === 'both';
  m.transparent = seeThrough;
  m.opacity = seeThrough ? 0.25 : 1;
  m.depthWrite = !seeThrough;
  // Hide via the material, not the mesh, so the child point cloud stays visible
  m.visible = settings.view !== 'points';
  m.needsUpdate = true;
  if (piece.points) piece.points.visible = settings.view !== 'dough';
}

// Samples observations from inside the piece; count is proportional to its scaled volume
export function refreshPoints(piece) {
  const s = piece.mesh.scale;
  const volume = pieceVolume(piece.type, piece.params) * Math.abs(s.x * s.y * s.z);
  const count = Math.min(MAX_POINTS_PER_PIECE, Math.max(1, Math.round(settings.density * volume)));
  const positions = samplePiece(piece.type, piece.params, piece.texture, count, piece.seed);

  if (piece.points) {
    piece.mesh.remove(piece.points);
    piece.points.geometry.dispose();
    piece.points.material.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: pointColor(piece.color), size: 5, sizeAttenuation: false });
  piece.points = new THREE.Points(geo, mat);
  piece.mesh.add(piece.points);
  piece.count = count;
  applyView(piece);
  scheduleAnalysis();
}

export function removePiece(piece) {
  if (state.selection.includes(piece)) setSelection(state.selection.filter((p) => p !== piece), false);
  scene.remove(piece.mesh);
  piece.mesh.geometry.dispose();
  piece.mesh.material.dispose();
  piece.points.geometry.dispose();
  piece.points.material.dispose();
  pieces.splice(pieces.indexOf(piece), 1);
  // A group of one is no group
  const rest = pieces.filter((p) => piece.link && p.link === piece.link);
  if (rest.length === 1) rest[0].link = null;
  renderList();
  updateStatus();
  scheduleAnalysis();
}

export function duplicatePiece(piece, link = null) {
  const m = piece.mesh;
  return createPiece(piece.type, {
    link,
    name: t('props.copy', { name: piece.name }),
    group: piece.group,
    color: piece.color,
    dough: piece.dough,
    texture: piece.texture,
    params: { ...piece.params },
    position: m.position.clone().add(new THREE.Vector3(0.6, 0, 0.6)),
    rotation: m.rotation.clone(),
    scale: m.scale.clone(),
  });
}

export function addPiece(type) {
  const p = SHAPES[type].params;
  const restHeight = type === 'slab' ? p.thickness / 2 : p.radius;
  const piece = createPiece(type, {
    position: [(Math.random() - 0.5) * 6, restHeight + 0.05, (Math.random() - 0.5) * 4],
  });
  setMode('translate');
  select(piece);
  updateStatus();
}

export function clearScene() {
  while (pieces.length) removePiece(pieces[0]);
  for (const k in typeCounters) typeCounters[k] = 0;
}

// ---------------------------------------------------------------------------
// Data export and scene files
// ---------------------------------------------------------------------------

export const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function exportCSV() {
  const rows = ['x,y,z,group,piece,shape,dough'];
  const v = new THREE.Vector3();
  for (const p of pieces) {
    p.mesh.updateMatrixWorld();
    const arr = p.points.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(p.mesh.matrixWorld);
      rows.push([v.x.toFixed(4), v.y.toFixed(4), v.z.toFixed(4), csvCell(p.group), csvCell(p.name), p.type, p.dough].join(','));
    }
  }
  download('doughlab-data.csv', rows.join('\n'), 'text/csv');
}

export function serializeScene() {
  return {
    app: 'doughlab',
    version: 1,
    density: settings.density,
    pieces: pieces.map((p) => ({
      type: p.type,
      name: p.name,
      group: p.group,
      color: p.color,
      dough: p.dough,
      texture: p.texture,
      seed: p.seed,
      ...(p.link ? { link: p.link } : {}),
      params: p.params,
      position: p.mesh.position.toArray(),
      rotation: p.mesh.rotation.toArray(),
      scale: p.mesh.scale.toArray(),
    })),
  };
}

export function loadScene(data) {
  if (data?.app !== 'doughlab' || !Array.isArray(data.pieces)) throw keyedError('err.notScene');
  clearScene();
  if (typeof data.density === 'number') setDensity(data.density);
  for (const d of data.pieces) {
    if (!SHAPES[d.type]) continue;
    const params = {};
    for (const k of Object.keys(SHAPES[d.type].params)) {
      if (typeof d.params?.[k] === 'number') params[k] = d.params[k];
    }
    createPiece(d.type, { ...d, params });
  }
  // New groups must not reuse an id from the file
  state.linkCounter = Math.max(0, ...pieces.map((p) => parseInt(p.link?.slice(1), 10) || 0));
  select(null);
  updateStatus();
}

// Mirrors the structures read off the Gapminder 3D PCA plot in class
export const exampleScene = () => ({
  app: 'doughlab',
  version: 1,
  density: 60,
  pieces: [
    { type: 'slab', name: t('example.main'), group: t('example.main'), color: '#2f80ed', texture: 0.25,
      params: { width: 7, depth: 4.5, thickness: 0.6, curvature: 0 }, position: [0, 1.4, 0], rotation: [0, 0, 0.22] },
    { type: 'snake', name: t('example.trail'), group: t('example.trailGroup'), color: '#e5383b', texture: 0.15,
      params: { length: 6, radius: 0.22, curvature: 0 }, position: [0.2, 2.8, -2.9], rotation: [0, 0.15, 0.22] },
    { type: 'snake', name: t('example.china'), group: t('example.china'), color: '#f6c90e', texture: 0.1,
      params: { length: 3.2, radius: 0.25, curvature: 0.45 }, position: [-1.8, 2.6, 1.6], rotation: [0.3, 0.6, 0.5] },
    { type: 'snake', name: t('example.india'), group: t('example.india'), color: '#4caf50', texture: 0.1,
      params: { length: 3.2, radius: 0.25, curvature: 0.35 }, position: [-1.0, 2.3, 2.5], rotation: [0.3, 0.4, 0.4] },
    { type: 'ball', name: t('example.kuwait'), group: t('example.kuwait'), color: '#8e5bd0', texture: 0.6,
      params: { radius: 0.7 }, position: [4.2, 3.8, 1.8], rotation: [0, 0, 0] },
  ],
});

export const densityInput = document.getElementById('density');
export function setDensity(v) {
  settings.density = v;
  densityInput.value = v;
  document.getElementById('density-value').textContent = v;
}
