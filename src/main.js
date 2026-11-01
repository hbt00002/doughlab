import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildGeometry, pieceVolume } from './geometry.js';
import { samplePiece, mulberry32 } from './sampling.js';
import { pca, pearson, spearman, kendall, etaSquared } from './analysis.js';
import { makeArrow, placeArrow } from './arrows.js';
import { Ghost, parseCSV, describeColumns, buildGhostData, fitScores } from './ghost.js';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const COLORS = [
  { name: 'Kırmızı', hex: '#e5383b' },
  { name: 'Turuncu', hex: '#f48c2f' },
  { name: 'Sarı', hex: '#f6c90e' },
  { name: 'Yeşil', hex: '#4caf50' },
  { name: 'Mavi', hex: '#2f80ed' },
  { name: 'Mor', hex: '#8e5bd0' },
  { name: 'Pembe', hex: '#ff7eb6' },
  { name: 'Kahverengi', hex: '#8d5b3f' },
  { name: 'Beyaz', hex: '#f1ede4' },
];

// Dough type only changes how the dough looks; it has no effect on the data
const DOUGH_TYPES = {
  classic: { label: 'Klasik', roughness: 0.9, metalness: 0, clearcoat: 0 },
  glossy: { label: 'Parlak (slime)', roughness: 0.3, metalness: 0, clearcoat: 1 },
  glitter: { label: 'Simli', roughness: 0.4, metalness: 0.6, clearcoat: 0.3 },
};

const SHAPES = {
  ball: { label: 'Top', params: { radius: 1 } },
  snake: { label: 'Yılan', params: { length: 4, radius: 0.4, curvature: 0 } },
  slab: { label: 'Levha', params: { width: 4, depth: 3, thickness: 0.4, curvature: 0 } },
};

const PARAM_SPECS = {
  radius: { label: 'Yarıçap', min: 0.1, max: 3, step: 0.05 },
  length: { label: 'Uzunluk', min: 0.5, max: 10, step: 0.1 },
  width: { label: 'Genişlik', min: 0.5, max: 10, step: 0.1 },
  depth: { label: 'Derinlik', min: 0.5, max: 10, step: 0.1 },
  thickness: { label: 'Kalınlık', min: 0.1, max: 2, step: 0.05 },
  curvature: { label: 'Bükülme', min: 0, max: 1, step: 0.01 },
};

const MAX_POINTS_PER_PIECE = 5000;

const colorName = (hex) => COLORS.find((c) => c.hex === hex.toLowerCase())?.name ?? 'Özel';
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
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(6, 12, 8);
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
gizmo.setSize(0.9);
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
    name: opts.name ?? `${SHAPES[type].label} ${typeCounters[type]}`,
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
    name: `${piece.name} (kopya)`,
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
  // Ignore camera drags and clicks on the gizmo handles
  if (moved > 4 || gizmo.dragging || gizmo.axis) return;
  rayFromEvent(e);
  const hit = raycaster.intersectObjects(pieces.map((p) => p.mesh), false)[0];
  select(hit ? hit.object.userData.piece : null);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'd' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (selected) select(duplicatePiece(selected));
    updateStatus();
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
    list.append(el('p', { class: 'empty' }, 'Henüz hamur yok. Yukarıdan bir parça ekle.'));
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
      el('span', { class: 'pmeta' }, `${p.count} nokta`),
    );
    row.addEventListener('click', () => select(p));
    list.append(row);
  }
}

