import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const fade = (t) => t * t * (3 - 2 * t);

// Smooth 3D value noise in [-1, 1]; same position always gives the same value
export function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  let sum = 0;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dz = 0; dz < 2; dz++) {
        const weight = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        sum += weight * hash(xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return sum * 2 - 1;
}

// Extent along X that bending applies to (0 = shape cannot bend)
export function bendLength(type, p) {
  if (type === 'snake') return p.length + 2 * p.radius;
  if (type === 'slab') return p.width;
  return 0;
}

// Bends a straight piece lying along X into an upward arc.
// curvature 0..1 maps to a bend of 0..180 degrees.
export function bendPoint(v, length, curvature) {
  const theta = curvature * Math.PI;
  if (theta < 1e-4) return v;
  const R = length / theta;
  const a = v.x / R;
  const x = (R - v.y) * Math.sin(a);
  const y = R - (R - v.y) * Math.cos(a);
  // Shift down so the arc stays roughly centred on the piece origin
  return v.set(x, y - (R * (1 - Math.cos(theta / 2))) / 2, v.z);
}

// Volume of the unbent, unscaled shape (bending roughly preserves it)
export function pieceVolume(type, p) {
  if (type === 'ball') return (4 / 3) * Math.PI * p.radius ** 3;
  if (type === 'snake') return Math.PI * p.radius ** 2 * p.length + (4 / 3) * Math.PI * p.radius ** 3;
  return p.width * p.thickness * p.depth;
}

// Capsule lying along X, built as a lathe so the body has enough rings to bend smoothly
function snakeGeometry(p) {
  const r = p.radius, h = p.length / 2;
  const capSteps = 12, bodySteps = Math.max(16, Math.ceil(p.length * 12));
  const pts = [];
  for (let i = 0; i <= capSteps; i++) {
    const a = -Math.PI / 2 + (i / capSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r * Math.cos(a), -h + r * Math.sin(a)));
  }
  for (let i = 1; i < bodySteps; i++) {
    pts.push(new THREE.Vector2(r, -h + (2 * h * i) / bodySteps));
  }
  for (let i = 0; i <= capSteps; i++) {
    const a = (i / capSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r * Math.cos(a), h + r * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

function slabGeometry(p) {
  return new THREE.BoxGeometry(
    p.width, p.thickness, p.depth,
    Math.max(8, Math.ceil(p.width * 12)), 2, Math.max(4, Math.ceil(p.depth * 6)),
  );
}

// p holds the shape params plus `texture` (0..1), which roughens the surface
export function buildGeometry(type, p) {
  let geo;
  if (type === 'ball') geo = new THREE.SphereGeometry(p.radius, 64, 40);
  else if (type === 'snake') geo = snakeGeometry(p);
  else geo = slabGeometry(p);

  // Weld seams so displacement cannot tear the surface and normals come out smooth
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const pos = geo.attributes.position;
  const len = bendLength(type, p);
  const amp = 0.08 * (p.texture ?? 0);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (amp > 0) {
      const f = 2.5, x = v.x * f, y = v.y * f, z = v.z * f;
      v.x += amp * valueNoise(x, y, z);
      v.y += amp * valueNoise(x + 17.3, y - 4.1, z + 9.7);
      v.z += amp * valueNoise(x - 8.2, y + 13.5, z - 21.1);
    }
    if (len) bendPoint(v, len, p.curvature ?? 0);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
