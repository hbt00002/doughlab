import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeStamp, stampIndex } from '../tools/stamp-version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const minimalHtml = `<!doctype html>
<link rel="stylesheet" href="style.css">
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"
  }
}
</script>
<script type="module" src="src/main.js"></script>`;

test('stampIndex adds an import-map entry per module and versions the stylesheet', () => {
  const out = stampIndex(minimalHtml, 'abc', ['main', 'analysis']);
  assert.ok(out.includes('"./src/analysis.js": "./src/analysis.js?v=abc"'));
  assert.ok(out.includes('"./src/main.js": "./src/main.js?v=abc"'));
  assert.ok(out.includes('href="style.css?v=abc"'));
  assert.ok(out.includes('src="src/main.js?v=abc"'));
  assert.ok(out.includes('"three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"'));
});

test('stampIndex is idempotent', () => {
  const once = stampIndex(minimalHtml, 'abc', ['main']);
  assert.equal(stampIndex(once, 'abc', ['main']), once);
});

test('stampIndex replaces an older stamp', () => {
  const old = stampIndex(minimalHtml, 'old', ['main']);
  const out = stampIndex(old, 'new', ['main']);
  assert.ok(!out.includes('?v=old'));
  assert.ok(out.includes('href="style.css?v=new"'));
});

test('index.html carries the current stamp', () => {
  const stamp = computeStamp(root);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(`style.css?v=${stamp}`), 'stylesheet stamp is stale: run node tools/stamp-version.mjs');
  for (const f of readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    assert.ok(html.includes(`"./src/${f}": "./src/${f}?v=${stamp}"`), `${f} stamp is stale: run node tools/stamp-version.mjs`);
  }
});
