// DC component behaviours derived from basic circuit analysis: resistors, switches,
// LEDs, and potentiometers are measured against expected currents/voltages instead
// of consulting solver internals.
import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeVoltageSource,
  makeResistor,
  makePotentiometer,
  makeSwitch,
  makeLED,
  wire,
  simulateCircuit
} from '../helpers';

describe('DC resistive networks', () => {
  [1e3, 1e4, 1e5].forEach((R) => {
    it(`computes current through ${R}Ω series resistor`, () => {
      const gnd = makeGround();
      const src = makeVoltageSource(5);
      const r = makeResistor(R);
      const wires = [
        wire(src, 1, gnd, 0),
        wire(src, 0, r, 0),
        wire(r, 1, gnd, 0)
      ];
      const { voltage } = simulateCircuit({ components: [gnd, src, r], wires });
      const vTop = voltage(r, 0);
      const current = (vTop - voltage(r, 1)) / R;
      expect(vTop).toBeCloseTo(5, 3);
      expect(current).toBeCloseTo(5 / R, 6);
    });
  });

  it('solves voltage dividers', () => {
    const runDivider = (vin, r1, r2) => {
      const gnd = makeGround();
      const src = makeVoltageSource(vin);
      const top = makeResistor(r1);
      const bottom = makeResistor(r2);
      const wires = [
        wire(src, 1, gnd, 0),
        wire(src, 0, top, 0),
        wire(top, 1, bottom, 0),
        wire(bottom, 1, gnd, 0)
      ];
      const { voltage } = simulateCircuit({ components: [gnd, src, top, bottom], wires });
      return voltage(top, 1);
    };

    expect(runDivider(10, 1e3, 1e3)).toBeCloseTo(5, 3);
    expect(runDivider(12, 1e3, 2e3)).toBeCloseTo(8, 3);
  });

  it('respects series and parallel equivalents', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(2e3);
    const r3 = makeResistor(1e3);
    const r4 = makeResistor(1e3);

    // Series chain: src -> r1 -> r2 -> gnd
    const wiresSeries = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r1, 0),
      wire(r1, 1, r2, 0),
      wire(r2, 1, gnd, 0)
    ];
    const { voltage: vSeries } = simulateCircuit({ components: [gnd, src, r1, r2], wires: wiresSeries });
    const midVoltage = vSeries(r1, 1);
    expect(midVoltage).toBeCloseTo(6, 2); // 9 V across 1k+2k => 6 V at midpoint

    // Parallel leg behind a source resistor
    const gnd2 = makeGround();
    const src2 = makeVoltageSource(10);
    const rs = makeResistor(1e3);
    const p1 = makeResistor(1e3);
    const p2 = makeResistor(1e3);
    const wiresParallel = [
      wire(src2, 1, gnd2, 0),
      wire(src2, 0, rs, 0),
      wire(rs, 1, p1, 0),
      wire(rs, 1, p2, 0),
      wire(p1, 1, gnd2, 0),
      wire(p2, 1, gnd2, 0)
    ];
    const { voltage: vParallel } = simulateCircuit({
      components: [gnd2, src2, rs, p1, p2],
      wires: wiresParallel
    });
    const Rpar = 1 / (1 / 1e3 + 1 / 1e3); // 500 Ω
    const expectedNode = 10 * (Rpar / (Rpar + 1e3));
    expect(vParallel(rs, 1)).toBeCloseTo(expectedNode, 3);
  });
});

