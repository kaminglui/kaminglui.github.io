import { describe, it, expect, vi } from 'vitest';
import {
  quickSelectNext,
  quickSelectPrev,
  quickToggleSwitchPosition,
  quickAdjustPot,
  quickSetPotTurn,
  quickSetFuncGenFreq,
  quickSetFuncGenVpp,
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
  global.document = {
    getElementById: (id) => {
      if (id === 'mobile-quick-bar') return bar;
      if (id === 'quick-pot-slider') return slider;
      return null;
    },
    querySelectorAll: () => Array.from(store.values())
  };
  return { bar, toggles, slider, groups: store };
}

function setComponents(list) {
  __testSetComponents(list);
}

describe('quick bar logic', () => {
  it('shows only with a selected controllable component', () => {
    const { bar, toggles } = stubDom();
    const sw = { kind: 'switch', id: 'SW1', props: { Position: 'A' } };
    setComponents([]);
    syncQuickBarVisibility();
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: true });
    setComponents([sw]);
    syncQuickBarVisibility(); // nothing selected yet
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: true });
    __testSetSelected(sw);
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: false });
    expect(bar.setAttribute).toHaveBeenCalled();
    __testSetSelected(null);
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: true });
  });

  it('cycles only controllable kinds in order', () => {
    global.document = { getElementById: () => null };
    setComponents([
      { kind: 'ground', id: 'G1', props: {} },
      { kind: 'switch', id: 'SW1', props: { Position: 'A' } },
      { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } },
      { kind: 'junction', id: 'J1', props: {} }
    ]);
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('SW1');
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('POT1');
    quickSelectPrev();
    expect(__testGetSelected()?.id).toBe('SW1');
  });

  it('quick controls mutate component props', () => {
    const { slider } = stubDom(['switch', 'potentiometer', 'funcgen']);
    const sw = { kind: 'switch', id: 'SW1', props: { Position: 'A' } };
    const pot = { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } };
    const fg = { kind: 'funcgen', id: 'FG1', props: { Vpp: '1', Freq: '880' } };
    setComponents([sw, pot, fg]);
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
    quickSetFuncGenFreq('110');
    quickSetFuncGenVpp('0.5');
    expect(fg.props.Freq).toBe('110');
    expect(fg.props.Vpp).toBe('0.5');
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
