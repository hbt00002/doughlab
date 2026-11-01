import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

// Custom properties declared in the first rule whose selector matches
function tokens(selectorRe) {
  const m = css.match(new RegExp(`${selectorRe.source}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no rule for ${selectorRe}`);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}

function luminance(hex) {
  const n = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const PAIRS = [
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-2'],
  ['accent-text', 'accent'],
  ['accent-ink', 'surface'],
  ['danger', 'surface'],
];

for (const [name, selector] of [['light', /:root/], ['dark', /:root\[data-theme="dark"\]/]]) {
  test(`${name} theme tokens meet WCAG AA (4.5:1)`, () => {
    const t = { ...tokens(/:root/), ...tokens(selector) };
    for (const [fg, bg] of PAIRS) {
      assert.match(t[fg] ?? '', /^#[0-9a-f]{6}$/i, `--${fg} must be a 6-digit hex colour`);
      assert.match(t[bg] ?? '', /^#[0-9a-f]{6}$/i, `--${bg} must be a 6-digit hex colour`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
  });
}
