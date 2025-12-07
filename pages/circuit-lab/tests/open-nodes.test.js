import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeFunctionGenerator,
  runSimulation,
  runDC,
  wire
} from './testHarness';

describe('Open and floating networks', () => {
  it('reports an error when no reference node exists', () => {
    const circuit = buildCircuit();
    const r = makeResistor(1e3);
    circuit.add(r);
    const result = runSimulation({ components: circuit.components, wires: circuit.wires });
    expect(result.error).toMatch(/No reference node/i);
    expect(result.singular).toBe(false);
  });

  it('keeps main circuit stable when a dangling component is present', () => {
    const base = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(1e3);
    base.add(gnd, src, r1, r2);
    base.connect(src, 1, gnd, 0);
    base.connect(src, 0, r1, 0);
    base.connect(r1, 1, r2, 0);
    base.connect(r2, 1, gnd, 0);
    const baseRun = runDC(base).voltage(r2, 0);

    const withDangling = {
      components: [...base.components, makeResistor(10e3)],
      wires: [...base.wires]
    };
    const vWith = runDC(withDangling).voltage(r2, 0);
    expect(vWith).toBeCloseTo(baseRun, 6);
  });

  it('ignores multiple floating subgraphs', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const load = makeResistor(3e3);
    const island1a = makeResistor(2e3);
    const island1b = makeResistor(2e3);
    const island2Src = makeVoltageSource(1);
    const island2Load = makeResistor(100);

    circuit.add(gnd, src, load, island1a, island1b, island2Src, island2Load);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, load, 0);
    circuit.connect(load, 1, gnd, 0);
    // floating subgraph 1: two resistors not tied to main circuit
    circuit.connect(island1a, 0, island1b, 0);
    circuit.connect(island1a, 1, island1b, 1);
    // floating subgraph 2: tiny source and load, also isolated
    circuit.connect(island2Src, 0, island2Load, 0);
    circuit.connect(island2Src, 1, island2Load, 1);

    const { voltage } = runDC(circuit);
    expect(voltage(load, 0)).toBeCloseTo(9 * (3e3 / (3e3 + 0)), 3);
    expect(voltage(island1a, 0)).toBeCloseTo(voltage(island1a, 1), 6);
  });

  it('surfaces singular conflicts between ideal sources', () => {
    const gnd = makeGround();
    const v5 = makeVoltageSource(5);
    const v9 = makeVoltageSource(9);
    const components = [gnd, v5, v9];
    const wires = [
      wire(v5, 1, gnd, 0),
      wire(v9, 1, gnd, 0),
      wire(v5, 0, v9, 0) // conflict: both plus nodes tied together
    ];
    const result = runSimulation({ components, wires });
    const magnitude = Math.max(...Array.from(result.solution || []).map((v) => Math.abs(v)), 0);
    expect(result.singular || magnitude > 1e6).toBe(true);
  });
});
