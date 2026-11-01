// Release helper: pins every local module and the stylesheet to a content hash in index.html,
// so a browser can never mix cached old files with new ones after a deploy.
//
//   node tools/stamp-version.mjs
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const listDir = (root, dir, filter) =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(filter).sort().map((f) => `${dir}/${f}`) : [];

export function sourceModules(root) {
  return listDir(root, 'src', (f) => f.endsWith('.js')).map((f) => f.slice(4, -3));
}

// First 10 hex characters of a SHA-256 over every stamped file's path and contents
export function computeStamp(root) {
  const hash = createHash('sha256');
  const files = [...listDir(root, 'src', (f) => f.endsWith('.js')), 'style.css', ...listDir(root, 'fonts', () => true)];
  for (const file of files) {
    const data = readFileSync(join(root, file));
    hash.update(file);
    // Line endings may differ between checkouts; text is hashed with LF only
    hash.update(/\.(js|css)$/.test(file) ? data.toString('utf8').replace(/\r\n/g, '\n') : data);
  }
  return hash.digest('hex').slice(0, 10);
}

export function stampIndex(html, stamp, modules) {
  html = html.replace(/(<script type="importmap">)([\s\S]*?)(<\/script>)/, (_, open, body, close) => {
    const map = JSON.parse(body);
    for (const key of Object.keys(map.imports)) if (key.startsWith('./src/')) delete map.imports[key];
    for (const m of modules) map.imports[`./src/${m}.js`] = `./src/${m}.js?v=${stamp}`;
    const json = JSON.stringify(map, null, 2).replace(/\n/g, '\n    ');
    return `${open}\n    ${json}\n  ${close}`;
  });
  return html
    .replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${stamp}"`)
    .replace(/src="src\/main\.js(\?v=[^"]*)?"/, `src="src/main.js?v=${stamp}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const stamp = computeStamp(root);
  const file = join(root, 'index.html');
  writeFileSync(file, stampIndex(readFileSync(file, 'utf8'), stamp, sourceModules(root)));
  console.log(stamp);
}
