# DoughLab Professional, Accessible Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn DoughLab into a polished, accessible, shareable tool.

- New "Laboratuvar" look with the Lexend typeface, plus a dark theme.
- WCAG 2.1 AA accessibility.
- Undo/redo, autosave and share links.
- Ghost-data analysis and better phone support.
- Behind the scenes: cache-safe releases, a modular codebase, automated tests and normalised line endings.

**Architecture:** Still a static ES-module site with no build step.

- `src/main.js` is split into focused modules that share one `state` object (`src/state.js`).
- Pure logic (history, share encoding, column regression) lives in DOM-free modules so `node --test` can import it.
- `index.html`'s import map pins every local module to a `?v=<stamp>` URL that a Node script computes. A release can therefore never mix old and new files.

**Tech Stack:**
- Runtime: vanilla JS (ES modules), Three.js r169 via the jsDelivr import map, HTML/CSS.
- Font: Lexend (self-hosted woff2, OFL).
- Tooling: Node ≥ 20 for `node --test` and `tools/stamp-version.mjs`; GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-11-01-doughlab-polish-design.md`

## Global Constraints

- **Hosting:** static site on GitHub Pages. No bundler, no package manager, no server, no analytics.
- **Three.js:** stays r169 from `https://cdn.jsdelivr.net/npm/three@0.169.0/`.
- **Languages:**
  - Every new user-facing string exists in both `tr` and `en` in `src/i18n.js`.
  - Percent format stays `%46.3` (TR) / `46.3%` (EN), via `pct()` from `src/i18n.js`.
- **Compatibility:**
  - Scene files with `app: 'doughlab', version: 1` keep loading; the export JSON stays version 1, with an optional `link` per piece.
  - CSV export columns stay `x,y,z,group,piece,shape,dough`.
- **Contrast (WCAG 2.1 AA):** ≥ 4.5:1 for body text and ≥ 3:1 for large text and UI boundaries, in both themes.
- **Hit targets:** ≥ 24×24 CSS px; ≥ 44×44 when `(pointer: coarse)`.
- **Typeface:** Lexend, weights body 500, labels/buttons 600, headings 700. Tabular figures for numbers. Fallback stack `system-ui, "Segoe UI", sans-serif`.
- **Colours:** lab theme with a white/light-grey surface and one blue accent around `#2563eb`. Dough colours unchanged.
- **Storage keys:**
  - `doughlab-lang` (exists)
  - `doughlab-theme` (`auto` | `light` | `dark`)
  - `doughlab-autosave`
- **History limit:** 100 steps. **Share-link warning:** above 8000 characters. **Autosave debounce:** 500 ms.
- **Commits:** no AI attribution lines in commit messages.

## Review Focus

1. **A shared link is opened while an autosave exists.** The shared scene loads, and one undo brings back the autosaved scene. (Task 8 browser check, Task 6 history test `undo after reset-with-previous`.)
2. **A corrupt or foreign autosave value is in `localStorage`.** The app starts empty with no error and no toast. (Task 7 test `loadLocal returns null on bad JSON`.)
3. **The "Ghost data" analysis scope is active when the ghost is removed.** The scope falls back to "All pieces" and the panel shows normal results. (Task 10 browser check.)
4. **Ctrl+Z is pressed while typing in a text field.** The browser's own text undo runs and the scene does not change. (Task 6 browser check.)
5. **Storage throws (private mode or quota).** Autosave silently does nothing and every other feature works. (Task 7 test `saveLocal swallows storage errors`.)

---

### Task 1: Normalise line endings

**Files:**
- Create: `.gitattributes`

- [ ] **Step 1: Create `.gitattributes`**

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.woff2 binary
```

- [ ] **Step 2: Renormalise**

Run: `git add --renormalize . && git status --short`
Expected: lists only files whose line endings change (possibly none), and no content changes in `git diff --cached --ignore-all-space --stat`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Normalise line endings to LF"
```

---

### Task 2: Test harness, existing-logic tests, CI

**Files:**
- Create:
  - `tests/analysis.test.mjs`
  - `tests/ghost-data.test.mjs`
  - `tests/i18n.test.mjs`
  - `tests/fixtures/gapminder.csv`
  - `.github/workflows/test.yml`
- Modify: `src/i18n.js` (export the dictionary for the parity test)

**Interfaces:**
- Produces: `export const STRINGS` from `src/i18n.js` (the existing `{ tr, en }` object).
- Produces: the test command for all later tasks, `node --test tests/`.

- [ ] **Step 1: Add the Gapminder fixture**

Save the full `gapminderDataFiveYear.csv` (1704 rows; source `https://raw.githubusercontent.com/plotly/datasets/master/gapminderDataFiveYear.csv`) to `tests/fixtures/gapminder.csv`. It is about 80 KB and keeps the tests offline.

