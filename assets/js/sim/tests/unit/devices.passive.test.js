// Passive device dynamics (capacitor energy, RC maths, LED forward drop) are
// checked against physical formulas and numeric measurements, not internal state.
import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeSwitch,
  makeResistor,
  makeLED,
  makePotentiometer,
  runDC,
  resistorCurrent
} from '../testHarness';

describe('Switch behaviour across families', () => {
  it('routes an SPDT throw cleanly between two loads', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const sw = makeSwitch('SPDT', 'A');
    const ra = makeResistor(1e3);
    const rb = makeResistor(3e3);
    circuit.add(gnd, src, sw, ra, rb);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, sw, 0);
    circuit.connect(sw, 1, ra, 0);
    circuit.connect(sw, 2, rb, 0);
    circuit.connect(ra, 1, gnd, 0);
    circuit.connect(rb, 1, gnd, 0);

    const closedA = runDC(circuit).voltage;
    const iA = resistorCurrent(ra, closedA);
    const iBLeak = resistorCurrent(rb, closedA);
    expect(iA).toBeCloseTo(0.009, 5);
    expect(Math.abs(iBLeak)).toBeLessThan(1e-6);

    sw.props.Position = 'B';
    const closedB = runDC(circuit).voltage;
    const iA2 = resistorCurrent(ra, closedB);
    const iB2 = resistorCurrent(rb, closedB);
    expect(Math.abs(iA2)).toBeLessThan(1e-6);
    expect(iB2).toBeCloseTo(0.003, 5);
  });

  it('toggles both poles of a DPDT at once', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const sw = makeSwitch('DPDT', 'A');
    const r1a = makeResistor(1e3);
    const r1b = makeResistor(2e3);
    const r2a = makeResistor(1e3);
    const r2b = makeResistor(2e3);

    circuit.add(gnd, src, sw, r1a, r1b, r2a, r2b);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, sw, 0);
    circuit.connect(src, 0, sw, 3);
    circuit.connect(sw, 1, r1a, 0);
    circuit.connect(sw, 2, r1b, 0);
    circuit.connect(sw, 4, r2a, 0);
    circuit.connect(sw, 5, r2b, 0);
    circuit.connect(r1a, 1, gnd, 0);
    circuit.connect(r1b, 1, gnd, 0);
    circuit.connect(r2a, 1, gnd, 0);
    circuit.connect(r2b, 1, gnd, 0);

    const posA = runDC(circuit).voltage;
    expect(resistorCurrent(r1a, posA)).toBeCloseTo(0.005, 4);
    expect(resistorCurrent(r2a, posA)).toBeCloseTo(0.005, 4);
    expect(Math.abs(resistorCurrent(r1b, posA))).toBeLessThan(1e-6);
    expect(Math.abs(resistorCurrent(r2b, posA))).toBeLessThan(1e-6);

    sw.props.Position = 'B';
    const posB = runDC(circuit).voltage;
    expect(Math.abs(resistorCurrent(r1a, posB))).toBeLessThan(1e-6);
    expect(Math.abs(resistorCurrent(r2a, posB))).toBeLessThan(1e-6);
    expect(resistorCurrent(r1b, posB)).toBeCloseTo(0.0025, 4);
    expect(resistorCurrent(r2b, posB)).toBeCloseTo(0.0025, 4);
  });
});

