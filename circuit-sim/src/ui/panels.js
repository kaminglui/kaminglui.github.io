/**
 * UI panels and property editors.
 */
import { parseValue } from './util.js';

const tools = [
  { id: 'select', label: 'Select' },
  { id: 'wire', label: 'Wire' },
  { id: 'R', label: 'Resistor' },
  { id: 'C', label: 'Capacitor' },
  { id: 'L', label: 'Inductor' },
  { id: 'VDC', label: 'DC Source' },
  { id: 'VAC', label: 'AC Source' },
  { id: 'MOS', label: 'MOSFET' },
  { id: 'GND', label: 'Ground' }
];

export function renderToolbar(el, schematic, onSelect) {
  el.innerHTML = '';
  tools.forEach((t) => {
    const btn = document.createElement('button');
    btn.textContent = t.label;
    btn.dataset.tool = t.id;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#toolbar button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      schematic.setMode(t.id);
      onSelect?.(t.id);
    });
    if (t.id === 'select') btn.classList.add('active');
    el.appendChild(btn);
  });
}

export function renderSimControls(el, actions) {
  el.innerHTML = '';
  const buttons = [
    { id: 'dc', label: 'DC' },
    { id: 'run', label: 'Run Tran' },
    { id: 'stop', label: 'Stop' }
  ];
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.addEventListener('click', () => actions[b.id]());
    el.appendChild(btn);
  });
}

export function updateProperties(container, comp, onChange) {
  if (!comp) {
    container.innerHTML = 'Select a component.';
    return;
  }
  const entries = [
    ['Type', comp.kind],
    ['ID', comp.id],
    ['Param A', comp.kind === 'R' ? 'R (Ω)' : comp.kind === 'C' ? 'C (F)' : comp.kind === 'L' ? 'L (H)' : 'Value']
  ];
  container.innerHTML = '';
  entries.forEach(([label, value]) => {
    const div = document.createElement('div');
    div.textContent = `${label}: ${value}`;
    container.appendChild(div);
  });
  if (['R', 'C', 'L', 'VDC', 'VAC', 'MOS'].includes(comp.kind)) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = comp.kind === 'R' ? comp.params.R || 1000 : comp.kind === 'C' ? comp.params.C || 1e-6 : comp.kind === 'L' ? comp.params.L || 1e-3 : comp.params.V || comp.params.vPeak || '';
    input.addEventListener('change', () => {
      const val = parseValue(input.value);
      if (comp.kind === 'R') comp.params.R = val;
      if (comp.kind === 'C') comp.params.C = val;
      if (comp.kind === 'L') comp.params.L = val;
      if (comp.kind === 'VDC') comp.params.V = val;
      if (comp.kind === 'VAC') comp.params.vPeak = val;
      if (comp.kind === 'MOS') comp.params.W = val;
      onChange?.(comp);
    });
    container.appendChild(input);
  }
}
