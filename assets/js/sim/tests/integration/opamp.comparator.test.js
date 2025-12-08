import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeOpAmp,
  makeResistor,
  makeVoltageSource,
  runDC,
  runTransient,
  wire
} from '../testHarness';

const RAIL = 15;
const HEADROOM = 0.1; // matches engine op-amp headroom defaults

function powerOpAmp(op, gnd, components, wires, vPos = RAIL, vNeg = -RAIL) {
  const vccp = makeVoltageSource(vPos);
  const vccn = makeVoltageSource(vNeg);
  components.push(vccp, vccn);
  wires.push(wire(vccp, 0, op, 7), wire(vccp, 1, gnd, 0));
  wires.push(wire(vccn, 0, op, 3), wire(vccn, 1, gnd, 0));
}

function buildComparator({ invert = false } = {}) {
  const gnd = makeGround();
  const op = makeOpAmp();
  const vref = makeVoltageSource(2.5);
  const vin = makeVoltageSource(0);
  const load = makeResistor(10e3);
  const components = [gnd, op, vref, vin, load];
  const wires = [
    wire(vref, 1, gnd, 0),
    wire(vin, 1, gnd, 0),
    wire(op, 0, load, 0),
    wire(load, 1, gnd, 0)
  ];

  if (invert) {
    wires.push(wire(vin, 0, op, 1));
    wires.push(wire(vref, 0, op, 2));
  } else {
    wires.push(wire(vin, 0, op, 2));
    wires.push(wire(vref, 0, op, 1));
  }

  powerOpAmp(op, gnd, components, wires);
  return { components, wires, op, vin };
}

describe('op-amp comparator mode', () => {
  it('saturates toward the positive rail when V+ exceeds V−', () => {
    const circuit = buildComparator();
    circuit.vin.props.Vdc = 5;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeGreaterThan(RAIL - HEADROOM - 0.5);
  });

  it('saturates toward the negative rail when V+ is below V−', () => {
    const circuit = buildComparator();
    circuit.vin.props.Vdc = 0;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeLessThan(-RAIL + HEADROOM + 0.5);
  });

  it('avoids chatter on a slow threshold crossing', () => {
    const circuit = buildComparator();
    const duration = 0.005;
    const sweep = (t) => 5 * (t / duration);

    const { samples } = runTransient(circuit, {
      duration,
      dt: 5e-4,
      onStep: ({ t }) => { circuit.vin.props.Vdc = sweep(t); },
      measure: ({ sim }) => ({ vout: sim.voltage(circuit.op, 0) })
    });

    const outputs = samples.map((s) => s.vout);
    const transitions = outputs.reduce((count, v, idx, arr) => {
      if (idx === 0) return 0;
      const prev = arr[idx - 1];
      return (Math.sign(prev) !== Math.sign(v)) ? count + 1 : count;
    }, 0);

    expect(outputs[0]).toBeLessThan(-RAIL + 1);
    expect(outputs[outputs.length - 1]).toBeGreaterThan(RAIL - 1);
    expect(transitions).toBeLessThanOrEqual(2);
  });

  it('flips polarity when wired as an inverting comparator', () => {
    const circuit = buildComparator({ invert: true });
    circuit.vin.props.Vdc = 5;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeLessThan(-RAIL + HEADROOM + 0.5);
  });
});
