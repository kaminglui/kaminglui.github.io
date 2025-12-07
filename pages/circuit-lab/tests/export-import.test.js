import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  exportCircuit,
  importCircuit,
  runDC,
  resetIdRegistry
} from './testHarness';

describe('Circuit export/import and IDs', () => {
  it('allocates readable, sequential component IDs', () => {
    resetIdRegistry();
    const gnd = makeGround();
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(2e3);
    expect(gnd.id).toBe('GND1');
    expect(r1.id).toBe('R1');
    expect(r2.id).toBe('R2');
  });

  it('preserves IDs and behaviour across a round-trip', () => {
    resetIdRegistry();
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(10);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(2e3);
    circuit.add(gnd, src, r1, r2);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r1, 0);
    circuit.connect(r1, 1, r2, 0);
    circuit.connect(r2, 1, gnd, 0);

    const baseline = runDC(circuit).voltage(r1, 1);

    const snapshot = exportCircuit(circuit.components, circuit.wires);
    const imported = importCircuit(snapshot);
    const importedMap = new Map(imported.components.map((c) => [c.id, c]));
    const { voltage: vImported } = runDC(imported);

    expect(snapshot.components.every((c) => /^[A-Z]+\d+$/i.test(c.id))).toBe(true);
    expect(new Set(snapshot.components.map((c) => c.id)).size).toBe(snapshot.components.length);
    expect(importedMap.has(r1.id)).toBe(true);
    expect(vImported(importedMap.get(r1.id), 1)).toBeCloseTo(baseline, 4);
  });
});
