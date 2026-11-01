import * as THREE from 'three';
import { mulberry32 } from './sampling.js';
import { pca, pearson, spearman, kendall, etaSquared, linearRegression, projectedVarianceRatio } from './analysis.js';
import { makeArrow, placeArrow } from './arrows.js';
import { t, pct } from './i18n.js';
import { pieces, analysisState, state } from './state.js';
import { el } from './ui.js';
import { scene, SUN_HOME, sun } from './scene.js';
import { updateGhostFit } from './ghost-ui.js';

// ---------------------------------------------------------------------------
// Live analysis: PCA, regression and shadow tabs over the same observations
// ---------------------------------------------------------------------------

export const KENDALL_MAX_N = 1500;
export const PLOT_MAX_POINTS = 3000;
export const PC_COLORS = ['#1f1b16', '#7a6f62', '#b8ab97'];
export const REG_COLOR = '#0f766e';
export const AXIS_NAMES = ['x', 'y', 'z'];
let analysisTimer = null;

export const pcaAxes = PC_COLORS.map((c, i) => {
  const axis = makeArrow(c, `PC${i + 1}`);
  axis.group.visible = false;
  scene.add(axis.group);
  return axis;
});

// World-space coordinates of every observation in scope, its group label and the piece it came from
export function collectData() {
  return collectWorldPoints(analysisState.scope === 'selected' ? selection : pieces);
}

export function collectWorldPoints(source) {
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
export function sampleIndices(n, max) {
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
export function subsample(cols, max) {
  const idx = sampleIndices(cols[0].length, max);
  return idx ? cols.map((c) => Float64Array.from(idx, (i) => c[i])) : cols;
}

export function shapeVerdict(r1, r2) {
  if (r1 >= 0.85) return t('an.linear');
  if (r1 + r2 >= 0.9) return t('an.planar');
  return t('an.volumetric');
}

// Grayscale heatmap cell, like the association heatmaps from class
export function heatCell(v) {
  if (!Number.isFinite(v)) return '<td>–</td>';
  const a = Math.min(1, Math.abs(v));
  return `<td style="background: rgba(43, 38, 32, ${(a * 0.85).toFixed(3)}); color: ${a > 0.5 ? '#fff' : 'inherit'}">${v.toFixed(2)}</td>`;
}

export function barRow(label, value, cls = '', title = '') {
  return `<div class="fit-row ${cls}" title="${title}"><span>${label}</span><span class="pc-bar"><span style="width:${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%"></span></span><b>${pct(value)}</b></div>`;
}


// Small scatter plot on a canvas. `equal` keeps both axes on the same scale (for the shadow).
export function drawScatter(canvas, xs, ys, colors, { zeroLine = false, equal = false } = {}) {
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

export function scheduleAnalysis() {
  if (analysisTimer === null) analysisTimer = setTimeout(runAnalysis, 100);
}

export function emptyMessage(data) {
  if (!pieces.length) return t('an.empty');
  if (analysisState.scope === 'selected' && !state.selection.length) return t('an.pick');
  if (data.n < 3) return t('an.few');
  return '';
}

export function runAnalysis() {
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

export function updatePcaAxes(fit) {
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

export function renderPcaTab(box, { cols, groups, n }, { components }) {
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
export const regPositions = new THREE.BufferAttribute(new Float32Array(12), 3);
export const regGeometry = new THREE.BufferGeometry().setAttribute('position', regPositions).setIndex([0, 1, 2, 0, 2, 3]);
export const regPlane = new THREE.Mesh(
  regGeometry,
  new THREE.MeshBasicMaterial({ color: REG_COLOR, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
regPlane.add(new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', regPositions), new THREE.LineBasicMaterial({ color: REG_COLOR })));
regPlane.renderOrder = 5;
regPlane.visible = false;
scene.add(regPlane);

export function setRegressionVisible(v) {
  regPlane.visible = v;
}

export function signed(v, digits = 2) {
  return `${v < 0 ? '−' : '+'} ${Math.abs(v).toFixed(digits)}`;
}

export function renderRegressionTab(box, { cols, owners, source, n }) {
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
export const shadowGroup = new THREE.Group();
export const shadowScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshLambertMaterial({ color: '#fffdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
);
shadowScreen.receiveShadow = true;
export const shadowDots = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ color: '#2b2620', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }),
);
shadowGroup.add(shadowScreen, shadowDots);
shadowGroup.visible = false;
scene.add(shadowGroup);

export function setShadowActive(active) {
  shadowGroup.visible = active;
  if (!active) {
    sun.position.copy(SUN_HOME);
    sun.target.position.set(0, 0, 0);
  }
}

// Unit vector pointing from the data towards the light
export function lightDirection() {
  const az = THREE.MathUtils.degToRad(analysisState.azimuth);
  const el = THREE.MathUtils.degToRad(analysisState.elevation);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

export function setLightDirection(vec) {
  const d = new THREE.Vector3(...vec).normalize();
  if (d.y < 0) d.negate(); // either side gives the same shadow; prefer light from above
  analysisState.azimuth = Math.round((THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)) + 360) % 360);
  analysisState.elevation = Math.round(THREE.MathUtils.radToDeg(Math.asin(Math.min(1, d.y))));
  syncShadowSliders();
  scheduleAnalysis();
}

export function syncShadowSliders() {
  for (const k of ['azimuth', 'elevation']) {
    document.getElementById(`shadow-${k}`).value = analysisState[k];
    document.getElementById(`shadow-${k}-value`).textContent = `${analysisState[k]}°`;
  }
}

export function renderShadowTab(box, { cols, owners, source, n }, fit) {
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

// Light along PC3 casts the PC1–PC2 shadow; light along PC1 flattens the longest direction
export function lightAlongPC(index) {
  const data = collectData();
  if (emptyMessage(data)) return;
  setLightDirection(pca(data.cols).components[index].vector);
}
