import { t, setLang, getLang, errorText } from './i18n.js';
import { initTheme, cycleThemeMode, getThemeMode } from './theme.js';
import { icon, renderIcons } from './icons.js';
import { applySceneTheme } from './scene.js';
import { recordChange, resetHistory, undo, redo } from './history-ui.js';
import { restoreAutosave } from './autosave.js';
import { shareScene, openSharedLink } from './share.js';
import { isTouch, pieces, settings, analysisState } from './state.js';
import { download } from './ui.js';
import { applyView, refreshPoints, addPiece, clearScene, exportCSV, serializeScene, loadScene, exampleScene, densityInput, setDensity } from './pieces.js';
import { deleteSelection, setMode, duplicateSelected } from './selection.js';
import { renderList, renderProps, updateStatus, updateEmptyCard } from './panels.js';
import { scheduleAnalysis, syncShadowSliders, lightAlongPC } from './analysis-ui.js';
import { renderGhostSettings, updateGhostFit, gapminderButton, loadGapminder, onGhostChange } from './ghost-ui.js';

// ---------------------------------------------------------------------------
// Language: ?lang=en in the URL, then the saved choice, then the browser language
// ---------------------------------------------------------------------------

const LANG_KEY = 'doughlab-lang';
function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch {
    // Storage can be blocked; fall back to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
setLang(initialLang());

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const analysisPanel = document.getElementById('analysis');
const analysisToggle = document.getElementById('analysis-toggle');
function setAnalysisCollapsed(collapsed) {
  analysisPanel.classList.toggle('collapsed', collapsed);
  analysisToggle.textContent = collapsed ? t('analysis.show') : t('analysis.hide');
}
analysisToggle.addEventListener('click', () => setAnalysisCollapsed(!analysisPanel.classList.contains('collapsed')));
if (window.matchMedia('(max-width: 800px)').matches) setAnalysisCollapsed(true);

for (const b of document.querySelectorAll('#analysis-scope button')) {
  b.addEventListener('click', () => {
    analysisState.scope = b.dataset.scope;
    for (const o of document.querySelectorAll('#analysis-scope button')) o.classList.toggle('active', o === b);
    scheduleAnalysis();
  });
}

for (const b of document.querySelectorAll('#analysis-tabs button')) {
  b.addEventListener('click', () => {
    analysisState.tab = b.dataset.tab;
    for (const o of document.querySelectorAll('#analysis-tabs button')) {
      o.classList.toggle('active', o === b);
      o.setAttribute('aria-selected', o === b);
    }
    for (const pane of document.querySelectorAll('.tab-pane')) pane.hidden = pane.dataset.pane !== b.dataset.tab;
    scheduleAnalysis();
  });
}

document.getElementById('reg-target').addEventListener('change', (e) => {
  analysisState.regTarget = parseInt(e.target.value, 10);
  scheduleAnalysis();
});
document.getElementById('reg-plane').addEventListener('change', (e) => {
  analysisState.showPlane = e.target.checked;
  scheduleAnalysis();
});
for (const k of ['azimuth', 'elevation']) {
  document.getElementById(`shadow-${k}`).addEventListener('input', (e) => {
    analysisState[k] = parseInt(e.target.value, 10);
    syncShadowSliders();
    scheduleAnalysis();
  });
}
document.getElementById('shadow-align').addEventListener('click', () => lightAlongPC(2));
document.getElementById('shadow-worst').addEventListener('click', () => lightAlongPC(0));
syncShadowSliders();

document.getElementById('tool-duplicate').addEventListener('click', duplicateSelected);
document.getElementById('tool-delete').addEventListener('click', deleteSelection);

// Static labels come from data-i18n attributes; dynamic panels are re-rendered
function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.querySelector('meta[name="description"]').content = t('meta.description');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  const keys = { translate: 'W', rotate: 'E', scale: 'R' };
  for (const b of document.querySelectorAll('#mode-buttons button')) b.title = t('mode.shortcut', { key: keys[b.dataset.mode] });
  document.getElementById('help').textContent = t(isTouch ? 'help.touch' : 'help.mouse');
  document.getElementById('lang-label').textContent = lang === 'tr' ? 'EN' : 'TR';
  updateThemeButtons();
  setAnalysisCollapsed(analysisPanel.classList.contains('collapsed'));
  if (!gapminderButton.disabled) gapminderButton.textContent = t('ghost.gapminder');
  renderList();
  renderProps();
  renderGhostSettings();
  updateGhostFit();
  updateStatus();
  scheduleAnalysis();
}

