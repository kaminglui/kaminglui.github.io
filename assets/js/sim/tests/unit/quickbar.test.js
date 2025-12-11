import { describe, it, expect, vi } from 'vitest';
import {
  quickSelectNext,
  quickSelectPrev,
  quickToggleSwitchPosition,
  quickAdjustPot,
  quickSetFuncGenFreq,
  quickSetFuncGenVpp,
  syncQuickBarVisibility,
  safeCall,
  __testSetComponents,
  __testGetSelected,
  __testSetSelected
} from '../../../circuitforge.js';

function stubBar() {
  const toggles = [];
  const bar = {
    classList: {
      toggle: (cls, state) => toggles.push({ cls, state })
    },
    setAttribute: vi.fn()
  };
  global.document = {
    getElementById: (id) => (id === 'mobile-quick-bar' ? bar : null)
  };
  return { bar, toggles };
}

function setComponents(list) {
  __testSetComponents(list);
}

describe('quick bar logic', () => {
  it('hides when no components and shows when present', () => {
    const { bar, toggles } = stubBar();
    setComponents([]);
    syncQuickBarVisibility();
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: true });
    setComponents([{ kind: 'switch', id: 'SW1' }]);
    syncQuickBarVisibility();
    expect(toggles.at(-1)).toEqual({ cls: 'hidden', state: false });
    expect(bar.setAttribute).toHaveBeenCalled();
  });

  it('cycles selection by kind order', () => {
    setComponents([
      { kind: 'resistor', id: 'R1', props: {} },
      { kind: 'switch', id: 'SW1', props: { Position: 'A' } },
      { kind: 'potentiometer', id: 'POT1', props: { Turn: '50' } }
    ]);
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('SW1');
    quickSelectNext();
    expect(__testGetSelected()?.id).toBe('POT1');
    quickSelectPrev();
    expect(__testGetSelected()?.id).toBe('SW1');
  });

  it('quick controls mutate component props', () => {
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
    __testSetSelected(fg);
    quickSetFuncGenFreq('110');
    quickSetFuncGenVpp('0.5');
    expect(fg.props.Freq).toBe('110');
    expect(fg.props.Vpp).toBe('0.5');
  });
});
