// Light / dark theme. "auto" follows the operating system; the choice is remembered.
const KEY = 'doughlab-theme';
const MODES = ['auto', 'light', 'dark'];
const media = window.matchMedia('(prefers-color-scheme: dark)');
let mode = 'auto';
let listener = () => {};

function readSaved() {
  try {
    const saved = localStorage.getItem(KEY);
    return MODES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolvedTheme() {
  return mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
}

function apply() {
  document.documentElement.dataset.theme = resolvedTheme();
  listener(resolvedTheme());
}

export function initTheme(onChange) {
  listener = onChange;
  mode = readSaved();
  media.addEventListener('change', () => mode === 'auto' && apply());
  apply();
}

export function getThemeMode() {
  return mode;
}

export function setThemeMode(next) {
  mode = MODES.includes(next) ? next : 'auto';
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Not saved; the choice still applies to this visit
  }
  apply();
}

// auto → light → dark → auto
export function cycleThemeMode() {
  setThemeMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
}