function toggleLanguage() {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  try {
    localStorage.setItem(LANG_KEY, getLang());
  } catch {
    // Not saved; the choice still applies to this visit
  }
  applyLanguage();
}
document.getElementById('lang-toggle').addEventListener('click', toggleLanguage);
document.getElementById('more-lang').addEventListener('click', toggleLanguage);

// Theme: the button shows the current mode (auto / light / dark) and cycles through them
const THEME_ICONS = { auto: 'auto', light: 'sun', dark: 'moon' };
function updateThemeButtons() {
  const mode = getThemeMode();
  const label = t('theme.label', { mode: t(`theme.${mode}`) });
  for (const id of ['theme-toggle', 'more-theme']) {
    const button = document.getElementById(id);
    button.querySelector('svg.icon')?.replaceWith(icon(THEME_ICONS[mode]));
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  document.getElementById('theme-label').textContent = t(`theme.${mode}`);
  document.getElementById('more-theme-label').textContent = label;
}
function cycleTheme() {
  cycleThemeMode();
  updateThemeButtons();
}
document.getElementById('theme-toggle').addEventListener('click', cycleTheme);
document.getElementById('more-theme').addEventListener('click', cycleTheme);

// Narrow screens keep theme and language behind a "more" menu
const moreToggle = document.getElementById('more-toggle');
const moreMenu = document.getElementById('more-menu');
function setMoreOpen(open) {
  moreMenu.hidden = !open;
  moreToggle.setAttribute('aria-expanded', open);
}
moreToggle.addEventListener('click', () => setMoreOpen(moreMenu.hidden));
document.addEventListener('click', (e) => {
  if (!moreMenu.hidden && !e.target.closest('#more-wrap')) setMoreOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !moreMenu.hidden) {
    setMoreOpen(false);
    moreToggle.focus();
  }
});

densityInput.addEventListener('input', () => {
  setDensity(parseInt(densityInput.value, 10));
  pieces.forEach(refreshPoints);
  renderList();
  updateStatus();
});
densityInput.addEventListener('change', recordChange);

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('empty-ball').addEventListener('click', () => addPiece('ball'));
document.getElementById('empty-gapminder').addEventListener('click', loadGapminder);
document.getElementById('empty-example').addEventListener('click', () => {
  loadScene(exampleScene());
  recordChange();
});
onGhostChange(updateEmptyCard);
document.getElementById('btn-share').addEventListener('click', shareScene);
document.getElementById('btn-redo').addEventListener('click', redo);

for (const b of document.querySelectorAll('#shape-buttons button')) {
  b.addEventListener('click', () => addPiece(b.dataset.shape));
}
for (const b of document.querySelectorAll('#mode-buttons button')) {
  b.addEventListener('click', () => setMode(b.dataset.mode));
}
for (const b of document.querySelectorAll('#view-mode button')) {
  b.addEventListener('click', () => {
    settings.view = b.dataset.view;
    pieces.forEach(applyView);
    for (const o of document.querySelectorAll('#view-mode button')) o.classList.toggle('active', o === b);
  });
}

document.getElementById('btn-export').addEventListener('click', exportCSV);
document.getElementById('btn-save').addEventListener('click', () => {
  download('doughlab-scene.json', JSON.stringify(serializeScene(), null, 2), 'application/json');
});
const fileInput = document.getElementById('file-input');
document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    loadScene(JSON.parse(await file.text()));
    recordChange();
  } catch (err) {
    alert(t('err.sceneOpen', { msg: errorText(err) }));
  }
});
document.getElementById('btn-example').addEventListener('click', () => {
  if (pieces.length && !confirm(t('confirm.example'))) return;
  loadScene(exampleScene());
  recordChange();
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (pieces.length && confirm(t('confirm.clear'))) {
    clearScene();
    updateStatus();
    recordChange();
  }
});

renderIcons();
initTheme(applySceneTheme);
applyLanguage();
const autosaveGhost = restoreAutosave();
resetHistory();
// A shared link waits for the autosaved ghost so it can replace it rather than race it
autosaveGhost.then(openSharedLink);
