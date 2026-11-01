import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildGeometry, pieceVolume } from './geometry.js';
import { samplePiece, mulberry32 } from './sampling.js';
import { pca, pearson, spearman, kendall, etaSquared, linearRegression, projectedVarianceRatio } from './analysis.js';
import { makeArrow, placeArrow } from './arrows.js';
import { Ghost, parseCSV, describeColumns, buildGhostData, fitScores } from './ghost.js';
import { t, tAll, pct, setLang, getLang, errorText, keyedError } from './i18n.js';

// ---------------------------------------------------------------------------
// Language: ?lang=en in the URL, then the saved choice, then the browser language
// ---------------------------------------------------------------------------

const LANG_KEY = 'doughlab-lang';
function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch {
    // Storage can be blocked; fall back to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
setLang(initialLang());

const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const COLORS = [
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
const DOUGH_TYPES = {
  classic: { roughness: 0.9, metalness: 0, clearcoat: 0 },
  glossy: { roughness: 0.3, metalness: 0, clearcoat: 1 },
  glitter: { roughness: 0.4, metalness: 0.6, clearcoat: 0.3 },
};

const SHAPES = {
  ball: { params: { radius: 1 } },
  snake: { params: { length: 4, radius: 0.4, curvature: 0 } },
  slab: { params: { width: 4, depth: 3, thickness: 0.4, curvature: 0 } },
};

const PARAM_SPECS = {
  radius: { min: 0.1, max: 3, step: 0.05 },
  length: { min: 0.5, max: 10, step: 0.1 },
  width: { min: 0.5, max: 10, step: 0.1 },
  depth: { min: 0.5, max: 10, step: 0.1 },
  thickness: { min: 0.1, max: 2, step: 0.05 },
  curvature: { min: 0, max: 1, step: 0.01 },
};

const MAX_POINTS_PER_PIECE = 5000;

const colorKey = (hex) => COLORS.find((c) => c.hex === hex.toLowerCase())?.key ?? 'custom';
const colorName = (hex) => t(`color.${colorKey(hex)}`);
// True while a group label is still the default colour name, in any language
const isDefaultGroup = (group, hex) => tAll(`color.${colorKey(hex)}`).includes(group);
const pointColor = (hex) => new THREE.Color(hex).lerp(new THREE.Color('#000000'), 0.35);

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe9df');

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(9, 8, 12);

scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.2));
const SUN_HOME = new THREE.Vector3(6, 12, 8);
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.copy(SUN_HOME);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
sun.shadow.normalBias = 0.02;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(30, 30, '#b8ab97', '#d8cfc0');
grid.position.y = 0.001;
scene.add(grid);
scene.add(new THREE.AxesHelper(1.5));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 1.5, 0);

const gizmo = new TransformControls(camera, renderer.domElement);
// Bigger handles are easier to grab with a finger
gizmo.setSize(isTouch ? 1.4 : 0.9);
gizmo.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  // Scaling changes the volume, so the observation count has to be recomputed
  if (!e.value && selected) {
    refreshPoints(selected);
    renderList();
    updateStatus();
  }
});
gizmo.addEventListener('objectChange', () => scheduleAnalysis());
scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);

new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = viewport;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(viewport);

renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const pieces = [];
const typeCounters = { ball: 0, snake: 0, slab: 0 };
const settings = { density: 60, view: 'dough' };
let selected = null;

function setVec(target, value) {
  if (!value) return;
  if (Array.isArray(value)) target.fromArray(value);
  else target.copy(value);
}

