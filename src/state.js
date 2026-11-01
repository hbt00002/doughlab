// Shared mutable state. Plain objects and arrays are exported directly;
// values that get reassigned live on `state`.

export const isTouch = window.matchMedia('(pointer: coarse)').matches;
export const pieces = [];
export const typeCounters = { ball: 0, snake: 0, slab: 0 };
export const settings = { density: 60, view: 'dough' };
export const analysisState = {
  scope: 'all',
  tab: 'pca',
  showAxes: true,
  regTarget: 1,
  showPlane: true,
  azimuth: 35,
  elevation: 55,
  // Ghost-scope regression, by CSV column name
  ghostTarget: null,
  ghostPredictors: [],
};
export const ghostState = {
  table: null,
  fileName: '',
  source: 'file',
  truncated: false,
  columnsInfo: [],
  columns: [],
  colorBy: -1,
  standardize: true,
  logSkewed: false,
  visible: true,
  arrows: true,
  data: null,
  error: '',
};

export const state = {
  // Every selected piece; `selected` is the one being edited when exactly one is selected
  selection: [],
  selected: null,
  // Pieces grouped with Ctrl+G share a link id, so they are selected and moved together
  linkCounter: 0,
  // Touch screens have no Shift key: while on, a tap adds or removes a piece like Shift+click
  multiSelect: false,
};
