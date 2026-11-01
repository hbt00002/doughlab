# DoughLab: professional, accessible release

Date: 2026-11-01
Status: draft, awaiting approval

## Intent

DoughLab is going to be shared with the course teacher and with other students who want to use it. It started as a homework helper; now it has to look and behave like a finished tool that people trust. The owner wants it to look **professional**, to be **usable by everyone** (accessible), and to include all ten improvements listed in the review.

Who opens it, and how:

- The teacher, possibly on a projector in class, clicking a shared link.
- Students on laptops, and sometimes on phones or tablets.
- People who arrive cold: no README, no explanation.

## Success looks like

- The shared link never opens to a blank or broken page, including right after a new version is published.
- Someone new builds a first model within about a minute without reading anything.
- A wrong click never destroys work: undo exists and work survives a page reload.
- A student can send their model to the teacher as a link.
- The whole interface works with a keyboard alone and with a screen reader, with WCAG 2.1 AA contrast.

## Goals

1. Visual redesign in the "Laboratuvar" (lab) direction.
2. Accessibility to WCAG 2.1 AA.
3. The ten improvements:
   1. Undo / redo.
   2. Autosave in the browser.
   3. Shareable link.
   4. Empty-state start card.
   5. Analysis on the ghost (CSV) data.
   6. Better touch / phone support.
   7. Protection against stale cached files after a release.
   8. Split `main.js` into modules.
   9. Automated tests.
   10. Consistent line endings.

## Non-goals

- No new statistical methods beyond what is listed.
- No accounts, server, database or analytics. Data never leaves the browser, except what a user deliberately puts in a share link.
- No build step, bundler or package manager for the app itself. Node may be used as a developer tool for tests and the version stamp.
- No change to the core interaction model: left panel, 3D stage in the middle, analysis panel on the right.

## Anti-goals (failure even if it "works")

- The app looks busier or more complicated than before.
- A redesign that hurts projector readability: thin fonts or low contrast.
- Breaking existing saved scene files (`doughlab-scene.json`, version 1) or the CSV export columns.
- Losing the Turkish / English parity: every new string exists in both languages.

## Constraints

- Static site on GitHub Pages; ES modules; Three.js r169 from the jsDelivr CDN through the existing import map.
- Must work in current Chrome, Edge, Firefox and Safari, desktop and mobile.
- Both languages via `src/i18n.js`. Percent format stays `%46.3` (TR) / `46.3%` (EN).
- MIT licence. Any bundled asset must have a compatible licence; the font is OFL.

## Decided by the owner

### Visual direction: "Laboratuvar"

Chosen from three mockups, over the warm "Atölye" and the dark "Stüdyo":

- **Colours:** white and light-grey surfaces, one blue accent (around `#2563eb`), neutral grey text. Dough colours stay vivid so the model is what the eye goes to.
- **Panels:** sections separated by thin rules rather than boxed cards. The analysis panel is a white card with a soft shadow over the stage.
- **Top bar:** a thin top bar holds the title "DoughLab · veri geometrisi" / "data geometry".

### Typeface: Lexend

Chosen after two rounds. The owner rejected Inter, IBM Plex Sans, Atkinson Hyperlegible and Source Sans 3 as too plain. From the second round they picked Lexend over Space Grotesk, Bricolage Grotesque and Rubik.

- Weights a notch heavier than usual so the eye catches text immediately: body 500, labels and buttons 600, headings 700.
- Numbers use tabular figures so columns of values line up.

### Scope

All ten improvements, plus the redesign and accessibility. If a problem comes up during the work, ask the owner.

## Builder's calls (marked as such)

These are my decisions. The owner can overturn any of them.

### Visual system

- **Design tokens:** colours, spacing (4px scale), radii and font sizes become CSS custom properties in one place.
- **Dark theme:** a dark variant of the same tokens. It follows the operating-system setting by default; a toggle in the top bar overrides it, and the choice is remembered. The 3D scene background, grid and ghost point colours switch with the theme.
- **Font loading:** Lexend is self-hosted (`fonts/`, woff2, latin + latin-ext so Turkish letters are covered, OFL licence file included), not loaded from Google Fonts. Fallback stack: `system-ui, "Segoe UI", sans-serif`.
- **Icons:** inline SVG icons, always next to a visible text label (never icon-only for primary actions), for:
  - Add shape
  - Move / rotate / scale
  - Duplicate / delete
  - Undo / redo
  - Share
  - Theme
  - Language
- **Top bar contents, left to right:**
  - DoughLab title
  - Undo / redo
  - Share
  - Theme toggle
  - Language toggle

  The language toggle moves here from the sidebar header.