- [ ] **Step 2: Write `tests/analysis.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pca, pearson, spearman, kendall, etaSquared, linearRegression, projectedVarianceRatio } from '../src/analysis.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('pearson of a perfect line is 1', () => close(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1));
test('spearman handles ties with average ranks', () => close(spearman([1, 2, 2, 3], [1, 2, 2, 3]), 1));
test('kendall tau-b of reversed order is -1', () => close(kendall([1, 2, 3, 4], [4, 3, 2, 1]), -1));
test('eta squared is 1 when groups explain everything', () => close(etaSquared([1, 1, 5, 5], ['a', 'a', 'b', 'b']), 1));
test('pca ratios sum to 1 and are sorted', () => { /* random 3-col data; assert sum≈1, r1≥r2≥r3 */ });
test('linearRegression recovers y = 1 + 2x - 0.5z', () => { /* noise-free data; intercept≈1, coef≈[2,-0.5], r2≈1, predictors [0,2] */ });
test('projected variance along PC3 equals PC1+PC2', () => { /* close(projectedVarianceRatio(cols, c[2].vector), c[0].ratio + c[1].ratio) */ });
```

Fill in the three commented bodies with deterministic data, using `mulberry32(1)` from `src/sampling.js`.

- [ ] **Step 3: Write `tests/ghost-data.test.mjs`**

```js
test('parseCSV reads comma, quotes and BOM', ...)          // '﻿a,b\n"x, y",2' → header ['a','b'], rows [['x, y','2']]
test('parseCSV reads semicolon with decimal comma', ...)    // 'a;b;c\n1,5;2;3' → parseNumber('1,5', ';') === 1.5
test('parseCSV reads tab-separated', ...)
test('Gapminder standardised PCA is 46.3 / 25.5 / 19.0 %', ...)
  // table = parseCSV(fixture); columns = indices of year,pop,lifeExp,gdpPercap; colorBy = continent;
  // standardize true, logSkewed false → ratios rounded to 0.1% equal [46.3, 25.5, 19.0], dropped === 0
test('buildGhostData exposes original variables', ...)     // see Task 10 — leave as test.todo until then
```

- [ ] **Step 4: Write `tests/i18n.test.mjs`**

```js
test('every key exists in both languages', () => {
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
});
test('placeholders match between languages', ...)  // same set of {name} tokens per key
```

- [ ] **Step 5: Export `STRINGS` in `src/i18n.js`**

Change `const STRINGS` to `export const STRINGS`.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/`
Expected: all pass. The `test.todo` from Step 3 is reported as todo.

- [ ] **Step 7: Add `.github/workflows/test.yml`**

The workflow runs on `push` and `pull_request`: `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22`, then `node --test tests/`.

- [ ] **Step 8: Commit**

```bash
git add tests .github src/i18n.js
git commit -m "Add node:test suite for analysis, CSV parsing and translations, with CI"
```

---

### Task 3: Split `main.js` into modules (no behaviour change)

**Files:**
- Create:
  - `src/state.js`
  - `src/scene.js`
  - `src/pieces.js`
  - `src/selection.js`
  - `src/ui.js`
  - `src/panels.js`
  - `src/analysis-ui.js`
  - `src/ghost-ui.js`
- Modify: `src/main.js` (becomes startup and wiring only)

**Interfaces (Produces, used by every later task):**
- `src/state.js`:
  ```js
  export const state = {
    pieces: [],
    selection: [],
    selected: null,
    linkCounter: 0,
    typeCounters: { ball: 0, snake: 0, slab: 0 },
    settings: { density: 60, view: 'dough' },
    analysis: { scope: 'all', tab: 'pca', showAxes: true, regTarget: 1, showPlane: true, azimuth: 35, elevation: 55 },
    ghost: { /* current ghostState fields */ },
  };
  export const isTouch;  // boolean
  ```
- `src/scene.js`: `renderer`, `scene`, `camera`, `orbit`, `gizmo`, `sun`, `SUN_HOME`, `grid`, `viewport`, `raycaster`, `rayFromEvent(e)`.
- `src/pieces.js`:
  - Catalogue: `COLORS`, `DOUGH_TYPES`, `SHAPES`, `PARAM_SPECS`, `colorName(hex)`, `isDefaultGroup(group, hex)`.
  - Piece lifecycle: `createPiece(type, opts)`, `rebuildGeometry(p)`, `updateMaterial(p)`, `applyView(p)`, `refreshPoints(p)`, `removePiece(p)`, `duplicatePiece(p, link)`, `addPiece(type)`, `clearScene()`.
  - Scene files: `serializeScene()`, `loadScene(data)`, `exampleScene()`, `exportCSV()`, `setDensity(v)`.
- `src/selection.js`:
  - Selection: `setSelection(list, render = true)`, `select(piece)`, `toggleSelection(piece)`, `withLinked(list)`.
  - Grouping and bulk actions: `groupSelection()`, `ungroupSelection()`, `deleteSelection()`, `duplicateSelected()`, `setMode(mode)`.
  - Gizmo and pointer handlers live here.
- `src/ui.js`: `el`, `fmt`, `slider`, `textField`, `selectField`, `checkbox`, `withBold`, `showToast(text)`, `download(name, text, type)`.
- `src/panels.js`: `renderList()`, `renderProps()`, `updateStatus()`.
- `src/analysis-ui.js`:
  - Scheduling: `scheduleAnalysis()`, `runAnalysis()`, `collectData()`, `collectWorldPoints(source)`, `emptyMessage(data)`.
  - Shadow controls: `syncShadowSliders()`, `setLightDirection(vec)`, `lightAlongPC(index)`.
- `src/ghost-ui.js`: `loadGhostTable(text, fileName)`, `rebuildGhost()`, `renderGhostSettings()`, `updateGhostFit()`, `showGhostRow(e)`, `loadGapminder()` (the fetch currently inside the button handler), `removeGhost()`.

Rules:
- All mutable top-level `let`/`const` state moves into `state`. For example, `selection` becomes `state.selection` and `analysisState` becomes `state.analysis`.
- Modules import functions from each other directly. A cycle such as panels ↔ selection is fine because calls happen at runtime, not at import time.
- Delete the unused `escapeHtml`.

- [ ] **Step 1: Create `state.js`, then move code module by module in this order**

  1. `ui`
  2. `scene`
  3. `pieces`
  4. `selection`
  5. `panels`
  6. `analysis-ui`
  7. `ghost-ui`

After each move, load the page and check the console for errors.

- [ ] **Step 2: Reduce `main.js` to wiring**

`main.js` keeps only:
- Language init.
- DOM event wiring that is not owned by a module.
- `applyLanguage()`.
- The final `applyLanguage()` call.

- [ ] **Step 3: Verify behaviour is unchanged**

Run: `node --test tests/` → all pass.

Browser smoke test on `python -m http.server`, checking that the console shows no errors throughout:

1. Example scene loads.
2. PCA, Regression and Shadow tabs render.
3. Gapminder ghost loads.
4. Shift+drag box select, then Ctrl+G group and move.
5. EN/TR switch.
6. Save/open scene; download CSV.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "Split main.js into focused modules"
```

