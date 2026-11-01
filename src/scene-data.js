// Checks a scene file or share-link payload before anything in the scene is touched, so a broken
// file can't leave a half-loaded scene behind. No DOM, so it can be tested in Node.
import { keyedError } from './i18n.js';

// Must match DOUGH_TYPES in pieces.js
const DOUGH_KEYS = ['classic', 'glossy', 'glitter'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v) => (Array.isArray(v) && v.length === 3 && v.every(isNum) ? v : undefined);

// shapeParams: { [type]: [parameter names] }. Returns { density, pieces } with only usable fields;
// anything malformed is left out so the piece falls back to its defaults.
export function normalizeScene(data, shapeParams) {
  if (data?.app !== 'doughlab' || !Array.isArray(data.pieces)) throw keyedError('err.notScene');
  const pieces = [];
  for (const d of data.pieces) {
    if (!d || typeof d !== 'object' || !shapeParams[d.type]) continue;
    const params = {};
    for (const k of shapeParams[d.type]) if (isNum(d.params?.[k])) params[k] = d.params[k];
    const piece = { type: d.type, params };
    if (typeof d.name === 'string') piece.name = d.name;
    if (typeof d.group === 'string') piece.group = d.group;
    if (typeof d.color === 'string' && /^#[0-9a-f]{6}$/i.test(d.color)) piece.color = d.color;
    if (DOUGH_KEYS.includes(d.dough)) piece.dough = d.dough;
    if (isNum(d.texture)) piece.texture = Math.min(1, Math.max(0, d.texture));
    if (Number.isInteger(d.seed)) piece.seed = d.seed;
    if (typeof d.link === 'string') piece.link = d.link;
    for (const k of ['position', 'rotation', 'scale']) if (vec3(d[k])) piece[k] = d[k];
    pieces.push(piece);
  }
  const density = isNum(data.density) && data.density > 0 ? data.density : undefined;
  return { density, pieces };
}
