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
  safeCall,
  __testSetComponents,
  __testGetSelected,
  __testSetSelected,
  updateQuickControlsVisibility
} from '../../../circuitforge.js';

function stubDom(groups = []) {
  const toggles = [];
  const bar = {
    classList: {
      toggle: (cls, state) => toggles.push({ cls, state })
    },
    setAttribute: vi.fn()
  };
  const store = new Map();
  groups.forEach((id) => {
    store.set(id, {
      dataset: { kind: id },
      classList: {
        hidden: false,
        toggle(cls, state) {
          if (cls === 'hidden') this.hidden = state;
        }
      }
    });
  });
  const slider = { id: 'quick-pot-slider', value: '0', disabled: false };
  [
    'quick-resistor-value', 'quick-resistor-suffix',
    'quick-capacitor-value', 'quick-capacitor-suffix',
    'quick-fg-freq-value', 'quick-fg-freq-suffix',
    'quick-fg-vpp-value', 'quick-fg-vpp-suffix',
    'quick-scope-select'
  ].forEach((id) => store.set(id, {
    id,
    value: '',
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  global.document = {
    getElementById: (id) => {
      if (id === 'mobile-quick-bar') return bar;
      if (id === 'quick-pot-slider') return slider;
      return store.get(id) || null;
    },
    querySelectorAll: () => Array.from(store.values())
  };
  return { bar, toggles, slider, groups: store, store };
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
    expect(store.get('quick-scope-select').classList.remove).toBeDefined();
    expect(store.get('quick-scope-select').size).toBe(2);
    __testSetSelected(scopes[0]);
    quickScopeToggleMain(); // should not throw
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
    expect(groups.get('potentiometer').classList.hidden).toBe(false);
    expect(groups.get('switch').classList.hidden).toBe(true);
    __testSetSelected(fg);
    updateQuickControlsVisibility();
    expect(groups.get('funcgen').classList.hidden).toBe(false);
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
});
