import { keyedError } from './i18n.js';

// Browser storage helpers that never throw: private windows, blocked cookies and full
// storage all just mean "nothing saved". No DOM, so it can be tested in Node.

export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// The stored object, or null when it is missing, unreadable or not a plain object
export function loadLocal(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable
  }
}

// Share links carry the scene in the URL fragment (#scene=…), which never reaches a server.
// Token format: "1." + base64url(deflate-raw(JSON)), or "0." + base64url(JSON) where
// CompressionStream is missing.

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeShare(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'undefined') return `0.${toBase64Url(bytes)}`;
  return `1.${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
}

export async function decodeShare(token) {
  try {
    const [format, body] = [token.slice(0, 2), token.slice(2)];
    let bytes = fromBase64Url(body);
    if (format === '1.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (format !== '0.') throw new Error('unknown format');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw keyedError('err.badLink');
  }
}

export function shareTokenFromHash(hash) {
  const m = /^#scene=([^&]+)/.exec(hash ?? '');
  return m ? m[1] : null;
}