---

### Task 4: Cache-safe releases (version stamp)

**Files:**
- Create: `tools/stamp-version.mjs`, `tests/stamp.test.mjs`
- Modify: `index.html` (import map and stylesheet link)

**Interfaces:**
- Produces:
  - `export function computeStamp(rootDir: string): string`: the first 10 hex characters of the SHA-256 over the sorted relative paths and contents of `src/*.js`, `style.css` and `fonts/*` (if present).
  - `export function stampIndex(html: string, stamp: string, modules: string[]): string`: returns `index.html` with:
    - one import-map entry per module, `"./src/<name>.js": "./src/<name>.js?v=<stamp>"`;
    - the stylesheet href set to `style.css?v=<stamp>`;
    - the module script tag set to `src="src/main.js?v=<stamp>"`.
- CLI: `node tools/stamp-version.mjs` rewrites `index.html` in place and prints the stamp.

- [ ] **Step 1: Write `tests/stamp.test.mjs`**

```js
test('stampIndex adds an import-map entry per module and versions the stylesheet', ...)
  // given minimal html with the existing importmap, modules ['main','analysis'], stamp 'abc'
  // → contains '"./src/analysis.js": "./src/analysis.js?v=abc"' and 'style.css?v=abc' and 'src/main.js?v=abc'
test('stampIndex is idempotent', ...)        // stamping twice with the same stamp gives identical output
test('index.html carries the current stamp', ...)
  // computeStamp(repoRoot) → index.html contains `?v=${stamp}` for style.css and for every src/*.js
```

- [ ] **Step 2: Run it**

Run: `node --test tests/stamp.test.mjs`
Expected: FAIL with "Cannot find module '../tools/stamp-version.mjs'".

- [ ] **Step 3: Implement `tools/stamp-version.mjs`**

Use `node:crypto` `createHash('sha256')` and `node:fs`. Keep the `three` and `three/addons/` entries untouched. The import map stays a single JSON block: parse it, edit it and re-serialise it with two-space indent.

- [ ] **Step 4: Stamp and test**

Run: `node tools/stamp-version.mjs && node --test tests/`
Expected: prints a 10-character stamp; all tests pass.

- [ ] **Step 5: Browser check**

The network panel shows every `src/*.js` and `style.css` requested with `?v=<stamp>`. No module is requested twice, once with the stamp and once without.

- [ ] **Step 6: Commit**

```bash
git add tools tests/stamp.test.mjs index.html
git commit -m "Version-stamp modules and stylesheet so releases never mix cached files"
```

From here on, every task that changes `src/*.js` or `style.css` runs `node tools/stamp-version.mjs` before committing; the stamp test fails otherwise.

---

### Task 5: Lab visual system, Lexend, dark theme, top bar, icons

**Files:**
- Create:
  - `fonts/Lexend-latin.woff2`
  - `fonts/Lexend-latin-ext.woff2`
  - `fonts/OFL.txt`
  - `src/theme.js`
  - `src/icons.js`
- Modify:
  - `style.css` (rewrite onto tokens)
  - `index.html` (top bar, icons, font preload)
  - `src/scene.js` (theme colours)
  - `src/i18n.js` (new strings)
  - `src/main.js` (wiring)

**Interfaces:**
- Produces in `src/theme.js`:
  - `initTheme(onChange: (resolved: 'light'|'dark') => void): void`
  - `setThemeMode(mode: 'auto'|'light'|'dark'): void`
  - `getThemeMode()`
  - `resolvedTheme(): 'light'|'dark'`

  Persisted under `doughlab-theme`, applied as `data-theme` on `<html>`. In `auto` mode it follows `prefers-color-scheme` and listens for changes.
- Produces in `src/scene.js`: `applySceneTheme(resolved)`, which sets the scene background, grid colours, ground shadow opacity and the analysis arrow/label colours.

  | Theme | Background | Grid lines |
  |---|---|---|
  | Light | `#f3f4f6` | `#d1d5db` / `#e5e7eb` |
  | Dark | `#111318` | `#2b2f37` / `#1f232a` |

