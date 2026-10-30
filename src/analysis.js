// Statistics behind the live analysis panel. Pure functions on plain number arrays.

export function mean(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

// Jacobi eigenvalue algorithm for small symmetric matrices.
// Returns [{ value, vector }] sorted by value, largest first.
export function symmetricEigen(M) {
  const n = M.length;
  const A = M.map((row) => row.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-24) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-30) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  return A.map((row, i) => ({ value: row[i], vector: V.map((r) => r[i]) })).sort((a, b) => b.value - a.value);
}

// Covariance-based PCA. All columns share the same unit (scene space), so no standardisation.
export function pca(cols) {
  const k = cols.length, n = cols[0].length;
  const mu = cols.map(mean);
  const C = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      const da = cols[a][i] - mu[a];
      for (let b = a; b < k; b++) C[a][b] += da * (cols[b][i] - mu[b]);
    }
  }
  for (let a = 0; a < k; a++) {
    for (let b = a; b < k; b++) {
      C[a][b] /= n - 1;
      C[b][a] = C[a][b];
    }
  }

  const eig = symmetricEigen(C);
  const total = eig.reduce((s, e) => s + Math.max(e.value, 0), 0) || 1;
  const components = eig.map(({ value, vector }) => {
    // Eigenvector sign is arbitrary; point the dominant loading positive so axes don't flip
    let big = 0;
    for (let i = 1; i < vector.length; i++) if (Math.abs(vector[i]) > Math.abs(vector[big])) big = i;
    const sign = vector[big] < 0 ? -1 : 1;
    return { value: Math.max(value, 0), ratio: Math.max(value, 0) / total, vector: vector.map((v) => v * sign) };
  });
  return { mean: mu, components };
}

export function pearson(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

// Ranks starting at 1, ties get their average rank
export function ranks(a) {
  const idx = Array.from(a, (_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Float64Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(x, y) {
  return pearson(ranks(x), ranks(y));
}

// Kendall's tau-b. O(n²), so callers should pass a subsample for large n.
export function kendall(x, y) {
  let conc = 0, disc = 0, tiesX = 0, tiesY = 0;
  for (let i = 0; i < x.length - 1; i++) {
    for (let j = i + 1; j < x.length; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j];
      const s = dx * dy;
      if (s > 0) conc++;
      else if (s < 0) disc++;
      else if (dx === 0 && dy !== 0) tiesX++;
      else if (dy === 0 && dx !== 0) tiesY++;
    }
  }
  const denom = Math.sqrt((conc + disc + tiesX) * (conc + disc + tiesY));
  return denom ? (conc - disc) / denom : NaN;
}

// Share of the variance in `values` explained by the categorical `groups` (group index per value)
export function etaSquared(values, groups) {
  const mu = mean(values);
  const sums = new Map();
  let ssTotal = 0;
  for (let i = 0; i < values.length; i++) {
    ssTotal += (values[i] - mu) ** 2;
    const g = sums.get(groups[i]) ?? { sum: 0, n: 0 };
    g.sum += values[i];
    g.n++;
    sums.set(groups[i], g);
  }
  let ssBetween = 0;
  for (const { sum, n } of sums.values()) ssBetween += n * (sum / n - mu) ** 2;
  return ssTotal ? ssBetween / ssTotal : NaN;
}
