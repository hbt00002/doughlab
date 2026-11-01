import { recordChange } from './history-ui.js';
import { t } from './i18n.js';
import { pieces, state, ghostState } from './state.js';
import { el, slider, textField, selectField } from './ui.js';
import { COLORS, DOUGH_TYPES, colorName, isDefaultGroup, rebuildGeometry, updateMaterial, refreshPoints, removePiece, PARAM_SPECS } from './pieces.js';
import { select, toggleSelection, groupSelection, ungroupSelection, deleteSelection, duplicateSelected } from './selection.js';
import { scheduleAnalysis } from './analysis-ui.js';

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

// Every committed edit in the properties panel is one undo step: `change` fires when a slider is
// released, a text field loses focus, or a select / colour picker settles
document.getElementById('props').addEventListener('change', () => recordChange());

export function renderList() {
  const list = document.getElementById('piece-list');
  list.replaceChildren();
  if (!pieces.length) {
    list.append(el('p', { class: 'empty' }, t('list.empty')));
    return;
  }
  // Number the groups in list order so the badge reads "G1", "G2", …
  const linkNumbers = new Map();
  for (const p of pieces) if (p.link && !linkNumbers.has(p.link)) linkNumbers.set(p.link, linkNumbers.size + 1);
  for (const p of pieces) {
    const dot = el('span', { class: 'dot' });
    dot.style.background = p.color;
    const row = el(
      'button',
      { class: 'piece-row' + (state.selection.includes(p) ? ' active' : '') },
      dot,
      el('span', { class: 'pname' }, p.name),
    );
    if (p.link) {
      const n = linkNumbers.get(p.link);
      row.append(el('span', { class: 'link-badge', title: t('list.linked', { n }) }, `G${n}`));
    }
    row.append(el('span', { class: 'pmeta' }, t('list.points', { n: p.count })));
    row.addEventListener('click', (e) => (e.shiftKey || state.multiSelect ? toggleSelection(p) : select(p)));
    list.append(row);
  }
}

// Several pieces selected: shared group name, grouping and bulk actions
export function renderMultiProps(box) {
  const names = state.selection.map((p) => p.name).join(', ');
  const groups = new Set(state.selection.map((p) => p.group));
  const linked = state.selection.every((p) => p.link && p.link === state.selection[0].link);
  const group = textField(t('props.groupAll'), groups.size === 1 ? state.selection[0].group : '', (v) => {
    for (const p of state.selection) p.group = v;
    scheduleAnalysis();
  });
  if (groups.size > 1) group.input.placeholder = t('props.mixed');

  const groupButton = el('button', { title: 'Ctrl+G' }, t('tool.group'));
  groupButton.addEventListener('click', groupSelection);
  const ungroupButton = el('button', { title: 'Ctrl+Shift+G' }, t('tool.ungroup'));
  ungroupButton.addEventListener('click', ungroupSelection);
  ungroupButton.disabled = !state.selection.some((p) => p.link);
  const dup = el('button', {}, t('tool.duplicate'));
  dup.addEventListener('click', duplicateSelected);
  const del = el('button', { class: 'danger' }, t('tool.delete'));
  del.addEventListener('click', deleteSelection);

  box.append(
    el('p', { class: 'multi-head' }, el('b', {}, t('props.multi', { n: state.selection.length })), el('span', {}, names)),
    group.node,
    el('p', { class: 'hint' }, linked ? t('props.linked') : t('props.groupHint')),
    el('div', { class: 'btn-row' }, linked ? ungroupButton : groupButton, ...(linked ? [] : [ungroupButton]), dup, del),
  );
}

export function renderProps() {
  const box = document.getElementById('props');
  box.replaceChildren();
  if (state.selection.length > 1) {
    renderMultiProps(box);
    return;
  }
  if (!state.selected) {
    box.append(el('p', { class: 'empty' }, t('props.empty')));
    return;
  }
  const p = state.selected;
  const afterShapeChange = () => {
    rebuildGeometry(p);
    refreshPoints(p);
    renderList();
    updateStatus();
  };

  const name = textField(t('props.name'), p.name, (v) => {
    p.name = v;
    renderList();
  });
  const group = textField(t('props.group'), p.group, (v) => {
    p.group = v;
    scheduleAnalysis();
  });

  // Colour: preset play-dough swatches plus a free picker
  const swatches = el('div', { class: 'swatches' });
  const setColor = (hex) => {
    // Keep the group label in sync while it is still the default colour name
    if (isDefaultGroup(p.group, p.color)) {
      p.group = colorName(hex);
      group.input.value = p.group;
      scheduleAnalysis();
    }
    p.color = hex;
    updateMaterial(p);
    for (const s of swatches.querySelectorAll('.swatch')) s.classList.toggle('active', s.dataset.hex === hex);
    renderList();
  };
  for (const c of COLORS) {
    const s = el('button', { class: 'swatch' + (c.hex === p.color ? ' active' : ''), title: t(`color.${c.key}`), 'data-hex': c.hex });
    s.style.background = c.hex;
    s.addEventListener('click', () => {
      setColor(c.hex);
      recordChange();
    });
    swatches.append(s);
  }
  const custom = el('input', { type: 'color', value: p.color, title: t('props.customColor') });
  custom.addEventListener('input', () => setColor(custom.value));
  swatches.append(custom);

  const doughOptions = new Map(Object.keys(DOUGH_TYPES).map((k) => [k, { label: t(`dough.${k}`) }]));
  box.append(
    name.node,
    group.node,
    el('div', { class: 'field' }, el('span', { class: 'field-head' }, t('props.color')), swatches),
    selectField(t('props.dough'), doughOptions, p.dough, (v) => {
      p.dough = v;
      updateMaterial(p);
    }),
    ...Object.keys(p.params).map((k) =>
      slider({ ...PARAM_SPECS[k], label: t(`param.${k}`) }, p.params[k], (v) => {
        p.params[k] = v;
        afterShapeChange();
      }),
    ),
    slider({ label: t('param.texture'), min: 0, max: 1, step: 0.01 }, p.texture, (v) => {
      p.texture = v;
      afterShapeChange();
    }),
  );

  const dup = el('button', {}, t('tool.duplicate'));
  dup.addEventListener('click', duplicateSelected);
  const del = el('button', { class: 'danger' }, t('tool.delete'));
  del.addEventListener('click', deleteSelection);
  box.append(el('div', { class: 'btn-row' }, dup, del));
}

// The start card shows while the stage is completely empty
export function updateEmptyCard() {
  document.getElementById('empty-card').hidden = pieces.length > 0 || !!ghostState.table;
}

export function updateStatus() {
  updateEmptyCard();
  const total = pieces.reduce((n, p) => n + p.count, 0);
  document.getElementById('status').textContent = t(pieces.length === 1 ? 'status.one' : 'status', { pieces: pieces.length, points: total });
}