- **Mode toolbar:** the move/rotate/scale toolbar stays floating at the top-left of the stage.

### Accessibility (WCAG 2.1 AA)

- **Contrast:** at least 4.5:1 for body text, 3:1 for large text and UI boundaries, in both themes.
- **Keyboard:** every control is reachable and operable by keyboard, with a visible focus ring.
- **Tabs:** the analysis tabs follow the WAI-ARIA tabs pattern (arrow keys, `aria-selected`, `aria-controls`).
- **Without a mouse in the 3D view:** the selected piece gets numeric **position / rotation / scale** fields in the "Selected piece" panel. Arrow keys nudge the selected piece when the stage has focus; Page Up / Page Down move it vertically. The piece list is the keyboard way to select.
- **Screen readers:**
  - Labelled buttons and inputs.
  - An `aria-live="polite"` region announces toasts and a short analysis summary (for example: "PCA: PC1 46.3%, PC2 25.5%. Planar.").
  - The canvas gets an accessible name and a description of what is in the scene (piece count, observations).
- **Colour is never the only signal:**
  - Pieces in lists and legends show their name next to the colour dot.
  - Ghost categories have a text legend.
  - The fit bars carry numbers.
- **Reduced motion:** respect `prefers-reduced-motion` by turning off camera damping and toast transitions.
- **Targets:** hit areas of at least 24×24 CSS px everywhere, 44×44 on touch.
- **Language attribute:** `lang` on `<html>` follows the language setting (already the case).

### 1. Undo / redo

- **Keys:** `Ctrl+Z` undo; `Ctrl+Shift+Z` and `Ctrl+Y` redo. Top-bar buttons do the same and are disabled when there is nothing to undo or redo.
- **Mechanism:** snapshot-based. Each history entry is the serialized scene (the same shape as the scene file) plus the selection. History holds up to 100 steps.
- **What is recorded:**
  - Add, delete, duplicate
  - The end of a gizmo drag
  - Property edits: committed on `change`, so a slider drag is one step
  - Colour, dough type
  - Group / ungroup
  - Load scene, example scene, clear
  - Density change
- **Not recorded:** camera position, ghost-data settings, analysis tab choices.
- Text fields (name, group) commit one step when the field loses focus.

### 2. Autosave

- The scene (same JSON as the scene file) is saved to `localStorage` about 500 ms after any recorded change. It is restored on load, with a toast "Önceki çalışman geri yüklendi" / "Your previous work was restored".
- **Ghost:**
  - If the ghost came from the Gapminder sample, the ghost source and its settings are saved too, and Gapminder is fetched again on restore.
  - A ghost from a user's own CSV is not stored, because the file may be large or private.
- If storage is blocked or full, the app works as before, without autosave and without errors.
- "Clear" empties the scene and the autosave; it can be undone within the session.

### 3. Shareable link

- **The Share button:**
  - Encodes the scene into the URL fragment (`#scene=…`): JSON, deflate-compressed with `CompressionStream`, base64url.
  - Copies the link to the clipboard and confirms with a toast.
  - If the Clipboard API is unavailable, shows the link in a small dialog with a copy field.
- The fragment never reaches a server.
- **Gapminder ghost:** if the ghost is the Gapminder sample, its settings ride along and the receiver gets the same ghost. Own-CSV ghosts are not shared, and the share toast says so.
- **Opening a link:**
  - The shared scene loads in place of the autosaved one.
  - The previous autosaved scene stays recoverable with one undo step.
  - The fragment is then removed from the address bar so a reload does not keep reloading the shared scene.
- **Long links:** if the link exceeds about 8,000 characters, warn that it may be too long for some apps and suggest saving a file instead.
- **Bad links:** a malformed or old-format link shows an error toast and leaves the current scene untouched.

### 4. Empty-state start card

- **When it shows:** while there are no pieces and no ghost, a card is centred on the stage.
- **Contents:**
  - A one-line explanation.
  - Three buttons: Add dough (ball), Load the Gapminder sample, Open the example scene.
  - A hint for the analysis panel and the shortcut help.
- **When it hides:** as soon as anything exists. It is keyboard-focusable and announced to screen readers.

### 5. Analysis on the ghost data

