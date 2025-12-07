import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  wire,
  runDC,
  resistorCurrent
} from '../testHarness';

describe('Basic DC elements', () => {
  [
    { vin: 5, R: 1e3 },
    { vin: 5, R: 1e4 },
    { vin: 5, R: 1e5 },
    { vin: 12, R: 2.2e3 }
  ].forEach(({ vin, R }) => {
    it(`drives a single ${R}Ω resistor from ${vin} V`, () => {
      const circuit = buildCircuit();
      const gnd = makeGround();
      const src = makeVoltageSource(vin);
      const r = makeResistor(R);
      circuit.add(gnd, src, r);
      circuit.connect(src, 1, gnd, 0);
      circuit.connect(src, 0, r, 0);
      circuit.connect(r, 1, gnd, 0);
      const { voltage } = runDC(circuit);
      expect(voltage(r, 0)).toBeCloseTo(vin, 3);
      expect(resistorCurrent(r, voltage)).toBeCloseTo(vin / R, 6);
    });
  });

  it('evaluates multiple voltage dividers', () => {
    const cases = [
      { vin: 10, r1: 1e3, r2: 1e3, expected: 5 },
      { vin: 12, r1: 1e3, r2: 2e3, expected: 8 },
      { vin: 9, r1: 2e3, r2: 1e3, expected: 3 }
    ];
    cases.forEach(({ vin, r1, r2, expected }) => {
      const circuit = buildCircuit();
      const gnd = makeGround();
      const src = makeVoltageSource(vin);
      const top = makeResistor(r1);
      const bot = makeResistor(r2);
      circuit.add(gnd, src, top, bot);
      circuit.connect(src, 1, gnd, 0);
      circuit.connect(src, 0, top, 0);
      circuit.connect(top, 1, bot, 0);
      circuit.connect(bot, 1, gnd, 0);
      const { voltage } = runDC(circuit);
      expect(voltage(top, 1)).toBeCloseTo(expected, 3);
    });
  });

  it('computes drops across a resistor ladder', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(12);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(2e3);
    const r3 = makeResistor(3e3);
    circuit.add(gnd, src, r1, r2, r3);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r1, 0);
    circuit.connect(r1, 1, r2, 0);
    circuit.connect(r2, 1, r3, 0);
    circuit.connect(r3, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const total = 1e3 + 2e3 + 3e3;
    const current = 12 / total;
    expect(resistorCurrent(r1, voltage)).toBeCloseTo(current, 6);
    expect(voltage(r1, 1)).toBeCloseTo(12 - current * 1e3, 3);
    expect(voltage(r2, 1)).toBeCloseTo(12 - current * (1e3 + 2e3), 3);
  });

  it('solves parallel resistor networks', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(10);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(2e3);
    const r3 = makeResistor(4e3);
    circuit.add(gnd, src, r1, r2, r3);
    circuit.connect(src, 1, gnd, 0);
    [r1, r2, r3].forEach((r) => {
      circuit.connect(src, 0, r, 0);
      circuit.connect(r, 1, gnd, 0);
    });

    const { voltage } = runDC(circuit);
    const currents = [r1, r2, r3].map((r) => resistorCurrent(r, voltage));
    const totalCurrent = currents.reduce((acc, i) => acc + i, 0);
    const req = 1 / (1 / 1e3 + 1 / 2e3 + 1 / 4e3);
    expect(voltage(r1, 0)).toBeCloseTo(10, 4);
    expect(totalCurrent).toBeCloseTo(10 / req, 3);
  });

  it('shows no bridge current in a balanced Wheatstone bridge', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(10);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(1e3);
    const r3 = makeResistor(1e3);
    const r4 = makeResistor(1e3);
    const r5 = makeResistor(10e3);
    circuit.add(gnd, src, r1, r2, r3, r4, r5);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r1, 0);
    circuit.connect(src, 0, r3, 0);
    circuit.connect(r1, 1, r2, 0);
    circuit.connect(r3, 1, r4, 0);
    circuit.connect(r2, 1, gnd, 0);
    circuit.connect(r4, 1, gnd, 0);
    circuit.connect(r1, 1, r5, 0);
    circuit.connect(r3, 1, r5, 1);

    const { voltage } = runDC(circuit);
    const vDiff = voltage(r1, 1) - voltage(r3, 1);
    const iBridge = Math.abs((voltage(r5, 0) - voltage(r5, 1)) / parseFloat(r5.props.R));
    expect(Math.abs(vDiff)).toBeLessThan(1e-6);
    expect(iBridge).toBeLessThan(1e-6);
  });

  it('shows bridge imbalance when a resistor drifts', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(10);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(1e3);
    const r3 = makeResistor(1e3);
    const r4 = makeResistor(2e3);
    const r5 = makeResistor(10e3);
    circuit.add(gnd, src, r1, r2, r3, r4, r5);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r1, 0);
    circuit.connect(src, 0, r3, 0);
    circuit.connect(r1, 1, r2, 0);
    circuit.connect(r3, 1, r4, 0);
    circuit.connect(r2, 1, gnd, 0);
    circuit.connect(r4, 1, gnd, 0);
    circuit.connect(r1, 1, r5, 0);
    circuit.connect(r3, 1, r5, 1);

    const { voltage } = runDC(circuit);
    const vDiff = voltage(r1, 1) - voltage(r3, 1);
    expect(vDiff).toBeCloseTo(-1.5, 1);
    expect(Math.abs(resistorCurrent(r5, voltage))).toBeGreaterThan(1e-4);
  });

  it('handles mixed series-parallel stacks', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(15);
    const rTop = makeResistor(1e3);
    const rLeft = makeResistor(2e3);
    const rRight = makeResistor(2e3);
    const rBottom = makeResistor(1e3);

    circuit.add(gnd, src, rTop, rLeft, rRight, rBottom);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, rTop, 0);
    circuit.connect(rTop, 1, rLeft, 0);
    circuit.connect(rTop, 1, rRight, 0);
    circuit.connect(rLeft, 1, rBottom, 0);
    circuit.connect(rRight, 1, rBottom, 0);
    circuit.connect(rBottom, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const equivalent = 1e3 + 1 / (1 / 2e3 + 1 / 2e3) + 1e3; // ~3000 Ω
    const current = 15 / equivalent;
    expect(resistorCurrent(rTop, voltage)).toBeCloseTo(current, 4);
    expect(voltage(rTop, 1)).toBeCloseTo(15 - current * 1e3, 3);
  });
});