function renderProps() {
  const box = document.getElementById('props');
  box.replaceChildren();
  if (!selected) {
    box.append(el('p', { class: 'empty' }, 'Düzenlemek için sahnede ya da listede bir parçaya tıkla.'));
    return;
  }
  const p = selected;
  const afterShapeChange = () => {
    rebuildGeometry(p);
    refreshPoints(p);
    renderList();
    updateStatus();
  };

  const name = textField('Ad', p.name, (v) => {
    p.name = v;
    renderList();
  });
  const group = textField('Grup (kategorik değişken)', p.group, (v) => {
    p.group = v;
    scheduleAnalysis();
  });

  // Colour: preset play-dough swatches plus a free picker
  const swatches = el('div', { class: 'swatches' });
  const setColor = (hex) => {
    // Keep the group label in sync while it is still the default colour name
    if (p.group === colorName(p.color)) {
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
    const s = el('button', { class: 'swatch' + (c.hex === p.color ? ' active' : ''), title: c.name, 'data-hex': c.hex });
    s.style.background = c.hex;
    s.addEventListener('click', () => setColor(c.hex));
    swatches.append(s);
  }
  const custom = el('input', { type: 'color', value: p.color, title: 'Özel renk' });
  custom.addEventListener('input', () => setColor(custom.value));
  swatches.append(custom);

  box.append(
    name.node,
    group.node,
    el('div', { class: 'field' }, el('span', { class: 'field-head' }, 'Renk'), swatches),
    selectField('Hamur türü (görünüm)', DOUGH_TYPES, p.dough, (v) => {
      p.dough = v;
      updateMaterial(p);
    }),
    ...Object.keys(p.params).map((k) =>
      slider(PARAM_SPECS[k], p.params[k], (v) => {
        p.params[k] = v;
        afterShapeChange();
      }),
    ),
    slider({ label: 'Doku (pürüz / gürültü)', min: 0, max: 1, step: 0.01 }, p.texture, (v) => {
      p.texture = v;
      afterShapeChange();
    }),
  );

  const dup = el('button', {}, 'Çoğalt');
  dup.addEventListener('click', () => {
    select(duplicatePiece(p));
    updateStatus();
  });
  const del = el('button', { class: 'danger' }, 'Sil');
  del.addEventListener('click', () => removePiece(p));
  box.append(el('div', { class: 'btn-row' }, dup, del));
}

function updateStatus() {
  const total = pieces.reduce((n, p) => n + p.count, 0);
  document.getElementById('status').textContent = `${pieces.length} parça · ${total} gözlem`;
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
  if (data?.app !== 'doughlab' || !Array.isArray(data.pieces)) throw new Error('Bu bir DoughLab sahne dosyası değil.');
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
const EXAMPLE_SCENE = {
  app: 'doughlab',
  version: 1,
  density: 60,
  pieces: [
    { type: 'slab', name: 'Ana kütle', group: 'Ana kütle', color: '#2f80ed', texture: 0.25,
      params: { width: 7, depth: 4.5, thickness: 0.6, curvature: 0 }, position: [0, 1.4, 0], rotation: [0, 0, 0.22] },
    { type: 'snake', name: 'Ayrı doğrusal dizi', group: 'Ayrı dizi', color: '#e5383b', texture: 0.15,
      params: { length: 6, radius: 0.22, curvature: 0 }, position: [0.2, 2.8, -2.9], rotation: [0, 0.15, 0.22] },
    { type: 'snake', name: 'Çin', group: 'Çin', color: '#f6c90e', texture: 0.1,
      params: { length: 3.2, radius: 0.25, curvature: 0.45 }, position: [-1.8, 2.6, 1.6], rotation: [0.3, 0.6, 0.5] },
    { type: 'snake', name: 'Hindistan', group: 'Hindistan', color: '#4caf50', texture: 0.1,
      params: { length: 3.2, radius: 0.25, curvature: 0.35 }, position: [-1.0, 2.3, 2.5], rotation: [0.3, 0.4, 0.4] },
    { type: 'ball', name: 'Kuveyt', group: 'Kuveyt', color: '#8e5bd0', texture: 0.6,
      params: { radius: 0.7 }, position: [4.2, 3.8, 1.8], rotation: [0, 0, 0] },
  ],
};

// ---------------------------------------------------------------------------
// Live analysis: PCA, correlations, group effect
// ---------------------------------------------------------------------------

const KENDALL_MAX_N = 1500;
const PC_COLORS = ['#1f1b16', '#7a6f62', '#b8ab97'];
const AXIS_NAMES = ['x', 'y', 'z'];
const analysisState = { scope: 'all', showAxes: true };
let analysisTimer = null;

const pcaAxes = PC_COLORS.map((c, i) => {
  const axis = makeArrow(c, `PC${i + 1}`);
  axis.group.visible = false;
  scene.add(axis.group);
  return axis;
});

// World-space coordinates of every observation in scope, plus its group label
function collectData() {
  return collectWorldPoints(analysisState.scope === 'selected' ? (selected ? [selected] : []) : pieces);
}

function collectWorldPoints(source) {
  const n = source.reduce((t, p) => t + p.count, 0);
  const cols = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const groups = new Array(n);
  const v = new THREE.Vector3();
  let k = 0;
  for (const p of source) {
    p.mesh.updateMatrixWorld();
    const arr = p.points.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3, k++) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(p.mesh.matrixWorld);
      cols[0][k] = v.x;
      cols[1][k] = v.y;
      cols[2][k] = v.z;
      groups[k] = p.group;
    }
  }
  return { cols, groups, n };
}

