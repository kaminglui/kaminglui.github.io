import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeOscilloscope,
  runDC
} from './testHarness';

describe('Oscilloscope connections', () => {
  it('does not disturb a divider even with multiple probes attached', () => {
    const base = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(10);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(1e3);
    base.add(gnd, src, r1, r2);
    base.connect(src, 1, gnd, 0);
    base.connect(src, 0, r1, 0);
    base.connect(r1, 1, r2, 0);
    base.connect(r2, 1, gnd, 0);

    const baseOut = runDC(base).voltage(r1, 1);

    const scopeA = makeOscilloscope();
    const scopeB = makeOscilloscope();
    base.add(scopeA, scopeB);
    base.connect(scopeA, 0, r1, 1);
    base.connect(scopeA, 2, gnd, 0);
    base.connect(scopeB, 0, r1, 1);
    base.connect(scopeB, 2, gnd, 0);

    const withScopes = runDC(base).voltage(r1, 1);
    expect(withScopes).toBeCloseTo(baseOut, 6);
  });

  it('accepts a floating second channel without creating ground', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(3.3);
    const r = makeResistor(3.3e3);
    const scope = makeOscilloscope();
    circuit.add(gnd, src, r, scope);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, gnd, 0);
    circuit.connect(scope, 0, r, 0);
    // Channel 2 floating

    const { voltage } = runDC(circuit);
    expect(voltage(r, 0)).toBeCloseTo(3.3, 3);
  });

  it('supports differential-style probing between two nodes', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const rTop = makeResistor(2e3);
    const rMid = makeResistor(1e3);
    const rBot = makeResistor(1e3);
    const scope = makeOscilloscope();
    circuit.add(gnd, src, rTop, rMid, rBot, scope);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, rTop, 0);
    circuit.connect(rTop, 1, rMid, 0);
    circuit.connect(rMid, 1, rBot, 0);
    circuit.connect(rBot, 1, gnd, 0);
    circuit.connect(scope, 0, rTop, 1); // CH1+
    circuit.connect(scope, 1, rMid, 1); // CH2+ used as pseudo negative
    circuit.connect(scope, 2, gnd, 0);

    const { voltage } = runDC(circuit);
    const vTop = voltage(rTop, 1);
    const vMid = voltage(rMid, 1);
    const expectedDiff = vTop - vMid;
    expect(expectedDiff).toBeCloseTo(1.25, 2);
  });
});