- Produces in `src/icons.js`: `icon(name: string): SVGElement`, 18×18, `currentColor`, `aria-hidden="true"`. Names:
  - Shapes: `ball`, `snake`, `slab`
  - Modes: `move`, `rotate`, `scale`
  - Actions: `duplicate`, `delete`, `undo`, `redo`, `share`
  - Toggles: `sun`, `moon`, `language`, `more`

- [ ] **Step 1: Fetch Lexend**

Request `https://fonts.googleapis.com/css2?family=Lexend:wght@500..700&display=swap` with a modern-browser User-Agent. Save the latin and latin-ext woff2 files it references. Save `OFL.txt` from `https://raw.githubusercontent.com/googlefonts/lexend/main/OFL.txt`. Confirm the latin-ext file covers `ğ ş ı İ`; the browser check below shows them.

- [ ] **Step 2: Rewrite `style.css` on tokens**

`:root` defines:
- Surfaces: `--surface`, `--surface-2`, `--surface-stage`
- Text: `--text`, `--text-muted`
- Lines and accent: `--line`, `--accent`, `--accent-text`, `--danger`, `--focus`
- Shape: `--radius-sm/md/lg`, `--shadow-card`
- Spacing: `--space-1…6` (4 px scale)
- Type: `--font: "Lexend", system-ui, "Segoe UI", sans-serif`, plus `--fs-xs/sm/md/lg/xl`

`[data-theme="dark"]` overrides the colour tokens.

Layout:
- A 48 px top bar spans both columns.
- The sidebar sections are separated by 1 px rules, not boxed cards.
- The analysis panel is a white card with `--shadow-card`.
- `@font-face` declarations for both Lexend files with `font-display: swap` and the latin / latin-ext `unicode-range`s.
- Body weight 500, labels and buttons 600, headings 700. `font-variant-numeric: tabular-nums` on numeric cells.

Focus and motion:
- A visible `:focus-visible` ring (2 px `--focus` with offset) on every interactive element.
- `@media (prefers-reduced-motion: reduce)` removes transitions.

- [ ] **Step 3: Top bar in `index.html`**

`<header class="topbar">`, left to right:
1. Title "DoughLab", with "· veri geometrisi" / "· data geometry" (`data-i18n="brand.tagline"`).
2. Undo button `#btn-undo`, disabled.
3. Redo button `#btn-redo`, disabled.
4. Share button `#btn-share`.
5. Theme toggle `#theme-toggle`, cycling auto → light → dark, with an `aria-label` naming the current mode.
6. Language toggle `#lang-toggle`, moved from the sidebar.

Every button has an icon and a visible text label. Below 800 px, theme and language move into a `#more-menu` button with a disclosure popover, `aria-expanded`.

- [ ] **Step 4: Icons**

Use `icon()` for the shape buttons, mode toolbar, duplicate/delete and the top-bar buttons. Labels stay visible.

- [ ] **Step 5: New i18n keys (tr/en)**

- `theme.auto`
- `theme.light`
- `theme.dark`
- `theme.label` ("Tema: {mode}" / "Theme: {mode}")
- `top.undo`
- `top.redo`
- `top.share`
- `top.more`

- [ ] **Step 6: Contrast check**

Add `test('theme tokens meet WCAG AA', …)` to a new `tests/contrast.test.mjs`.

- It parses `style.css` for the light and dark `--text`/`--surface`, `--text-muted`/`--surface`, `--accent-text`/`--accent` and `--text`/`--surface-2` pairs.
- It computes the WCAG relative-luminance contrast ratio and asserts ≥ 4.5 for each pair.

Run: `node --test tests/` → PASS.

- [ ] **Step 7: Browser check**

Check in both themes and at 375 px and 1280 px wide:
- Lexend renders, including Turkish letters.
- The theme toggle works and persists across reload.
- The 3D scene colours follow the theme.
- The console shows no errors.

- [ ] **Step 8: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add fonts src style.css index.html tests/contrast.test.mjs
git commit -m "Lab visual system with Lexend, dark theme, top bar and icons"
```

---

### Task 6: Undo / redo

**Files:**
- Create: `src/history.js`, `src/history-ui.js`, `tests/history.test.mjs`
- Modify:
  - `src/pieces.js`
  - `src/selection.js`
  - `src/panels.js`
  - `src/main.js` (keys and buttons)
  - `src/i18n.js` (`toast.undo`, `toast.redo`)

**Interfaces:**
- Produces in `src/history.js`, with no DOM:
  ```js
  export function createHistory(limit = 100) → {
    reset(snapshot),             // clears both stacks, sets current
    commit(snapshot) → boolean,  // pushes previous current; false (no-op) if JSON-equal to current; clears redo
    undo() → snapshot | null,    // returns the snapshot to restore
    redo() → snapshot | null,
    canUndo() → boolean, canRedo() → boolean,
  }
  ```
  A `snapshot` is `{ scene: <serializeScene() output>, selection: number[] }`, where `selection` holds indices into `state.pieces`.
- Produces in `src/history-ui.js`:
  - `recordChange()` commits `currentSnapshot()` and updates the button states.
  - `undo()` and `redo()` restore a snapshot with `loadScene(snapshot.scene, { keepCamera: true })` plus `setSelection`.
- Modifies `loadScene(data, { keepCamera = true } = {})`. It already keeps the camera; the option is documented, not new behaviour.

- [ ] **Step 1: Write `tests/history.test.mjs`**

```js
test('commit then undo returns the previous snapshot', ...)
test('redo after undo returns the newer snapshot', ...)
test('commit of an identical snapshot is a no-op', ...)     // commit returns false, canUndo unchanged
test('a new commit clears the redo stack', ...)
test('history keeps at most `limit` undo steps', ...)        // limit 3, 5 commits → 3 undos then null
test('undo after reset-with-previous restores the previous scene', ...)
  // reset(A); commit(B) → undo() returns A   (models "shared link replaced autosave")
