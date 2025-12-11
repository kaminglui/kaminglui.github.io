import { describe, it, expect, vi } from 'vitest';
import {
  quickSelectNext,
  quickSelectPrev,
  quickToggleSwitchPosition,
  quickAdjustPot,
  quickSetPotTurn,
  quickSetFuncGenFreq,
  quickSetFuncGenVpp,
  quickScopeDropdownAction,
  quickScopeToggleMain,
  quickSetFuncGenFreqValue,
  quickSetFuncGenVppValue,
  quickSetResistorValue,
  quickSetCapacitorValue,
  syncQuickBarVisibility,
  quickSelectScope,
  __testGetActiveScope,
  __testIsPaused,
  toggleSim,
  safeCall,
  __testSetComponents,
  __testGetSelected,
  __testSetSelected,
  updateQuickControlsVisibility
} from '../../../circuitforge.js';

function stubDom(groups = []) {
  const toggles = [];
  const listeners = { document: {}, window: {} };
  const bar = {
    classList: {
      toggle: (cls, state) => toggles.push({ cls, state })
    },
    setAttribute: vi.fn()
  };
  const createBaseElement = (id = '') => {
    const el = {
      id,
      value: '',
      innerText: '',
      textContent: '',
      children: [],
      style: {},
      dataset: {},
      hidden: true,
      classList: {
        toggle(cls, state) {
          if (cls === 'hidden') el.hidden = state;
        },
        add(cls) {
          if (cls === 'hidden') el.hidden = true;
        },
        remove(cls) {
          if (cls === 'hidden') el.hidden = false;
        },
        contains(cls) {
          return cls === 'hidden' ? !!el.hidden : false;
        }
      },
      appendChild(child) {
        this.children.push(child);
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      focus: vi.fn(),
      closest: () => null
    };
    return el;
  };
  const store = new Map();
  groups.forEach((id) => {
    const el = createBaseElement(id);
    el.dataset = { kind: id };
    store.set(id, el);
  });
  const slider = { id: 'quick-pot-slider', value: '0', disabled: false };
  const quickSelect = createBaseElement('quick-scope-select');
  quickSelect.hidden = true;
  [
    'quick-resistor-value', 'quick-resistor-suffix',
    'quick-capacitor-value', 'quick-capacitor-suffix',
    'quick-fg-freq-value', 'quick-fg-freq-suffix',
    'quick-fg-vpp-value', 'quick-fg-vpp-suffix',
    'quick-scope-select',
    'quick-pot-value'
  ].forEach((id) => {
    if (id === 'quick-scope-select') {
      store.set(id, quickSelect);
      return;
    }
    store.set(id, createBaseElement(id));
  });
  global.document = {
    getElementById: (id) => {
      if (id === 'mobile-quick-bar') return bar;
      if (id === 'quick-pot-slider') return slider;
      return store.get(id) || null;
    },
    querySelectorAll: () => Array.from(store.values()),
    createElement: (tag) => {
      const el = createBaseElement();
      el.tagName = tag.toUpperCase();
      return el;
    },
    addEventListener: (type, fn) => { listeners.document[type] = fn; },
    removeEventListener: (type, fn) => {
      if (listeners.document[type] === fn) delete listeners.document[type];
    },
    _listeners: listeners.document
  };
  global.window = {
    addEventListener: (type, fn) => { listeners.window[type] = fn; },
    removeEventListener: (type, fn) => {
      if (listeners.window[type] === fn) delete listeners.window[type];
    },
    _listeners: listeners.window
  };
  return { bar, toggles, slider, groups: store, store, listeners };
}

function setComponents(list) {
  __testSetComponents(list);
}

describe('quick bar logic', () => {
  it('shows when quick targets exist (e.g. scope) even without selection', () => {
    const { bar, toggles } = stubDom();
    const scope = { kind: 'oscilloscope', id: 'S1', props: {} };
    setComponents([]);
    syncQuickBarVisibility();
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: true });
    setComponents([scope]);
    syncQuickBarVisibility(); // nothing selected yet
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: false });
    expect(bar.setAttribute).toHaveBeenCalled();
  });

  it('opens scope dropdown only when multiple scopes and toggles main scope', () => {
    const { store } = stubDom();
    const scopes = [
      { kind: 'oscilloscope', id: 'S1', props: {} },
      { kind: 'oscilloscope', id: 'S2', props: {} }
    ];
    setComponents(scopes);
    quickScopeDropdownAction();
    const select = store.get('quick-scope-select');
    expect(select.size).toBe(2);
    expect(select.hidden).toBe(false);
    expect(select.dataset.open).toBe('true');
    __testSetSelected(scopes[0]);
    quickScopeToggleMain(); // should not throw
  });

  it('dropdown button toggles visibility and selecting scope sets active scope', () => {
    const { store, listeners } = stubDom();
    const scopes = [
      { kind: 'oscilloscope', id: 'S1', props: {} },
      { kind: 'oscilloscope', id: 'S2', props: {} }
    ];
    setComponents(scopes);
    quickScopeDropdownAction();
    const select = store.get('quick-scope-select');
    expect(select.hidden).toBe(false);
    expect(select.dataset.open).toBe('true');
    expect(select.children.map((c) => c.value)).toEqual(['S1', 'S2']);
    const clickAway = listeners.document.click;
    clickAway?.({ target: { closest: () => null } });
    expect(select.hidden).toBe(true);
    expect(select.dataset.open).toBe('false');
    quickScopeDropdownAction();
    expect(select.dataset.open).toBe('true');
    quickSelectScope('S2');
    expect(__testGetActiveScope()).toBe(scopes[1]);
    quickScopeDropdownAction();
    expect(select.hidden).toBe(true);
    expect(select.dataset.open).toBe('false');
  });

  it('cycles only controllable kinds in order', () => {
    global.document = { getElementById: () => null };
    setComponents([
      { kind: 'ground', id: 'G1', props: {} },
      { kind: 'switch', id: 'SW1', props: { Position: 'A' } },
      { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } },
      { kind: 'oscilloscope', id: 'S1', props: {} },
      { kind: 'junction', id: 'J1', props: {} }
    ]);
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('SW1');
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('POT1');
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('SW1'); // scope skipped
    quickSelectPrev();
    expect(__testGetSelected()?.id).toBe('POT1');
  });

  it('quick controls mutate component props', () => {
    const { slider, store } = stubDom(['switch', 'potentiometer', 'funcgen', 'resistor', 'capacitor']);
    const sw = { kind: 'switch', id: 'SW1', props: { Position: 'A' } };
    const pot = { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } };
    const fg = { kind: 'funcgen', id: 'FG1', props: { Vpp: '1', Freq: '880' } };
    const r = { kind: 'resistor', id: 'R1', props: { R: '10k' } };
    const c = { kind: 'capacitor', id: 'C1', props: { C: '100n' } };
    setComponents([sw, pot, fg, r, c]);
    __testSetSelected(sw);
    quickToggleSwitchPosition();
    expect(sw.props.Position).toBe('B');
    __testSetSelected(pot);
    quickAdjustPot(-10);
    expect(pot.props.Turn).toBe('40');
    quickSetPotTurn('75');
    expect(pot.props.Turn).toBe('75');
    expect(slider.value).toBe('75');
    __testSetSelected(fg);
    store.get('quick-fg-freq-value').value = '2k';
    quickSetFuncGenFreqValue();
    expect(fg.props.Freq).toBe('2k');
    expect(store.get('quick-fg-freq-value').value).toBe('2');
    expect(store.get('quick-fg-freq-suffix').value).toBe('k');
    store.get('quick-fg-vpp-value').value = '500m';
    quickSetFuncGenVppValue();
    expect(fg.props.Vpp).toBe('500m');
    expect(store.get('quick-fg-vpp-value').value).toBe('500');
    expect(store.get('quick-fg-vpp-suffix').value).toBe('m');
    __testSetSelected(r);
    store.get('quick-resistor-value').value = '4.7k';
    quickSetResistorValue();
    expect(r.props.R).toBe('4.7k');
    expect(store.get('quick-resistor-value').value).toBe('4.7');
    expect(store.get('quick-resistor-suffix').value).toBe('k');
    __testSetSelected(c);
    store.get('quick-capacitor-value').value = '220n';
    quickSetCapacitorValue();
    expect(c.props.C).toBe('220n');
    expect(store.get('quick-capacitor-value').value).toBe('220');
    expect(store.get('quick-capacitor-suffix').value).toBe('n');
  });

  it('shows only the active quick group', () => {
    const { groups } = stubDom(['switch', 'potentiometer', 'funcgen']);
    const sw = { kind: 'switch', id: 'SW1', props: { Position: 'A' } };
    const pot = { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } };
    const fg = { kind: 'funcgen', id: 'FG1', props: { Vpp: '1', Freq: '880' } };
    setComponents([sw, pot, fg]);
    __testSetSelected(pot);
    updateQuickControlsVisibility();
    expect(groups.get('potentiometer').hidden).toBe(false);
    expect(groups.get('switch').hidden).toBe(true);
    __testSetSelected(fg);
    updateQuickControlsVisibility();
    expect(groups.get('funcgen').hidden).toBe(false);
  });

  it('keeps pot slider in sync with current selection value', () => {
    const { slider } = stubDom(['potentiometer']);
    const pot = { kind: 'potentiometer', id: 'POT1', props: { Turn: '65' } };
    setComponents([pot]);
    __testSetSelected(pot);
    expect(slider.value).toBe('65');
    pot.props.Turn = '80';
    __testSetSelected(pot);
    expect(slider.value).toBe('80');
  });

  it('forces pause when canvas is empty', () => {
    stubDom(); // setup document/window for toggleSim
    setComponents([]);
    toggleSim();
    expect(__testIsPaused()).toBe(true);
    setComponents([{ kind: 'switch', id: 'SW1', props: { Position: 'A' } }]);
    toggleSim();
    expect(__testIsPaused()).toBe(false);
  });
});