describe('Switch behaviour', () => {
  it('SPST open vs closed', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const swOpen = makeSwitch('SPST', 'B');
    const r = makeResistor(1e3);
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, swOpen, 0),
      wire(swOpen, 1, r, 0),
      wire(r, 1, gnd, 0)
    ];
    const { voltage: vOpen } = simulateCircuit({ components: [gnd, src, swOpen, r], wires });
    const iOpen = (vOpen(r, 0) - vOpen(r, 1)) / 1e3;
    expect(Math.abs(iOpen)).toBeLessThan(1e-6);

    swOpen.props.Position = 'A';
    const { voltage: vClosed } = simulateCircuit({ components: [gnd, src, swOpen, r], wires });
    const iClosed = (vClosed(r, 0) - vClosed(r, 1)) / 1e3;
    expect(vClosed(r, 0)).toBeCloseTo(5, 3);
    expect(iClosed).toBeCloseTo(0.005, 5);
  });

  it('SPDT connects only the selected throw', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const sw = makeSwitch('SPDT', 'A');
    const ra = makeResistor(1e3);
    const rb = makeResistor(2e3);
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, sw, 0),
      wire(sw, 1, ra, 0),
      wire(sw, 2, rb, 0),
      wire(ra, 1, gnd, 0),
      wire(rb, 1, gnd, 0)
    ];

    const { voltage: vA } = simulateCircuit({ components: [gnd, src, sw, ra, rb], wires });
    const iA = (vA(ra, 0) - vA(ra, 1)) / 1e3;
    const iB = (vA(rb, 0) - vA(rb, 1)) / 2e3;
    expect(iA).toBeCloseTo(0.009, 5);
    expect(Math.abs(iB)).toBeLessThan(1e-6);

    sw.props.Position = 'B';
    const { voltage: vB } = simulateCircuit({ components: [gnd, src, sw, ra, rb], wires });
    const iA2 = (vB(ra, 0) - vB(ra, 1)) / 1e3;
    const iB2 = (vB(rb, 0) - vB(rb, 1)) / 2e3;
    expect(Math.abs(iA2)).toBeLessThan(1e-6);
    expect(iB2).toBeCloseTo(0.0045, 5);
  });
});

describe('LED forward and reverse bias', () => {
  it('conducts with a plausible forward drop', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(330);
    const led = makeLED();
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, led, 0), // anode
      wire(led, 1, gnd, 0) // cathode
    ];
    const { voltage } = simulateCircuit({ components: [gnd, src, r, led], wires });
    const vAnode = voltage(led, 0);
    const vCathode = voltage(led, 1);
    const i = (voltage(r, 0) - voltage(r, 1)) / 330;
    expect(vAnode - vCathode).toBeGreaterThan(2.0);
    expect(i).toBeGreaterThan(1e-3);
  });

  it('blocks current when reverse-biased', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const led = makeLED();
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, led, 1), // connect cathode to resistor
      wire(led, 0, gnd, 0) // anode to ground (reverse bias)
    ];
    const { voltage } = simulateCircuit({ components: [gnd, src, r, led], wires });
    const current = (voltage(r, 0) - voltage(r, 1)) / 1e3;
    expect(Math.abs(current)).toBeLessThan(1e-6);
  });
});

describe('Potentiometer wiper positions', () => {
  const total = 10e3;
  const gnd = makeGround();
  const src = makeVoltageSource(5);
  const load = makeResistor(1e9); // keep the wiper node anchored without loading

  const baseWires = (pot) => ([
    wire(src, 1, gnd, 0),
    wire(src, 0, pot, 0),
    wire(pot, 2, gnd, 0),
    wire(pot, 1, load, 0),
    wire(load, 1, gnd, 0)
  ]);

  const expected = (turnPct) => {
    const frac = turnPct / 100;
    const r1 = Math.max(1e-3, total * frac);
    const r2 = Math.max(1e-3, total * (1 - frac));
    return 5 * (r2 / (r1 + r2));
  };

  [0, 50, 100].forEach((turn) => {
    it(`places the wiper near ${turn}%`, () => {
      const pot = makePotentiometer(total, turn);
      const wires = baseWires(pot);
      const { voltage } = simulateCircuit({ components: [gnd, src, pot, load], wires });
      const vw = voltage(pot, 1);
      expect(vw).toBeCloseTo(expected(turn), 2);
    });
  });
});