```

- [ ] **Step 2: Run them**

Run: `node --test tests/history.test.mjs`
Expected: FAIL with "Cannot find module '../src/history.js'".

- [ ] **Step 3: Implement `createHistory` in `src/history.js`**

Two arrays plus `current`. Compare snapshots by `JSON.stringify`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/` → PASS.

- [ ] **Step 5: Call `recordChange()` after every recorded action**

These record a step:
- `addPiece`, `deleteSelection`, `removePiece` from the props Delete button, `duplicateSelected`.
- Gizmo `dragging-changed` → false.
- Property sliders on the `change` event, not `input`.
- Colour swatch / custom colour `change`.
- Dough type.
- Name and group text fields on `change` (blur).
- `groupSelection`, `ungroupSelection`.
- Load scene, example scene, clear.
- Density slider on `change`.

`reset()` runs once at startup, after autosave/share restore (Tasks 7 and 8).

- [ ] **Step 6: Keys and buttons**

- `Ctrl+Z` → undo; `Ctrl+Shift+Z` and `Ctrl+Y` → redo. Wire them in the existing keydown handler, which already ignores events from `input, select, textarea`; that is Review Focus 4.
- `#btn-undo` / `#btn-redo` call the same functions.
- After undo/redo, `aria-live` announces `toast.undo` / `toast.redo` (Task 12 adds the live region; until then use `showToast`).

- [ ] **Step 7: Browser check**

1. Add a ball, move it, change its radius slider (one drag), recolour it, then delete it.
2. Press Ctrl+Z five times; each step reverts exactly one action.
3. Press Ctrl+Y five times; each step re-applies it.
4. Type in the name field and press Ctrl+Z; only the text changes, not the scene.

- [ ] **Step 8: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add src tests/history.test.mjs index.html
git commit -m "Add undo/redo with a 100-step snapshot history"
```

---

### Task 7: Autosave

**Files:**
- Create: `src/storage.js`, `tests/storage.test.mjs`
- Modify:
  - `src/main.js` (startup order)
  - `src/history-ui.js` (save after `recordChange`)
  - `src/ghost-ui.js` (ghost source descriptor)
  - `src/i18n.js` (`toast.restored`)

**Interfaces:**
- Produces in `src/storage.js` (localStorage helpers):
  - `saveLocal(key: string, value: object): boolean`: wraps `localStorage.setItem` in try/catch and returns false on any error.
  - `loadLocal(key: string): object | null`: returns null when the key is missing, the JSON is bad, or the value is not an object.
  - `clearLocal(key: string): void`
- Produces in `src/ghost-ui.js`:
  - `ghostDescriptor(): { source: 'gapminder', columns: string[], colorBy: string | null, standardize, logSkewed, visible, arrows } | null`. It returns null for a user CSV or when there is no ghost. Columns are stored by **name**, not index.
  - `applyGhostDescriptor(d): Promise<void>`: fetches Gapminder, then applies the settings by name.
- Autosave value: `{ v: 1, scene: serializeScene(), ghost: ghostDescriptor() }` under `doughlab-autosave`.

- [ ] **Step 1: Write `tests/storage.test.mjs`**

Install a fake `globalThis.localStorage` per test.

```js
test('saveLocal then loadLocal round-trips', ...)
test('loadLocal returns null on bad JSON', ...)              // Review Focus 2
test('loadLocal returns null for a non-object value', ...)   // '42', '"x"', 'null'
test('saveLocal swallows storage errors', ...)               // setItem throws QuotaExceededError → returns false, no throw (Review Focus 5)
test('loadLocal returns null when localStorage access throws', ...)
```

- [ ] **Step 2: Run them**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the three functions in `src/storage.js`**

- [ ] **Step 4: Run tests**

Run: `node --test tests/` → PASS.

- [ ] **Step 5: Wire autosave**

- After every `recordChange()`, and after ghost-settings changes, debounce 500 ms, then `saveLocal('doughlab-autosave', …)`.
- At startup, before the history `reset()`:
  - Read the autosave. If it holds a scene with at least one piece, or a ghost, call `loadScene` and `applyGhostDescriptor`.
  - Then show the `toast.restored` toast, "Önceki çalışman geri yüklendi" / "Your previous work was restored".
  - A null or invalid autosave starts empty and silent.
- "Clear" also calls `clearLocal('doughlab-autosave')`. The clear is still undoable through history.

- [ ] **Step 6: Browser check**

1. Build a scene, load the Gapminder ghost with two variables unticked, then reload: both come back.
2. Run `localStorage.setItem('doughlab-autosave', '{oops')` in the console and reload: an empty start with no console errors.

- [ ] **Step 7: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add src tests/storage.test.mjs index.html
git commit -m "Autosave the scene and Gapminder ghost in the browser"
```