// Fixed-seed subsample so Kendall's O(n²) stays fast and the value doesn't flicker
function subsample(cols, max) {
  const n = cols[0].length;
  if (n <= max) return cols;
  const rand = mulberry32(12345);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < max; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return cols.map((c) => Float64Array.from(idx.slice(0, max), (i) => c[i]));
}

function shapeVerdict(r1, r2) {
  if (r1 >= 0.85) return '<b>Çizgisel (1B):</b> noktalar neredeyse tek bir doğru boyunca uzanıyor.';
  if (r1 + r2 >= 0.9) return '<b>Düzlemsel (2B):</b> noktalar masa üstü gibi ince bir yüzeyde. 2B PCA gölgesi bilginin çoğunu korur.';
  return '<b>Hacimsel (3B):</b> veri üç yöne de yayılmış. 2B gölge önemli bilgi kaybeder.';
}

const pct = (v) => `%${(v * 100).toFixed(1)}`;

// Grayscale heatmap cell, like the association heatmaps from class
function heatCell(v) {
  if (!Number.isFinite(v)) return '<td>–</td>';
  const a = Math.min(1, Math.abs(v));
  return `<td style="background: rgba(43, 38, 32, ${(a * 0.85).toFixed(3)}); color: ${a > 0.5 ? '#fff' : 'inherit'}">${v.toFixed(2)}</td>`;
}

function scheduleAnalysis() {
  if (analysisTimer === null) analysisTimer = setTimeout(runAnalysis, 100);
}