describe('Semiconductor components', () => {
  it('drops voltage across an LED when forward biased', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const r = makeResistor(680);
    const led = makeLED({ Vf: '2', If: '15m' });
    circuit.add(gnd, src, r, led);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, led, 0);
    circuit.connect(led, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const drop = voltage(led, 0) - voltage(led, 1);
    expect(drop).toBeGreaterThan(1.5);
    expect(resistorCurrent(r, voltage)).toBeGreaterThan(5e-3);
  });

  it('blocks current when reverse biased', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const led = makeLED();
    circuit.add(gnd, src, r, led);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, led, 1);
    circuit.connect(led, 0, gnd, 0);

    const { voltage } = runDC(circuit);
    expect(Math.abs(resistorCurrent(r, voltage))).toBeLessThan(1e-6);
  });

  it('keeps reverse leakage far below forward conduction', () => {
    const forwardGnd = makeGround();
    const forwardSrc = makeVoltageSource(5);
    const reverseGnd = makeGround();
    const reverseSrc = makeVoltageSource(5);
    const forward = makeLED({ Vf: '2', If: '10m' });
    const reverse = makeLED();
    const rForward = makeResistor(1e3);
    const rReverse = makeResistor(1e3);

    const forwardCircuit = buildCircuit();
    forwardCircuit.add(forwardGnd, forwardSrc, rForward, forward);
    forwardCircuit.connect(forwardSrc, 1, forwardGnd, 0);
    forwardCircuit.connect(forwardSrc, 0, rForward, 0);
    forwardCircuit.connect(rForward, 1, forward, 0);
    forwardCircuit.connect(forward, 1, forwardGnd, 0);

    const reverseCircuit = buildCircuit();
    reverseCircuit.add(reverseGnd, reverseSrc, rReverse, reverse);
    reverseCircuit.connect(reverseSrc, 1, reverseGnd, 0);
    reverseCircuit.connect(reverseSrc, 0, rReverse, 0);
    reverseCircuit.connect(rReverse, 1, reverse, 1);
    reverseCircuit.connect(reverse, 0, reverseGnd, 0);

    const forwardCurrent = Math.abs(resistorCurrent(rForward, runDC(forwardCircuit).voltage));
    const reverseCurrent = Math.abs(resistorCurrent(rReverse, runDC(reverseCircuit).voltage));

    expect(forwardCurrent).toBeGreaterThan(2e-3);
    expect(reverseCurrent).toBeLessThan(1e-6);
    expect(forwardCurrent / Math.max(reverseCurrent, 1e-9)).toBeGreaterThan(1e4);
  });
});

describe('Potentiometers', () => {
  [10, 25, 50, 75, 90].forEach((turn) => {
    it(`places the wiper near ${turn}% of the supply`, () => {
      const circuit = buildCircuit();
      const gnd = makeGround();
      const src = makeVoltageSource(5);
      const pot = makePotentiometer(10e3, turn);
      const load = makeResistor(1e8);
      circuit.add(gnd, src, pot, load);
      circuit.connect(src, 1, gnd, 0);
      circuit.connect(src, 0, pot, 0);
      circuit.connect(pot, 2, gnd, 0);
      circuit.connect(pot, 1, load, 0);
      circuit.connect(load, 1, gnd, 0);

      const { voltage } = runDC(circuit);
      const frac = turn / 100;
      const r1 = Math.max(1e-3, 10e3 * frac);
      const r2 = Math.max(1e-3, 10e3 * (1 - frac));
      const expected = 5 * (r2 / (r1 + r2));
      expect(voltage(pot, 1)).toBeCloseTo(expected, 2);
    });
  });

  it('accounts for a finite load at the wiper', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const pot = makePotentiometer(10e3, 50);
    const load = makeResistor(10e3);
    circuit.add(gnd, src, pot, load);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, pot, 0);
    circuit.connect(pot, 2, gnd, 0);
    circuit.connect(pot, 1, load, 0);
    circuit.connect(load, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const rTop = 5e3;
    const rBottom = 5e3;
    const rBottomLoaded = (rBottom * 10e3) / (rBottom + 10e3);
    const expected = 5 * (rBottomLoaded / (rTop + rBottomLoaded));
    const actual = voltage(pot, 1);
    expect(actual).toBeCloseTo(expected, 2);
    expect(actual).toBeLessThan(2.5);
    expect(Math.abs(resistorCurrent(load, voltage))).toBeCloseTo(actual / 10e3, 5);
  });
});