---

### Task 8: Share link

**Files:**
- Modify:
  - `src/storage.js`
  - `tests/storage.test.mjs`
  - `src/main.js` (button and startup)
  - `src/ui.js` (link dialog)
  - `src/i18n.js`

**Interfaces:**
- Produces in `src/storage.js`:
  - `encodeShare(payload: object): Promise<string>`: JSON → UTF-8 → `CompressionStream('deflate-raw')` → base64url, prefixed `1.`. Without `CompressionStream`, it falls back to `0.` + base64url of the raw UTF-8.
  - `decodeShare(token: string): Promise<object>`: the inverse. On any failure it throws `keyedError('err.badLink')`.
  - `shareTokenFromHash(hash: string): string | null`: returns the value after `#scene=`, or null.
- Payload: `{ v: 1, scene, ghost }`, the same shape as the autosave value.
- Produces in `src/ui.js`: `showLinkDialog(url: string): void`. It opens a `<dialog>` with a read-only input holding the link, a Copy button and a Close button; focus moves to the input; Esc closes it.

- [ ] **Step 1: Add tests to `tests/storage.test.mjs`**

```js
test('encodeShare/decodeShare round-trip a scene with Turkish text', ...)   // names 'Çin', 'Ağaç İş'
test('encoded token is URL-safe', ...)                                      // matches /^[01]\.[A-Za-z0-9_-]+$/
test('decodeShare rejects garbage with err.badLink', ...)                    // 'zzz', '1.!!!', '' → rejects, err.key === 'err.badLink'
test('shareTokenFromHash extracts the token', ...)                           // '#scene=1.abc' → '1.abc'; '#x=1' → null
```

- [ ] **Step 2: Run them**

Run: `node --test tests/storage.test.mjs`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the three functions**

- [ ] **Step 4: Run tests**

Run: `node --test tests/` → PASS.

- [ ] **Step 5: Share button**

`#btn-share` builds `location.origin + location.pathname + '#scene=' + token`.

- **Clipboard:** `navigator.clipboard.writeText` followed by toast `toast.shared`, "Bağlantı kopyalandı" / "Link copied". When the payload has a non-Gapminder ghost, append `toast.sharedNoCsv`: your own CSV is not included in the link. If the clipboard is missing or throws, fall back to `showLinkDialog(url)`.
- **Long links:** if `url.length > 8000`, also show toast `toast.longLink`: the link may be too long for some apps; save a file instead.

- [ ] **Step 6: Opening a link (startup)**

1. Read the autosave first and `reset()` history with it.
2. If `shareTokenFromHash(location.hash)` returns a token, decode it, load it, and `commit()` it. One undo then returns to the autosave (Review Focus 1).
3. Remove the fragment with `history.replaceState(null, '', location.pathname + location.search)`.
4. A decode failure shows `err.badLink` and leaves the autosaved scene loaded.

- [ ] **Step 7: New i18n keys (tr/en)**

- `toast.shared`
- `toast.sharedNoCsv`
- `toast.longLink`
- `err.badLink`
- `dialog.copy`
- `dialog.close`
- `dialog.linkTitle`

- [ ] **Step 8: Browser check**

1. Share the example scene plus the Gapminder ghost, then open the link in a new tab: the same scene and ghost appear.
2. Press Ctrl+Z in that tab: the tab's previous autosave returns.
3. Open `#scene=garbage`: an error toast, and the scene is unchanged.

- [ ] **Step 9: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add src tests/storage.test.mjs index.html
git commit -m "Share scenes as compressed links"
```

---

### Task 9: Empty-state start card

**Files:**
- Modify:
  - `index.html` (`#empty-card` in `.stage`)
  - `style.css`
  - `src/panels.js` (`updateEmptyCard()` called from `updateStatus()`)
  - `src/ghost-ui.js` (call after a ghost loads or is removed)
  - `src/i18n.js`

**Interfaces:**
- Produces in `src/panels.js`: `updateEmptyCard(): void`. The card is visible when `state.pieces.length === 0 && !state.ghost.table`.

- [ ] **Step 1: Markup**

`<section id="empty-card" aria-labelledby="empty-title">` holds:
- An `h2` with `empty.title`.
- One sentence, `empty.text`.
- Three buttons, each with an icon and a label:
  - `empty.addBall` → `addPiece('ball')`
  - `empty.gapminder` → `loadGapminder()`
  - `empty.example` → load `exampleScene()`
- A hint line, `empty.hint`, which mentions the Analysis panel and `?` for shortcuts.

The card is centred on the stage and is a card in the lab style.

- [ ] **Step 2: i18n keys (tr/en)**

- `empty.title` ("Hamurla veri şekillendir" / "Shape data with dough")
- `empty.text`
- `empty.addBall`
- `empty.gapminder`
- `empty.example`
- `empty.hint`

- [ ] **Step 3: Browser check**

1. Fresh start: the card shows.
2. Each button hides it, and Ctrl+Z brings it back.
3. Tab reaches all three buttons.

