// Instrument components (oscilloscope channels, waveforms) are evaluated by
// sampling voltages/current against analytic source values, never against solver state.
import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeFunctionGenerator,
  makeVoltageSource,
  makeResistor,
  makeOscilloscope,
  wire,
  runSimulation,
  parseUnit,
  simulateCircuit
} from '../helpers';

const FUNCGEN_RS = 2; // FUNCGEN_REF_RES + FUNCGEN_SERIES_RES

function sineAt(Vpp, freq, t, offset = 0, phaseDeg = 0) {
  const amp = Vpp / 2;
  const phase = 2 * Math.PI * freq * t + (phaseDeg * Math.PI) / 180;
  return offset + amp * Math.sin(phase);
}

function triangleAt(Vpp, freq, t, offset = 0) {
  const amp = Vpp / 2;
  const cyc = ((t * freq) % 1 + 1) % 1;
  const tri = cyc < 0.5 ? (cyc * 4 - 1) : (3 - cyc * 4);
  return offset + amp * tri;
}

describe('Function generator', () => {
  it('drives a single-ended load with COM grounded', () => {
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '4', Offset: '1', Freq: '50' });
    const load = makeResistor(1e3);
    const wires = [
      wire(fg, 1, gnd, 0), // COM
      wire(fg, 0, load, 0), // +
      wire(load, 1, gnd, 0) // load to ground
    ];

    const times = [0, 0.0025, 0.005, 0.0075, 0.01]; // one 50 Hz period
    const expectedWave = times.map((t) => sineAt(4, 50, t, 1));
    const attenuation = 1e3 / (1e3 + FUNCGEN_RS);

    times.forEach((t, idx) => {
      const { voltage } = simulateCircuit({ components: [gnd, fg, load], wires, time: t, dt: 1e-4 });
      expect(voltage(load, 0)).toBeCloseTo(expectedWave[idx] * attenuation, 1);
    });
  });

  it('sums two sources through their internal impedances', () => {
    const gnd = makeGround();
    const fg1 = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: '40', Wave: 'sine' });
    const fg2 = makeFunctionGenerator({ Vpp: '1', Offset: '0.5', Freq: '80', Wave: 'triangle' });
    const load = makeResistor(1e3);
    const wires = [
      wire(fg1, 1, gnd, 0),
      wire(fg2, 1, gnd, 0),
      wire(fg1, 0, load, 0),
      wire(fg2, 0, load, 0),
      wire(load, 1, gnd, 0)
    ];

    const times = [0, 0.0025, 0.005, 0.0075];
    times.forEach((t) => {
      const v1 = sineAt(2, 40, t, 0);
      const v2 = triangleAt(1, 80, t, 0.5);
      const expected = ((v1 / FUNCGEN_RS) + (v2 / FUNCGEN_RS)) / (2 / FUNCGEN_RS + 1 / 1e3);
      const { voltage } = simulateCircuit({ components: [gnd, fg1, fg2, load], wires, time: t, dt: 1e-4 });
      expect(voltage(load, 0)).toBeCloseTo(expected, 2);
    });
  });
});

describe('Oscilloscope channels remain high impedance', () => {
  it('does not load a measured node', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const baseWires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, gnd, 0)
    ];
    const base = simulateCircuit({ components: [gnd, src, r], wires: baseWires });
    const scope = makeOscilloscope();
    const scopedWires = [
      ...baseWires,
      wire(scope, 0, r, 1),
      wire(scope, 2, gnd, 0)
    ];
    const scoped = simulateCircuit({ components: [gnd, src, r, scope], wires: scopedWires });
    expect(scoped.voltage(r, 1)).toBeCloseTo(base.voltage(r, 1), 6);
  });

  it('handles an open second channel gracefully', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(3.3);
    const r = makeResistor(2e3);
    const scope = makeOscilloscope();
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, gnd, 0),
      wire(scope, 0, r, 1),
      wire(scope, 2, gnd, 0)
      // Channel 2 left open
    ];
    const { voltage } = simulateCircuit({ components: [gnd, src, r, scope], wires });
    expect(voltage(r, 0)).toBeCloseTo(3.3, 3);
  });
});

describe('Floating node handling', () => {
  it('reports missing reference nodes clearly', () => {
    const r = makeResistor(1e3);
    const result = runSimulation({ components: [r], wires: [], parseUnit });
    expect(result.error).toMatch(/No reference node/);
  });

  it('ignores disconnected sub-circuits', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const floating = makeResistor(10e3);

    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, gnd, 0)
      // floating resistor not wired at all
    ];

    const base = simulateCircuit({ components: [gnd, src, r], wires });
    const withFloat = simulateCircuit({ components: [gnd, src, r, floating], wires });
    expect(withFloat.voltage(r, 1)).toBeCloseTo(base.voltage(r, 1), 6);
  });

  it('ignores an unconnected ground symbol and keeps node voltages unchanged', () => {
    const src = makeVoltageSource(5);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(1e3);

    // Source plus -> node HI; minus -> node LO. Two parallel resistors HI-LO.
    const wires = [
      wire(src, 0, r1, 0),
      wire(src, 1, r1, 1),
      wire(src, 0, r2, 0),
      wire(src, 1, r2, 1)
    ];

    const base = simulateCircuit({ components: [src, r1, r2], wires });
    const vHiBase = base.voltage(r1, 0) - base.voltage(r1, 1);

    // Drop an unconnected ground symbol; voltages should stay identical
    const strayGnd = makeGround();
    const withGnd = simulateCircuit({ components: [src, r1, r2, strayGnd], wires });
    const vHiGnd = withGnd.voltage(r1, 0) - withGnd.voltage(r1, 1);

    expect(vHiBase).toBeCloseTo(5, 6);
    expect(vHiGnd).toBeCloseTo(vHiBase, 6);
  });
});