function runAnalysis() {
  analysisTimer = null;
  updateGhostFit();
  const box = document.getElementById('analysis-content');
  const { cols, groups, n } = collectData();
  if (n < 3) {
    const msg = !pieces.length ? 'Hamur ekleyince analiz burada görünür.'
      : analysisState.scope === 'selected' && !selected ? 'Analiz için bir parça seç.' : 'Analiz için en az 3 nokta gerekli.';
    box.innerHTML = `<p class="note">${msg}</p>`;
    for (const a of pcaAxes) a.group.visible = false;
    return;
  }

  const { mean: mu, components } = pca(cols);
  const center = new THREE.Vector3(...mu);
  components.forEach((c, i) => {
    const axis = pcaAxes[i];
    axis.group.visible = analysisState.showAxes && c.value > 1e-9;
    // Two standard deviations either side of the centroid
    if (axis.group.visible) {
      const dir = new THREE.Vector3(...c.vector);
      const half = 2 * Math.sqrt(c.value);
      placeArrow(axis, center.clone().addScaledVector(dir, -half), dir, 2 * half);
    }
  });

  let html = `<h3>PCA <small>· n = ${n}</small></h3>`;
  components.forEach((c, i) => {
    html += `<div class="pc-row">
      <span class="pc-name"><span class="pc-swatch" style="background:${PC_COLORS[i]}"></span>PC${i + 1}</span>
      <span class="pc-bar"><span style="width:${(c.ratio * 100).toFixed(1)}%"></span></span>
      <span class="pc-val">${pct(c.ratio)}</span>
    </div>
    <div class="pc-vec" title="Bileşenin x, y, z yükleri">(${c.vector.map((v) => v.toFixed(2)).join(', ')})</div>`;
  });
  const [r1, r2] = components.map((c) => c.ratio);
  html += `<p class="note">İlk 2 bileşenin açıkladığı varyans: <b>${pct(r1 + r2)}</b></p>`;
  html += `<p class="shape-verdict">${shapeVerdict(r1, r2)}</p>`;
  html += `<label class="check"><input type="checkbox" id="toggle-axes" ${analysisState.showAxes ? 'checked' : ''}> PCA eksenlerini sahnede göster</label>`;

  const small = subsample(cols, KENDALL_MAX_N);
  html += '<h3>Korelasyon</h3><table class="corr"><tr><th></th><th title="Pearson">r</th><th title="Spearman">ρ</th><th title="Kendall">τ</th></tr>';
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    html += `<tr><td class="pair">${AXIS_NAMES[a]}–${AXIS_NAMES[b]}</td>${heatCell(pearson(cols[a], cols[b]))}${heatCell(spearman(cols[a], cols[b]))}${heatCell(kendall(small[a], small[b]))}</tr>`;
  }
  html += '</table><p class="note">r: Pearson (doğrusal) · ρ: Spearman, τ: Kendall (monoton)';
  if (small !== cols) html += ` · τ, ${KENDALL_MAX_N} noktalık alt örnekle hesaplandı`;
  html += '</p>';

  const groupCount = new Set(groups).size;
  if (groupCount >= 2) {
    html += `<h3>Grup etkisi (η²) <small>· ${groupCount} grup</small></h3><table class="corr"><tr>${AXIS_NAMES.map((a) => `<th>${a}</th>`).join('')}</tr><tr>${cols.map((c) => heatCell(etaSquared(c, groups))).join('')}</tr></table>`;
    html += '<p class="note">Grup bilgisi her eksendeki varyansın ne kadarını açıklıyor?</p>';
  } else {
    html += '<h3>Grup etkisi (η²)</h3><p class="note">η² için en az 2 farklı grup gerekli. Parçalara farklı grup adları ver.</p>';
  }

  box.innerHTML = html;
  document.getElementById('toggle-axes').addEventListener('change', (e) => {
    analysisState.showAxes = e.target.checked;
    scheduleAnalysis();
  });
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
  if (!table.header.length || !table.rows.length) throw new Error('CSV boş görünüyor.');
  const truncated = table.rows.length > GHOST_MAX_ROWS;
  if (truncated) table.rows = table.rows.slice(0, GHOST_MAX_ROWS);
  const info = describeColumns(table);
  const numeric = info.filter((c) => c.numeric);
  if (numeric.length < 3) throw new Error('Hayalet için en az 3 sayısal sütun gerekli.');
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
      s.error = err.message;
    }
  }
  renderGhostSettings();
  updateGhostFit();
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

  const rowsNote = s.truncated ? ` (ilk ${GHOST_MAX_ROWS})` : '';
  box.append(el('p', { class: 'ghost-file' }, `${s.fileName} · ${s.table.rows.length} satır${rowsNote}`));

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
  box.append(el('div', { class: 'field' }, el('span', { class: 'field-head' }, 'Değişkenler (PCA girdisi)'), vars));

  const colorOptions = new Map([['-1', { label: 'Yok' }]]);
  for (const c of s.columnsInfo) if (c.unique >= 2 && c.unique <= 20) colorOptions.set(String(c.index), { label: c.name });
  box.append(
    selectField('Renk (kategorik sütun)', colorOptions, String(s.colorBy), (v) => {
      s.colorBy = parseInt(v, 10);
      rebuildGhost();
    }),
    checkbox('Standartlaştır (z-skoru)', s.standardize, (v) => {
      s.standardize = v;
      rebuildGhost();
    }),
    checkbox('Çarpık pozitif sütunlara log uygula', s.logSkewed, (v) => {
      s.logSkewed = v;
      rebuildGhost();
    }),
    checkbox('Hayaleti göster', s.visible, (v) => {
      s.visible = v;
      ghost.setVisible(v);
    }),
    checkbox('Değişken oklarını göster', s.arrows, (v) => {
      s.arrows = v;
      ghost.setArrowsVisible(v);
    }),
  );

  const d = s.data;
  if (!d) {
    box.append(el('p', { class: 'ghost-info' }, s.error || 'PCA ile 3B hayalet için en az 3 değişken seç.'));
  } else {
    const info = el(
      'div',
      { class: 'ghost-info' },
      el('div', {}, '3B PCA verideki varyansın ', el('b', {}, pct(d.retained)), ' kadarını koruyor.'),
      el('div', { class: 'muted' }, d.ratios.map((r, i) => `PC${i + 1} ${pct(r)}`).join(' · ')),
    );
    if (d.logged.length) info.append(el('div', { class: 'muted' }, `Log uygulanan: ${d.logged.join(', ')}`));
    if (d.dropped) info.append(el('div', { class: 'muted' }, `${d.dropped} satır eksik değer yüzünden dışarıda kaldı.`));
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

  const remove = el('button', { class: 'danger' }, 'Hayaleti kaldır');
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
    box.replaceChildren(el('p', { class: 'hint' }, 'Uyum skoru için sahneye hamur ekle.'));
    return;
  }
  const { coverage, spill } = fitScores(d.positions, cols, d.span * 0.05);
  const row = (label, v, cls, title) => {
    const fill = el('span');
    fill.style.width = `${(v * 100).toFixed(1)}%`;
    return el('div', { class: `fit-row ${cls}`, title }, el('span', {}, label), el('span', { class: 'pc-bar' }, fill), el('b', {}, pct(v)));
  };
  box.replaceChildren(
    el('div', { class: 'field-head' }, 'Hamur uyumu'),
    row('Kapsama', coverage, '', 'Hayalet noktaların ne kadarının yakınında hamur var'),
    row('Taşma', spill, 'spill', 'Hamurun ne kadarı verinin olmadığı yerde'),
    el('p', { class: 'hint' }, 'Kapsama: verinin ne kadarına hamur değiyor. Taşma: hamurun ne kadarı boş yerde. İyi model: kapsama yüksek, taşma düşük.'),
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
  if (!ghostState.data || !ghostState.visible || e.buttons || gizmo.dragging) {
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
    alert(`CSV açılamadı: ${err.message}`);
  }
});