- [ ] **Step 4: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add index.html style.css src
git commit -m "Add an empty-state start card"
```

---

### Task 10: Analysis on the ghost data

**Files:**
- Modify:
  - `src/analysis.js`
  - `src/ghost-data.js`
  - `tests/analysis.test.mjs`
  - `tests/ghost-data.test.mjs`
  - `src/analysis-ui.js`
  - `index.html` (scope button, regression column pickers)
  - `src/i18n.js`

**Interfaces:**
- Produces in `src/analysis.js`:
  - `regressOnColumns(y: ArrayLike<number>, xs: ArrayLike<number>[]): { intercept: number, coef: number[], r2: number, rmse: number, fitted: Float64Array, residuals: Float64Array }`. It supports 1 or 2 predictors.
  - `linearRegression(cols, target)` is re-implemented on top of `regressOnColumns` and keeps its current return shape.
- Produces in `src/ghost-data.js`: `buildGhostData` also returns `variables: { name: string, logged: boolean, values: Float64Array }[]`. These are the chosen columns after the optional log10 and **before** centring and standardising, aligned with `rowIndex`.
- Scope value `state.analysis.scope = 'ghost'`. `collectData()` then returns:
  - `cols`: the ghost positions split into x/y/z.
  - `groups`: category names.
  - `colors`: a CSS colour per point.
  - `source: null`.
  - `ghost: state.ghost.data`.
- `drawScatter` callers pass a per-point colour array, so it no longer reads `source[owners[i]].color`.
- New regression state: `state.analysis.ghostTarget` (variable name) and `state.analysis.ghostPredictors` (1–2 names). Defaults: the last chosen variable as the target, the first one or two others as predictors.

- [ ] **Step 1: Write the tests**

```js
// analysis.test.mjs
test('regressOnColumns with one predictor matches the closed form', ...)   // y = 3 + 2x → intercept 3, coef [2], r2 1
test('regressOnColumns with two predictors matches linearRegression', ...)
// ghost-data.test.mjs  (replace the Task 2 todo)
test('buildGhostData exposes original variables', ...)
  // Gapminder, logSkewed true → variables names = chosen columns; gdpPercap.logged === true;
  // variables[i].values[0] equals log10 of the first kept row's gdpPercap (within 1e-9); length === rowIndex.length
```

- [ ] **Step 2: Run them**

Run: `node --test tests/`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement `regressOnColumns`, refactor `linearRegression`, add `variables`**

- [ ] **Step 4: Run tests**

Run: `node --test tests/` → PASS, including the unchanged Gapminder 46.3 / 25.5 / 19.0 test.

- [ ] **Step 5: UI changes**

- **Scope control:** a third button, `scope.ghost` ("Hayalet veri" / "Ghost data"), disabled unless `state.ghost.data` exists.
- **Ghost removed or rebuilt into an invalid state:** reset the scope to `'all'` and update the active button (Review Focus 3).
- **PCA tab with the ghost scope:**
  - Show `ghost.ratios` and the per-variable loadings from `ghost.loadings` (variable names, not x/y/z), plus the shape verdict on `ratios`.
  - Hide the dough-only correlation and η² sections.
  - Do not draw PCA axes.
- **Shadow tab with the ghost scope:** runs unchanged on `cols`.
- **Regression tab with the ghost scope:**
  - The x/y/z target select is hidden; instead, show a target `<select>` of variable names and a predictor checkbox list, capped at 2.
  - The equation uses variable names, with `(log)` after logged ones.
  - No plane is drawn.
  - Residual plot and curvature check as for dough.
- **New i18n keys:** `scope.ghost`, `reg.ghostTarget`, `reg.ghostPredictors`, `reg.maxTwo`, `an.ghostLoadings`.

- [ ] **Step 6: Browser check**

1. Load the Gapminder ghost and pick the ghost scope.
2. **PCA:** shows 46.3 / 25.5 / 19.0.
3. **Shadow:** "Align with PCA" reaches 79.0%, the PC1+PC2 share of the 3D ghost: (46.3 + 25.5) / 90.9.
4. **Regression:** lifeExp ← gdpPercap (log) and year gives an R² displayed with a residual plot.
5. Remove the ghost: the scope returns to "All pieces" with no errors.

- [ ] **Step 7: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add src tests index.html
git commit -m "Run PCA, shadow and column regression on the ghost data"
```

---

### Task 11: Touch and phone layout

**Files:**
- Modify:
  - `index.html`
  - `style.css`
  - `src/selection.js`
  - `src/main.js`
  - `src/i18n.js`

**Interfaces:**
- Produces: `state.multiSelect: boolean`. While it is true, a tap behaves like Shift+click (`toggleSelection`).

- [ ] **Step 1: Multi-select toggle**

- On touch devices only (`isTouch`), the mode toolbar gets a toggle button `#tool-multi`: `aria-pressed`, the label `tool.multi` ("Çoklu seç" / "Multi-select") and an icon.
- In the canvas `pointerup` handler, `e.shiftKey || state.multiSelect` selects the toggle path.

- [ ] **Step 2: Bottom sheet at ≤ 800 px**

- `.analysis` becomes a static block below the stage instead of an overlay.
- The `#analysis-toggle` header acts as the sheet handle: `aria-expanded`, collapsed by default.
- The stage height stays at 60vh.

- [ ] **Step 3: Overflow menu**

Theme and language move into `#more-menu` below 800 px. The markup exists from Task 5; here the menu's open/close, Esc and outside-click behaviour is wired.

- [ ] **Step 4: Browser check**

