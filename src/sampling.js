import * as THREE from 'three';
import { bendLength, bendPoint } from './geometry.js';

// Seeded RNG so a piece keeps the same point cloud while its sliders move
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Rejection-samples one point uniformly inside the unbent shape
function insidePoint(type, p, rand, out) {
  if (type === 'slab') {
    return out.set((rand() - 0.5) * p.width, (rand() - 0.5) * p.thickness, (rand() - 0.5) * p.depth);
  }
  const r = p.radius;
  const h = type === 'snake' ? p.length / 2 : 0;
  for (;;) {
    out.set((rand() * 2 - 1) * (h + r), (rand() * 2 - 1) * r, (rand() * 2 - 1) * r);
    const dx = Math.max(Math.abs(out.x) - h, 0);
    if (dx * dx + out.y * out.y + out.z * out.z <= r * r) return out;
  }
}

// Returns `count` points (x, y, z flattened) in the piece's local coordinates.
// texture 0..1 adds isotropic Gaussian scatter, i.e. measurement noise.
export function samplePiece(type, p, texture, count, seed) {
  const rand = mulberry32(seed);
  const len = bendLength(type, p);
  const sigma = 0.3 * texture;
  const out = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    insidePoint(type, p, rand, v);
    if (len) bendPoint(v, len, p.curvature ?? 0);
    if (sigma > 0) {
      v.x += sigma * gaussian(rand);
      v.y += sigma * gaussian(rand);
      v.z += sigma * gaussian(rand);
    }
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}
