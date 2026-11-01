
export function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (toast.hidden = true), 3200);
}
// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export const fmt = (v) => Number(v).toFixed(2);

export function slider(spec, value, onInput) {
  const out = el('output', {}, fmt(value));
  const input = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, value });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  return el('label', { class: 'field' }, el('span', { class: 'field-head' }, spec.label, out), input);
}

export function textField(label, value, onInput) {
  const input = el('input', { type: 'text', value });
  input.addEventListener('input', () => onInput(input.value));
  return { node: el('label', { class: 'field' }, el('span', { class: 'field-head' }, label), input), input };
}

export function selectField(label, options, value, onChange) {
  const select = el('select');
  // A Map keeps insertion order even for numeric-looking keys
  const entries = options instanceof Map ? [...options] : Object.entries(options);
  for (const [key, opt] of entries) {
    const o = el('option', { value: key }, opt.label);
    if (key === value) o.selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  return el('label', { class: 'field' }, el('span', { class: 'field-head' }, label), select);
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export function withBold(sentence, value) {
  const [before, after = ''] = sentence.split('\u0000');
  return el('div', {}, before, el('b', {}, value), after);
}
export function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle' }, input, el('span', {}, label));
}