function createPiece(type, opts = {}) {
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

function rebuildGeometry(piece) {
  const old = piece.mesh.geometry;
  piece.mesh.geometry = buildGeometry(piece.type, { ...piece.params, texture: piece.texture });
  old.dispose();
}

function updateMaterial(piece) {
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

function applyView(piece) {
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
function refreshPoints(piece) {
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

function removePiece(piece) {
  if (selected === piece) select(null);
  scene.remove(piece.mesh);
  piece.mesh.geometry.dispose();
  piece.mesh.material.dispose();
  piece.points.geometry.dispose();
  piece.points.material.dispose();
  pieces.splice(pieces.indexOf(piece), 1);
  renderList();
  updateStatus();
  scheduleAnalysis();
}

function duplicatePiece(piece) {
  const m = piece.mesh;
  return createPiece(piece.type, {
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

function addPiece(type) {
  const p = SHAPES[type].params;
  const restHeight = type === 'slab' ? p.thickness / 2 : p.radius;
  const piece = createPiece(type, {
    position: [(Math.random() - 0.5) * 6, restHeight + 0.05, (Math.random() - 0.5) * 4],
  });
  setMode('translate');
  select(piece);
  updateStatus();
}

function clearScene() {
  while (pieces.length) removePiece(pieces[0]);
  for (const k in typeCounters) typeCounters[k] = 0;
}

// ---------------------------------------------------------------------------
// Selection and picking
// ---------------------------------------------------------------------------

function select(piece) {
  selected = piece;
  if (piece) gizmo.attach(piece.mesh);
  else gizmo.detach();
  document.getElementById('tool-duplicate').disabled = !piece;
  document.getElementById('tool-delete').disabled = !piece;
  renderList();
  renderProps();
  if (analysisState.scope === 'selected') scheduleAnalysis();
}

function setMode(mode) {
  gizmo.setMode(mode);
  for (const b of document.querySelectorAll('#mode-buttons button')) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function rayFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

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
  const hit = raycaster.intersectObjects(pieces.map((p) => p.mesh), false)[0];
  select(hit ? hit.object.userData.piece : null);
  // There is no hover on a touch screen, so a tap on a ghost point shows its row instead
  if (e.pointerType !== 'mouse') showGhostRow(hit ? null : e);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'd' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    duplicateSelected();
  } else if (k === 'w') setMode('translate');
  else if (k === 'e') setMode('rotate');
  else if (k === 'r') setMode('scale');
  else if ((k === 'delete' || k === 'backspace') && selected) removePiece(selected);
  else if (k === 'escape') select(null);
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const fmt = (v) => Number(v).toFixed(2);

function slider(spec, value, onInput) {
  const out = el('output', {}, fmt(value));
  const input = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, value });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  return el('label', { class: 'field' }, el('span', { class: 'field-head' }, spec.label, out), input);
}

function textField(label, value, onInput) {
  const input = el('input', { type: 'text', value });
  input.addEventListener('input', () => onInput(input.value));
  return { node: el('label', { class: 'field' }, el('span', { class: 'field-head' }, label), input), input };
}

function selectField(label, options, value, onChange) {
  const select = el('select');
  // A Map keeps insertion order even for numeric-looking keys
  const entries = options instanceof Map ? [...options] : Object.entries(options);
  for (const [key, opt] of entries) {
    const o = el('option', { value: key }, opt.label);
    if (key === value) o.selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  return el('label', { class: 'field' }, el('span', { class: 'field-head' }, label), select);
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function renderList() {
  const list = document.getElementById('piece-list');
  list.replaceChildren();
  if (!pieces.length) {
    list.append(el('p', { class: 'empty' }, t('list.empty')));
    return;
  }
  for (const p of pieces) {
    const dot = el('span', { class: 'dot' });
    dot.style.background = p.color;
    const row = el(
      'button',
      { class: 'piece-row' + (p === selected ? ' active' : '') },
      dot,
      el('span', { class: 'pname' }, p.name),
      el('span', { class: 'pmeta' }, t('list.points', { n: p.count })),
    );
    row.addEventListener('click', () => select(p));
    list.append(row);
  }
}

function renderProps() {
  const box = document.getElementById('props');
  box.replaceChildren();
  if (!selected) {
    box.append(el('p', { class: 'empty' }, t('props.empty')));
    return;
  }
  const p = selected;
  const afterShapeChange = () => {
    rebuildGeometry(p);
    refreshPoints(p);
    renderList();
    updateStatus();
  };

  const name = textField(t('props.name'), p.name, (v) => {
    p.name = v;
    renderList();
  });
  const group = textField(t('props.group'), p.group, (v) => {
    p.group = v;
    scheduleAnalysis();
  });

  // Colour: preset play-dough swatches plus a free picker
  const swatches = el('div', { class: 'swatches' });
  const setColor = (hex) => {
    // Keep the group label in sync while it is still the default colour name
    if (isDefaultGroup(p.group, p.color)) {
      p.group = colorName(hex);
      group.input.value = p.group;
      scheduleAnalysis();
    }
    p.color = hex;
    updateMaterial(p);
    for (const s of swatches.querySelectorAll('.swatch')) s.classList.toggle('active', s.dataset.hex === hex);
    renderList();
  };
  for (const c of COLORS) {
    const s = el('button', { class: 'swatch' + (c.hex === p.color ? ' active' : ''), title: t(`color.${c.key}`), 'data-hex': c.hex });
    s.style.background = c.hex;
    s.addEventListener('click', () => setColor(c.hex));
    swatches.append(s);
  }
  const custom = el('input', { type: 'color', value: p.color, title: t('props.customColor') });
  custom.addEventListener('input', () => setColor(custom.value));
  swatches.append(custom);

  const doughOptions = new Map(Object.keys(DOUGH_TYPES).map((k) => [k, { label: t(`dough.${k}`) }]));
  box.append(
    name.node,
    group.node,
    el('div', { class: 'field' }, el('span', { class: 'field-head' }, t('props.color')), swatches),
    selectField(t('props.dough'), doughOptions, p.dough, (v) => {
      p.dough = v;
      updateMaterial(p);
    }),
    ...Object.keys(p.params).map((k) =>
      slider({ ...PARAM_SPECS[k], label: t(`param.${k}`) }, p.params[k], (v) => {
        p.params[k] = v;
        afterShapeChange();
      }),
    ),
    slider({ label: t('param.texture'), min: 0, max: 1, step: 0.01 }, p.texture, (v) => {
      p.texture = v;
      afterShapeChange();
    }),
  );

  const dup = el('button', {}, t('tool.duplicate'));
  dup.addEventListener('click', duplicateSelected);
  const del = el('button', { class: 'danger' }, t('tool.delete'));
  del.addEventListener('click', () => removePiece(p));
  box.append(el('div', { class: 'btn-row' }, dup, del));
}

function duplicateSelected() {
  if (!selected) return;
  select(duplicatePiece(selected));
  updateStatus();
}

function updateStatus() {
  const total = pieces.reduce((n, p) => n + p.count, 0);
  document.getElementById('status').textContent = t(pieces.length === 1 ? 'status.one' : 'status', { pieces: pieces.length, points: total });
}

// ---------------------------------------------------------------------------
// Data export and scene files
// ---------------------------------------------------------------------------

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function exportCSV() {
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

function serializeScene() {
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
      params: p.params,
      position: p.mesh.position.toArray(),
      rotation: p.mesh.rotation.toArray(),
      scale: p.mesh.scale.toArray(),
    })),
  };
}

function loadScene(data) {
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
  select(null);
  updateStatus();
}

// Mirrors the structures read off the Gapminder 3D PCA plot in class
const exampleScene = () => ({
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

// ---------------------------------------------------------------------------
// Live analysis: PCA, regression and shadow tabs over the same observations
// ---------------------------------------------------------------------------

const KENDALL_MAX_N = 1500;
const PLOT_MAX_POINTS = 3000;
const PC_COLORS = ['#1f1b16', '#7a6f62', '#b8ab97'];
const REG_COLOR = '#0f766e';
const AXIS_NAMES = ['x', 'y', 'z'];
const analysisState = {
  scope: 'all',
  tab: 'pca',
  showAxes: true,
  regTarget: 1,
  showPlane: true,
  azimuth: 35,
  elevation: 55,
};
let analysisTimer = null;

const pcaAxes = PC_COLORS.map((c, i) => {
  const axis = makeArrow(c, `PC${i + 1}`);
  axis.group.visible = false;
  scene.add(axis.group);
  return axis;
});

// World-space coordinates of every observation in scope, its group label and the piece it came from
function collectData() {
  return collectWorldPoints(analysisState.scope === 'selected' ? (selected ? [selected] : []) : pieces);
}

function collectWorldPoints(source) {
  const n = source.reduce((t, p) => t + p.count, 0);
  const cols = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const groups = new Array(n);
  const owners = new Uint32Array(n);
  const v = new THREE.Vector3();
  let k = 0;
  source.forEach((p, pi) => {
    p.mesh.updateMatrixWorld();
    const arr = p.points.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3, k++) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(p.mesh.matrixWorld);
      cols[0][k] = v.x;
      cols[1][k] = v.y;
      cols[2][k] = v.z;
      groups[k] = p.group;
      owners[k] = pi;
    }
  });
  return { cols, groups, owners, source, n };
}

// Fixed-seed sample of row indices, so subsampled statistics and plots don't flicker
function sampleIndices(n, max) {
  if (n <= max) return null;
  const rand = mulberry32(12345);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < max; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, max);
}

// Kendall is O(n²), so it runs on a subsample
function subsample(cols, max) {
  const idx = sampleIndices(cols[0].length, max);
  return idx ? cols.map((c) => Float64Array.from(idx, (i) => c[i])) : cols;
}

function shapeVerdict(r1, r2) {
  if (r1 >= 0.85) return t('an.linear');
  if (r1 + r2 >= 0.9) return t('an.planar');
  return t('an.volumetric');
}

// Grayscale heatmap cell, like the association heatmaps from class
function heatCell(v) {
  if (!Number.isFinite(v)) return '<td>–</td>';
  const a = Math.min(1, Math.abs(v));
  return `<td style="background: rgba(43, 38, 32, ${(a * 0.85).toFixed(3)}); color: ${a > 0.5 ? '#fff' : 'inherit'}">${v.toFixed(2)}</td>`;
}

function barRow(label, value, cls = '', title = '') {
  return `<div class="fit-row ${cls}" title="${title}"><span>${label}</span><span class="pc-bar"><span style="width:${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%"></span></span><b>${pct(value)}</b></div>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Small scatter plot on a canvas. `equal` keeps both axes on the same scale (for the shadow).
function drawScatter(canvas, xs, ys, colors, { zeroLine = false, equal = false } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 250, h = canvas.clientHeight || 150;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const pad = 8;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < xs.length; i++) {
    x0 = Math.min(x0, xs[i]);
    x1 = Math.max(x1, xs[i]);
    y0 = Math.min(y0, ys[i]);
    y1 = Math.max(y1, ys[i]);
  }
  if (zeroLine) {
    const m = Math.max(Math.abs(y0), Math.abs(y1)) || 1;
    [y0, y1] = [-m, m];
  }
  let sx = (w - 2 * pad) / (x1 - x0 || 1);
  let sy = (h - 2 * pad) / (y1 - y0 || 1);
  if (equal) sx = sy = Math.min(sx, sy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const px = (x) => w / 2 + (x - cx) * sx;
  const py = (y) => h / 2 - (y - cy) * sy;

  ctx.strokeStyle = '#e4dccd';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  if (zeroLine) {
    ctx.strokeStyle = '#7a6f62';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, py(0));
    ctx.lineTo(w - pad, py(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < xs.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(px(xs[i]) - 1.2, py(ys[i]) - 1.2, 2.4, 2.4);
  }
  ctx.globalAlpha = 1;
}

function scheduleAnalysis() {
  if (analysisTimer === null) analysisTimer = setTimeout(runAnalysis, 100);
}

function emptyMessage(data) {
  if (!pieces.length) return t('an.empty');
  if (analysisState.scope === 'selected' && !selected) return t('an.pick');
  if (data.n < 3) return t('an.few');
  return '';
}

function runAnalysis() {
  analysisTimer = null;
  updateGhostFit();
  const data = collectData();
  const msg = emptyMessage(data);
  const tab = analysisState.tab;
  const fit = msg || tab === 'regression' ? null : pca(data.cols);

  updatePcaAxes(tab === 'regression' ? null : fit);
  setRegressionVisible(false);
  setShadowActive(false);

  const box = document.getElementById(tab === 'pca' ? 'analysis-content' : `${tab}-content`);
  if (msg) {
    box.innerHTML = `<p class="note">${msg}</p>`;
    return;
  }
  if (tab === 'pca') renderPcaTab(box, data, fit);
  else if (tab === 'regression') renderRegressionTab(box, data);
  else renderShadowTab(box, data, fit);
}

function updatePcaAxes(fit) {
  for (const a of pcaAxes) a.group.visible = false;
  if (!fit || !analysisState.showAxes) return;
  const center = new THREE.Vector3(...fit.mean);
  fit.components.forEach((c, i) => {
    if (c.value <= 1e-9) return;
    // Two standard deviations either side of the centroid
    const dir = new THREE.Vector3(...c.vector);
    const half = 2 * Math.sqrt(c.value);
    placeArrow(pcaAxes[i], center.clone().addScaledVector(dir, -half), dir, 2 * half);
    pcaAxes[i].group.visible = true;
  });
}

function renderPcaTab(box, { cols, groups, n }, { components }) {
  let html = `<h3>PCA <small>· n = ${n}</small></h3>`;
  components.forEach((c, i) => {
    html += `<div class="pc-row">
      <span class="pc-name"><span class="pc-swatch" style="background:${PC_COLORS[i]}"></span>PC${i + 1}</span>
      <span class="pc-bar"><span style="width:${(c.ratio * 100).toFixed(1)}%"></span></span>
      <span class="pc-val">${pct(c.ratio)}</span>
    </div>
    <div class="pc-vec" title="${t('an.loadings')}">(${c.vector.map((v) => v.toFixed(2)).join(', ')})</div>`;
  });
  const [r1, r2] = components.map((c) => c.ratio);
  html += `<p class="note">${t('an.first2', { pct: `<b>${pct(r1 + r2)}</b>` })}</p>`;
  html += `<p class="shape-verdict">${shapeVerdict(r1, r2)}</p>`;
  html += `<label class="check"><input type="checkbox" id="toggle-axes" ${analysisState.showAxes ? 'checked' : ''}> ${t('an.showAxes')}</label>`;

  const small = subsample(cols, KENDALL_MAX_N);
  html += `<h3>${t('an.corr')}</h3><table class="corr"><tr><th></th><th title="Pearson">r</th><th title="Spearman">ρ</th><th title="Kendall">τ</th></tr>`;
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    html += `<tr><td class="pair">${AXIS_NAMES[a]}–${AXIS_NAMES[b]}</td>${heatCell(pearson(cols[a], cols[b]))}${heatCell(spearman(cols[a], cols[b]))}${heatCell(kendall(small[a], small[b]))}</tr>`;
  }
  html += `</table><p class="note">${t('an.corrNote')}`;
  if (small !== cols) html += t('an.kendallSub', { n: KENDALL_MAX_N });
  html += '</p>';

  const groupCount = new Set(groups).size;
  if (groupCount >= 2) {
    html += `<h3>${t('an.eta')} <small>· ${t('an.groups', { n: groupCount })}</small></h3><table class="corr"><tr>${AXIS_NAMES.map((a) => `<th>${a}</th>`).join('')}</tr><tr>${cols.map((c) => heatCell(etaSquared(c, groups))).join('')}</tr></table>`;
    html += `<p class="note">${t('an.etaNote')}</p>`;
  } else {
    html += `<h3>${t('an.eta')}</h3><p class="note">${t('an.etaNeed')}</p>`;
  }

  box.innerHTML = html;
  document.getElementById('toggle-axes').addEventListener('change', (e) => {
    analysisState.showAxes = e.target.checked;
    scheduleAnalysis();
  });
}

// Regression plane: four corners spanning the predictors' range, plus an outline
const regPositions = new THREE.BufferAttribute(new Float32Array(12), 3);
const regGeometry = new THREE.BufferGeometry().setAttribute('position', regPositions).setIndex([0, 1, 2, 0, 2, 3]);
const regPlane = new THREE.Mesh(
  regGeometry,
  new THREE.MeshBasicMaterial({ color: REG_COLOR, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
regPlane.add(new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', regPositions), new THREE.LineBasicMaterial({ color: REG_COLOR })));
regPlane.renderOrder = 5;
regPlane.visible = false;
scene.add(regPlane);

function setRegressionVisible(v) {
  regPlane.visible = v;
}

function signed(v, digits = 2) {
  return `${v < 0 ? '−' : '+'} ${Math.abs(v).toFixed(digits)}`;
}

function renderRegressionTab(box, { cols, owners, source, n }) {
  const reg = linearRegression(cols, analysisState.regTarget);
  const [p0, p1] = reg.predictors;
  const tn = AXIS_NAMES[reg.target];

  // Plane over the predictors' range, padded a little
  const range = (c) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of c) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const pad = (hi - lo) * 0.05 + 0.05;
    return [lo - pad, hi + pad];
  };
  const [a0, a1] = range(cols[p0]);
  const [b0, b1] = range(cols[p1]);
  [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].forEach(([a, b], i) => {
    const v = [0, 0, 0];
    v[p0] = a;
    v[p1] = b;
    v[reg.target] = reg.intercept + reg.coef[0] * a + reg.coef[1] * b;
    regPositions.setXYZ(i, ...v);
  });
  regPositions.needsUpdate = true;
  regGeometry.computeBoundingSphere();
  setRegressionVisible(analysisState.showPlane);

  // A curve in the residuals: they still depend on the square of the fitted value or of a predictor.
  // A symmetric bend leaves the fitted value flat, so the predictors are checked too, and the plot
  // uses whichever horizontal axis shows the pattern best.
  const curveScore = (values) => {
    const m = values.reduce((sum, v) => sum + v, 0) / n;
    const r = pearson(reg.residuals, values.map((v) => (v - m) ** 2));
    return Number.isFinite(r) ? r * r : 0;
  };
  const candidates = [
    { label: t('reg.fitted'), values: reg.fitted },
    { label: AXIS_NAMES[p0], values: cols[p0] },
    { label: AXIS_NAMES[p1], values: cols[p1] },
  ].map((c) => ({ ...c, score: curveScore(c.values) }));
  const strongest = candidates.reduce((a, b) => (b.score > a.score + 0.05 ? b : a));
  const curved = reg.r2 < 0.995 && strongest.score > 0.1;

  let html = `<h3>${t('reg.model')} <small>· n = ${n}</small></h3>`;
  html += `<p class="equation">${tn} = ${reg.intercept.toFixed(2)} ${signed(reg.coef[0])}·${AXIS_NAMES[p0]} ${signed(reg.coef[1])}·${AXIS_NAMES[p1]}</p>`;
  html += `<h3>${t('reg.fit')}</h3>`;
  html += barRow('R²', reg.r2, 'reg', t('reg.r2Title'));
  html += `<div class="fit-row" title="${t('reg.rmseTitle')}"><span>RMSE</span><span></span><b>${reg.rmse.toFixed(2)}</b></div>`;
  const verdict = reg.r2 >= 0.8 ? t('reg.strong') : reg.r2 >= 0.4 ? t('reg.medium') : t('reg.weak', { target: tn });
  html += `<p class="shape-verdict">${verdict}</p>`;
  html += `<h3>${t('reg.residuals')}</h3><canvas class="plot" id="residual-plot"></canvas>`;
  html += `<p class="note">${t('reg.residualAxes', { x: strongest.label })}</p>`;
  html += `<p class="shape-verdict">${curved ? t('reg.curved') : t('reg.random')}</p>`;
  box.innerHTML = html;

  const idx = sampleIndices(n, PLOT_MAX_POINTS) ?? Array.from({ length: n }, (_, i) => i);
  drawScatter(
    document.getElementById('residual-plot'),
    idx.map((i) => strongest.values[i]),
    idx.map((i) => reg.residuals[i]),
    idx.map((i) => source[owners[i]].color),
    { zeroLine: true },
  );
}

// Shadow mode: a screen behind the data catches the dough's real shadow and the projected points
const shadowGroup = new THREE.Group();
const shadowScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshLambertMaterial({ color: '#fffdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
);
shadowScreen.receiveShadow = true;
const shadowDots = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ color: '#2b2620', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }),
);
shadowGroup.add(shadowScreen, shadowDots);
shadowGroup.visible = false;
scene.add(shadowGroup);

function setShadowActive(active) {
  shadowGroup.visible = active;
  if (!active) {
    sun.position.copy(SUN_HOME);
    sun.target.position.set(0, 0, 0);
  }
}

// Unit vector pointing from the data towards the light
function lightDirection() {
  const az = THREE.MathUtils.degToRad(analysisState.azimuth);
  const el = THREE.MathUtils.degToRad(analysisState.elevation);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

function setLightDirection(vec) {
  const d = new THREE.Vector3(...vec).normalize();
  if (d.y < 0) d.negate(); // either side gives the same shadow; prefer light from above
  analysisState.azimuth = Math.round((THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)) + 360) % 360);
  analysisState.elevation = Math.round(THREE.MathUtils.radToDeg(Math.asin(Math.min(1, d.y))));
  syncShadowSliders();
  scheduleAnalysis();
}

function syncShadowSliders() {
  for (const k of ['azimuth', 'elevation']) {
    document.getElementById(`shadow-${k}`).value = analysisState[k];
    document.getElementById(`shadow-${k}-value`).textContent = `${analysisState[k]}°`;
  }
}

function renderShadowTab(box, { cols, owners, source, n }, fit) {
  const dir = lightDirection();
  const center = new THREE.Vector3(...fit.mean);

  // Screen sits behind the bulk of the data (98% of the points), facing the light
  const dist = Float64Array.from({ length: n }, (_, i) =>
    Math.hypot(cols[0][i] - center.x, cols[1][i] - center.y, cols[2][i] - center.z),
  ).sort();
  const radius = Math.max(dist[Math.floor((n - 1) * 0.98)], 0.5);
  const offset = radius + 1;
  shadowScreen.position.copy(center).addScaledVector(dir, -offset);
  shadowScreen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  shadowScreen.scale.set(radius * 2.6, radius * 2.6, 1);

  // Orthonormal basis of the screen: u horizontal where possible, v completing it
  const u = new THREE.Vector3().crossVectors(Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), dir).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);

  const pos = new Float32Array(n * 3);
  const us = new Float64Array(n), vs = new Float64Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(cols[0][i], cols[1][i], cols[2][i]).sub(center);
    us[i] = p.dot(u);
    vs[i] = p.dot(v);
    // Slightly in front of the screen so the dots don't z-fight with it
    p.copy(center).addScaledVector(u, us[i]).addScaledVector(v, vs[i]).addScaledVector(dir, -offset + 0.02);
    pos.set([p.x, p.y, p.z], i * 3);
  }
  shadowDots.geometry.dispose();
  shadowDots.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  setShadowActive(true);

  // The real light follows the slider, so the dough itself casts its shadow on the screen
  sun.position.copy(center).addScaledVector(dir, 25);
  sun.target.position.copy(center);

  const kept = projectedVarianceRatio(cols, [dir.x, dir.y, dir.z]);
  const best = fit.components[0].ratio + fit.components[1].ratio;
  const gap = best - kept;

  let html = `<h3>${t('shadow.keptTitle')} <small>· n = ${n}</small></h3>`;
  html += barRow(t('shadow.kept'), kept, 'reg');
  html += barRow(t('shadow.best'), best);
  html += `<p class="shape-verdict">${gap < 0.005 ? t('shadow.match') : t('shadow.gap', { gap: (gap * 100).toFixed(1) })}</p>`;
  html += `<h3>${t('shadow.plot')}</h3><canvas class="plot" id="shadow-plot"></canvas>`;
  box.innerHTML = html;

  const idx = sampleIndices(n, PLOT_MAX_POINTS) ?? Array.from({ length: n }, (_, i) => i);
  drawScatter(
    document.getElementById('shadow-plot'),
    idx.map((i) => us[i]),
    idx.map((i) => vs[i]),
    idx.map((i) => source[owners[i]].color),
    { equal: true },
  );
}

// ---------------------------------------------------------------------------
// Ghost data: a CSV reduced to 3D with PCA, shown as a translucent cloud to sculpt over
// ---------------------------------------------------------------------------

const GAPMINDER_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/gapminderDataFiveYear.csv';
const GHOST_MAX_ROWS = 20000;
const ghost = new Ghost(scene);
const ghostState = {
  table: null,
  fileName: '',
  truncated: false,
  columnsInfo: [],
  columns: [],
  colorBy: -1,
  standardize: true,
  logSkewed: false,
  visible: true,
  arrows: true,
  data: null,
  error: '',
};

function loadGhostTable(text, fileName) {
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
function frameGhost() {
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

function rebuildGhost() {
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

function withBold(sentence, value) {
  const [before, after = ''] = sentence.split('\u0000');
  return el('div', {}, before, el('b', {}, value), after);
}

function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle' }, input, el('span', {}, label));
}

function renderGhostSettings() {
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
  remove.addEventListener('click', () => {
    ghost.clear();
    Object.assign(ghostState, { table: null, data: null });
    tooltip.hidden = true;
    renderGhostSettings();
  });
  box.append(el('div', { class: 'btn-row' }, remove));
}

// Coverage and spill of the dough against the ghost, using all pieces
function updateGhostFit() {
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
const tooltip = document.getElementById('tooltip');
let hoverEvent = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!hoverEvent) requestAnimationFrame(updateHover);
  hoverEvent = e;
});
renderer.domElement.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});

function updateHover() {
  const e = hoverEvent;
  hoverEvent = null;
  // Touch "moves" are drags; a tap is handled on pointerup instead
  if (e.pointerType !== 'mouse') return;
  showGhostRow(e.buttons || gizmo.dragging ? null : e);
}

// Shows the CSV row of the ghost point under the pointer, or hides the tooltip (e = null)
function showGhostRow(e) {
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

const ghostFile = document.getElementById('ghost-file');
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

const gapminderButton = document.getElementById('ghost-gapminder');
gapminderButton.addEventListener('click', async () => {
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
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const analysisPanel = document.getElementById('analysis');
const analysisToggle = document.getElementById('analysis-toggle');
function setAnalysisCollapsed(collapsed) {
  analysisPanel.classList.toggle('collapsed', collapsed);
  analysisToggle.textContent = collapsed ? t('analysis.show') : t('analysis.hide');
}
analysisToggle.addEventListener('click', () => setAnalysisCollapsed(!analysisPanel.classList.contains('collapsed')));
if (window.matchMedia('(max-width: 800px)').matches) setAnalysisCollapsed(true);

for (const b of document.querySelectorAll('#analysis-scope button')) {
  b.addEventListener('click', () => {
    analysisState.scope = b.dataset.scope;
    for (const o of document.querySelectorAll('#analysis-scope button')) o.classList.toggle('active', o === b);
    scheduleAnalysis();
  });
}

for (const b of document.querySelectorAll('#analysis-tabs button')) {
  b.addEventListener('click', () => {
    analysisState.tab = b.dataset.tab;
    for (const o of document.querySelectorAll('#analysis-tabs button')) {
      o.classList.toggle('active', o === b);
      o.setAttribute('aria-selected', o === b);
    }
    for (const pane of document.querySelectorAll('.tab-pane')) pane.hidden = pane.dataset.pane !== b.dataset.tab;
    scheduleAnalysis();
  });
}

document.getElementById('reg-target').addEventListener('change', (e) => {
  analysisState.regTarget = parseInt(e.target.value, 10);
  scheduleAnalysis();
});
document.getElementById('reg-plane').addEventListener('change', (e) => {
  analysisState.showPlane = e.target.checked;
  scheduleAnalysis();
});
for (const k of ['azimuth', 'elevation']) {
  document.getElementById(`shadow-${k}`).addEventListener('input', (e) => {
    analysisState[k] = parseInt(e.target.value, 10);
    syncShadowSliders();
    scheduleAnalysis();
  });
}
// Light along PC3 casts the PC1–PC2 shadow; light along PC1 flattens the longest direction
function lightAlongPC(index) {
  const data = collectData();
  if (emptyMessage(data)) return;
  setLightDirection(pca(data.cols).components[index].vector);
}
document.getElementById('shadow-align').addEventListener('click', () => lightAlongPC(2));
document.getElementById('shadow-worst').addEventListener('click', () => lightAlongPC(0));
syncShadowSliders();

document.getElementById('tool-duplicate').addEventListener('click', duplicateSelected);
document.getElementById('tool-delete').addEventListener('click', () => selected && removePiece(selected));

// Static labels come from data-i18n attributes; dynamic panels are re-rendered
function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.querySelector('meta[name="description"]').content = t('meta.description');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  const keys = { translate: 'W', rotate: 'E', scale: 'R' };
  for (const b of document.querySelectorAll('#mode-buttons button')) b.title = t('mode.shortcut', { key: keys[b.dataset.mode] });
  document.getElementById('help').textContent = t(isTouch ? 'help.touch' : 'help.mouse');
  document.getElementById('lang-toggle').textContent = lang === 'tr' ? 'EN' : 'TR';
  setAnalysisCollapsed(analysisPanel.classList.contains('collapsed'));
  if (!gapminderButton.disabled) gapminderButton.textContent = t('ghost.gapminder');
  renderList();
  renderProps();
  renderGhostSettings();
  updateGhostFit();
  updateStatus();
  scheduleAnalysis();
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  try {
    localStorage.setItem(LANG_KEY, getLang());
  } catch {
    // Not saved; the choice still applies to this visit
  }
  applyLanguage();
});

const densityInput = document.getElementById('density');
function setDensity(v) {
  settings.density = v;
  densityInput.value = v;
  document.getElementById('density-value').textContent = v;
}
densityInput.addEventListener('input', () => {
  setDensity(parseInt(densityInput.value, 10));
  pieces.forEach(refreshPoints);
  renderList();
  updateStatus();
});

for (const b of document.querySelectorAll('#shape-buttons button')) {
  b.addEventListener('click', () => addPiece(b.dataset.shape));
}
for (const b of document.querySelectorAll('#mode-buttons button')) {
  b.addEventListener('click', () => setMode(b.dataset.mode));
}
for (const b of document.querySelectorAll('#view-mode button')) {
  b.addEventListener('click', () => {
    settings.view = b.dataset.view;
    pieces.forEach(applyView);
    for (const o of document.querySelectorAll('#view-mode button')) o.classList.toggle('active', o === b);
  });
}

document.getElementById('btn-export').addEventListener('click', exportCSV);
document.getElementById('btn-save').addEventListener('click', () => {
  download('doughlab-scene.json', JSON.stringify(serializeScene(), null, 2), 'application/json');
});
const fileInput = document.getElementById('file-input');
document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    loadScene(JSON.parse(await file.text()));
  } catch (err) {
    alert(t('err.sceneOpen', { msg: errorText(err) }));
  }
});
document.getElementById('btn-example').addEventListener('click', () => {
  if (pieces.length && !confirm(t('confirm.example'))) return;
  loadScene(exampleScene());
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (pieces.length && confirm(t('confirm.clear'))) {
    clearScene();
    updateStatus();
  }
});

applyLanguage();