- The analysis scope gets a third option next to "All pieces" / "Selected piece": **"Ghost data"**, enabled only when a ghost is loaded.
- **PCA tab:** shows the ghost's PCA, meaning the explained variance of the original standardised variables (the numbers already computed in `buildGhostData`) and the loadings per variable.
- **Shadow tab:** works on the ghost's 3D point cloud. "Align with PCA" then shows the true 2D PCA view of the homework data.
- **Regression tab:** with the ghost scope, it regresses on the **original CSV columns** rather than on the PC coordinates. Regressing PC coordinates on each other is meaningless, because they are uncorrelated by construction.
  - **Choices:** the user picks a target column and one or two predictor columns from the chosen numeric variables.
  - **Output:** the equation, R², RMSE and the residual plot. Variables use their CSV names, and log-transformed ones are marked.
  - **No plane:** none is drawn in the scene in this case, since the scene axes are PCs, not those variables.

### 6. Touch and phone

- **Multi-select:** a "Çoklu seç" / "Multi-select" toggle appears in the toolbar on touch devices. While it is on, taps add or remove pieces.
- **Layout:** on narrow screens (≤ 800 px) the analysis panel becomes a bottom sheet under the stage, collapsed to a handle by default, instead of covering the scene.
- **Top bar:** on narrow screens it collapses secondary actions (theme, language) into a "⋯" menu.

### 7. Stale-cache protection

- **The problem:** a release must never mix old and new module files.
- **The fix:**
  - `index.html`'s import map maps every local module (`./src/*.js`) to the same path with a `?v=<stamp>` query.
  - The stylesheet link carries the same stamp.
  - Modules keep importing each other by their plain relative paths; the import map rewrites them.
- **The stamp script:** `tools/stamp-version.mjs` (Node, no dependencies) computes a short hash of all `src/*.js`, `style.css` and `fonts/*`. It rewrites the stamp in `index.html` and adds any missing module to the import map. Running it is a documented release step.
- **Safety net:** a test fails if the stamp in `index.html` does not match the current files, so a forgotten stamp is caught.

### 8. Module split

`src/main.js` (about 1,650 lines) is split by responsibility; behaviour does not change. Target layout:

```
src/
  main.js            startup and wiring only
  scene.js           renderer, camera, lights, ground, controls, theme colours
  pieces.js          piece creation, geometry, materials, points, scene (de)serialisation
  selection.js       selection, multi-select, box select, pivot gizmo, grouping
  history.js         undo / redo stack
  storage.js         autosave and the share-link encode/decode
  ui.js              DOM helpers (el, slider, fields, toast, dialogs)
  panels.js          piece list and selected-piece panel
  analysis-ui.js     analysis panel, tabs, plots, PCA axes, regression plane, shadow screen
  ghost-ui.js        ghost panel, hover/tap rows, fit score
  i18n.js            unchanged role
  analysis.js, ghost-data.js, ghost.js, geometry.js, sampling.js, arrows.js   unchanged roles
```

- **Coupling:** modules talk through a small shared state object and explicit function calls, with no global event bus. Circular imports between UI modules are acceptable only where unavoidable; the builder decides.
- **Pure logic:** pure, DOM-free logic (history, share encode/decode, regression on columns) lives in modules that can be imported by Node tests.

### 9. Automated tests

- **Runner:** `node --test` with no dependencies. Tests live in `tests/*.test.mjs`.
- **Coverage:**
  - `analysis.js`: PCA, Pearson, Spearman, Kendall, η², regression, projected variance, each against known values.
  - `ghost-data.js`: CSV parsing (comma, semicolon with decimal comma, tab, quotes, BOM) and the Gapminder check (46.3 / 25.5 / 19.0%), using a small checked-in fixture rather than a network fetch.
  - Share-link encode/decode round trip, plus bad input.
  - History push / undo / redo / limit.
  - The version-stamp check from item 7.
  - i18n: every key exists in both languages.
- **CI:** a GitHub Actions workflow runs `node --test` on push and pull request.

### 10. Line endings

- Add `.gitattributes` with `* text=auto eol=lf` and binary rules for images and fonts.
- Renormalise once in its own commit.

### Documentation

- Update both READMEs: features, shortcuts (undo, redo, nudging, multi-select on touch), the share link, autosave and a privacy note, the release steps (run tests, run the stamp script), and new screenshots in the new look.
- Remove "Yol haritası" items that are done, and add the next ideas.

## Left to the builder

- Exact colour values and spacing within the lab direction, as long as contrast passes in both themes.
- Icon drawings.
- How the dark theme colours the 3D scene.
- The exact module boundaries, if a cleaner split appears while working.
- Wording of new interface strings, in both languages.

## Open risks

- **`CompressionStream`:** available in all current major browsers. A very old browser would fall back to an uncompressed link (longer, but working).
- **Snapshot undo with large scenes:** at most a few hundred kilobytes per step. If it becomes slow, the history keeps fewer steps rather than switching to command-based undo.
- **Self-hosting the font:** adds about 50–100 KB.
