import { describe, it, expect } from 'vitest';
import { LED } from './LED.js';

function stubStamps() {
  const stamps = {
    conductances: [],
    currents: [],
    stampConductance(n1, n2, g) {
      this.conductances.push({ n1, n2, g });
    },
    stampCurrent(node, i) {
      this.currents.push({ node, i });
    }
  };
  return stamps;
}

function makeLED(overrides = {}) {
  return new LED(0, 1, { Vf: 2, If: 0.01, ...overrides });
}

describe('LED 4-state model', () => {
  it('starts in off state by default and stamps leakage only', () => {
    const led = makeLED();
    expect(led.state).toBe('off');
    const stamps = stubStamps();
    led.stamp(stamps);
    expect(stamps.conductances).toHaveLength(1);
    expect(stamps.conductances[0].g).toBe(led.gOff);
    expect(stamps.currents).toHaveLength(0);
  });

  it('jumps off -> on when the voltage is clearly past the full-on threshold', () => {
    const led = makeLED();
    const changed = led.updateDiodeState([9, 0], (s, n) => s[n]);
    expect(changed).toBe(true);
    expect(led.state).toBe('on');
    expect(led.forwardOn).toBe(true);
  });

  it('steps off -> knee for a mild forward bias in the soft-turn-on window', () => {
    const led = makeLED();
    // 0.8 * Vf = 1.6, which is in (0.75*Vf=1.5, 0.95*Vf=1.9)
    led.updateDiodeState([1.6, 0], (s, n) => s[n]);
    expect(led.state).toBe('knee');
    expect(led.forwardOn).toBe(true);
  });

  it('stamps a smaller conductance and lower Vf offset in the knee state', () => {
    const led = makeLED();
    led.state = 'knee';
    const stamps = stubStamps();
    led.stamp(stamps);
    expect(stamps.conductances[0].g).toBeCloseTo(led.gKnee);
    expect(led.gKnee).toBeLessThan(led.gOn);
    // current source at anode uses VfKnee, lower than Vf
    expect(stamps.currents[0].i).toBeCloseTo(led.gKnee * led.VfKnee);
    expect(led.VfKnee).toBeLessThan(led.Vf);
  });

  it('enters reverse state below -0.1 V and uses tighter leakage', () => {
    const led = makeLED();
    led.updateDiodeState([0, 0.5], (s, n) => s[n]);
    expect(led.state).toBe('reverse');
    expect(led.gReverse).toBeLessThan(led.gOff);
  });

  it('keeps hysteresis: on -> knee only when the voltage drops well below Vf', () => {
    const led = makeLED();
    led.state = 'on';
    // 0.88 * Vf = 1.76, above onExit=0.85*Vf=1.7, so stays on
    led.updateDiodeState([1.76, 0], (s, n) => s[n]);
    expect(led.state).toBe('on');
    // 0.80 * Vf = 1.6, below onExit, so drops to knee
    led.updateDiodeState([1.6, 0], (s, n) => s[n]);
    expect(led.state).toBe('knee');
  });
});
