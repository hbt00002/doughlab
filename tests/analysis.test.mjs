import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pca, pearson, spearman, kendall, etaSquared, linearRegression, projectedVarianceRatio, regressOnColumns } from '../src/analysis.js';

// Same seeded generator as src/sampling.js, which can't be imported here because it needs Three.js
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// Three columns of uniform noise with different spreads, so the PCA ratios are distinct
function randomCols(n, seed = 1) {
  const rand = mulberry32(seed);
  const cols = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    cols[0][i] = rand() * 5;
    cols[1][i] = rand() * 2 + cols[0][i] * 0.3;
    cols[2][i] = rand() * 0.5;
  }
  return cols;
}

test('pearson of a perfect line is 1', () => close(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1));

test('spearman handles ties with average ranks', () => close(spearman([1, 2, 2, 3], [1, 2, 2, 3]), 1));

test('kendall tau-b of reversed order is -1', () => close(kendall([1, 2, 3, 4], [4, 3, 2, 1]), -1));

test('eta squared is 1 when groups explain everything', () => close(etaSquared([1, 1, 5, 5], ['a', 'a', 'b', 'b']), 1));

test('pca ratios sum to 1 and are sorted', () => {
  const { components } = pca(randomCols(500));
  const r = components.map((c) => c.ratio);
  close(r[0] + r[1] + r[2], 1);
  assert.ok(r[0] >= r[1] && r[1] >= r[2]);
});

test('linearRegression recovers y = 1 + 2x - 0.5z', () => {
  const [x, , z] = randomCols(200, 7);
  const y = x.map((v, i) => 1 + 2 * v - 0.5 * z[i]);
  const reg = linearRegression([x, y, z], 1);
  assert.deepEqual(reg.predictors, [0, 2]);
  close(reg.intercept, 1);
  close(reg.coef[0], 2);
  close(reg.coef[1], -0.5);
  close(reg.r2, 1);
});

test('projected variance along PC3 equals PC1+PC2', () => {
  const cols = randomCols(500, 3);
  const c = pca(cols).components;
  close(projectedVarianceRatio(cols, c[2].vector), c[0].ratio + c[1].ratio);
});

test('regressOnColumns with one predictor matches the closed form', () => {
  const x = [0, 1, 2, 3, 4];
  const reg = regressOnColumns(x.map((v) => 3 + 2 * v), [x]);
  close(reg.intercept, 3);
  assert.equal(reg.coef.length, 1);
  close(reg.coef[0], 2);
  close(reg.r2, 1);
});

test('regressOnColumns with two predictors matches linearRegression', () => {
  const cols = randomCols(300, 11);
  const y = cols[1].map((v, i) => v + 0.2 * Math.sin(i));
  const viaCols = regressOnColumns(y, [cols[0], cols[2]]);
  const viaPlane = linearRegression([cols[0], y, cols[2]], 1);
  close(viaCols.intercept, viaPlane.intercept);
  close(viaCols.coef[0], viaPlane.coef[0]);
  close(viaCols.coef[1], viaPlane.coef[1]);
  close(viaCols.r2, viaPlane.r2);
});