const gapminderButton = document.getElementById('ghost-gapminder');
gapminderButton.addEventListener('click', async () => {
  gapminderButton.disabled = true;
  gapminderButton.textContent = 'Yükleniyor…';
  try {
    const res = await fetch(GAPMINDER_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadGhostTable(await res.text(), 'gapminderDataFiveYear.csv');
  } catch (err) {
    alert(`Gapminder verisi indirilemedi: ${err.message}`);
  } finally {
    gapminderButton.disabled = false;
    gapminderButton.textContent = 'Gapminder örneği';
  }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const analysisPanel = document.getElementById('analysis');
const analysisToggle = document.getElementById('analysis-toggle');
function setAnalysisCollapsed(collapsed) {
  analysisPanel.classList.toggle('collapsed', collapsed);
  analysisToggle.textContent = collapsed ? 'Göster' : 'Gizle';
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
    alert(`Sahne açılamadı: ${err.message}`);
  }
});
document.getElementById('btn-example').addEventListener('click', () => {
  if (pieces.length && !confirm('Mevcut sahne silinip örnek sahne yüklensin mi?')) return;
  loadScene(EXAMPLE_SCENE);
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (pieces.length && confirm('Tüm parçalar silinsin mi?')) {
    clearScene();
    updateStatus();
  }
});

updateStatus();
scheduleAnalysis();
renderList();
renderProps();