With the mobile preset (375×812):
1. Multi-select toggle: tap two pieces and both are selected; Ctrl+G is reachable through the props-panel Group button.
2. The analysis sheet opens and closes.
3. No horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).

- [ ] **Step 5: Stamp and commit**

```bash
node tools/stamp-version.mjs
git add index.html style.css src
git commit -m "Touch multi-select, analysis bottom sheet and overflow menu on phones"
```

---

### Task 12: Accessibility pass

**Files:**
- Modify:
  - `index.html`
  - `style.css`
  - `src/panels.js`
  - `src/selection.js`
  - `src/analysis-ui.js`
  - `src/ui.js`
  - `src/scene.js`
  - `src/i18n.js`

**Interfaces:**
- Produces in `src/ui.js`: `announce(text: string): void`. It writes into a visually hidden `<div id="live" aria-live="polite">`; `showToast` also calls it.
- Produces in `src/panels.js`: a transform fieldset in the single-piece props panel.
  - Contents: position x/y/z, rotation x/y/z in degrees, and scale x/y/z, each a number `input`.
  - Editing a field writes to the mesh on `input`, calls `scheduleAnalysis()`, and calls `recordChange()` on `change`.
  - The fields re-sync after gizmo drags.

- [ ] **Step 1: Tabs pattern**

- `#analysis-tabs` buttons get `id`s, `aria-controls` pointing to their panes, and `aria-selected`.
- Panes get `role="tabpanel"` and `aria-labelledby`.
- Left/Right/Home/End move between tabs, with a roving `tabindex`. The scope control follows the same pattern as a radio group: `role="radiogroup"`, `aria-checked`.

- [ ] **Step 2: Keyboard manipulation**

- The canvas gets `tabindex="0"`, `role="application"`, an `aria-label` from `a11y.canvas`, and an `aria-describedby` live summary: "{pieces} parça, {points} gözlem" / "{pieces} pieces, {points} observations".
- While the canvas has focus and a selection exists:
  - Arrow keys move the selection by 0.1 on x/z (1.0 with Shift).
  - Page Up / Page Down move it on y.
  - Each key-up records one history step.
- Piece list rows already are buttons; add `aria-pressed` for selected rows.

- [ ] **Step 3: Announcements**

After each `runAnalysis()`, `announce()` a one-line summary, at most once per 1.5 s:

| Tab | Summary contains |
|---|---|
| PCA | PC1/PC2 percentages and the verdict word |
| Regression | R² |
| Shadow | kept variance vs best |

Use i18n keys `a11y.pca`, `a11y.reg`, `a11y.shadow`.

- [ ] **Step 4: Labels and targets**

- Every icon-only control has an `aria-label`, for example the colour swatches.
- The custom colour input gets a label.
- Sliders: their `output` is linked via `aria-describedby`.
- Swatches are at least 24 px, and 44 px on coarse pointers.
- With `prefers-reduced-motion`, `orbit.enableDamping = false` (in `scene.js`).

- [ ] **Step 5: Keyboard-only browser check**

Without a mouse:
1. Tab from the top bar through every control.
2. Add a ball from the start card and select it via the list.
3. Move it with the arrow keys after focusing the canvas, and set its position via the number fields.
4. Switch tabs with the arrow keys.
5. Open Share, then undo.

Focus is always visible. With a screen reader (NVDA or Narrator), the tab names, the live summary and the toasts are read.

- [ ] **Step 6: Stamp, test, commit**

```bash
node tools/stamp-version.mjs && node --test tests/
git add index.html style.css src
git commit -m "Accessibility: tabs pattern, keyboard transforms, live announcements, labels"
```

---

### Task 13: Documentation and screenshots

**Files:**
- Modify: `README.md`, `README.en.md`, `docs/screenshot.png`, `docs/ghost-mode.png`

- [ ] **Step 1: Update both READMEs**

- **New features:**
  - Undo/redo, autosave, share link
  - Dark theme
  - Ghost-scope analysis
  - Touch multi-select
  - Keyboard control
- **Shortcut tables:** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, the arrow keys and PgUp/PgDn on the focused canvas.
- **Privacy note:** autosave stays in the browser; share links carry the scene in the `#fragment`, which never reaches a server; your own CSV is never included.
- **"Release" section, for contributors:**
  1. `node --test tests/`
  2. `node tools/stamp-version.mjs`
  3. Commit and push.
- **Project structure:** list the new modules, `tools/`, `tests/` and `fonts/`.
- **Roadmap:** tick the finished items and add next ideas (touch box-select, session undo across reloads).

- [ ] **Step 2: Retake screenshots**

Retake both screenshots in the new light theme at 1280×800: the example scene with the PCA tab, and the Gapminder ghost.

- [ ] **Step 3: Verify links**

Every relative link and anchor in both READMEs resolves.

- [ ] **Step 4: Commit**

```bash
git add README.md README.en.md docs/*.png
git commit -m "Document the new release features"
```

---

## Final verification (after Task 13)

- `node tools/stamp-version.mjs` prints the same stamp twice in a row (no drift), and `node --test tests/` passes.
- **Full browser pass** in both languages and both themes, at 1280 px and 375 px:
  - Start card
  - Undo/redo
  - Reload restores
  - Share link round trip
  - Ghost-scope PCA 46.3 / 25.5 / 19.0
  - Box select + group
  - Keyboard-only flow
- The console shows no errors throughout.
