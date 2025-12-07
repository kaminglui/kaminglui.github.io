import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  makeOpAmp,
  wire,
  simulateCircuit
} from './helpers';

function connectDualRails(op, gnd, vPos, vNeg, components, wires) {
  const vccp = makeVoltageSource(vPos);
  const vccn = makeVoltageSource(vNeg);
  components.push(vccp, vccn);
  wires.push(wire(vccp, 0, op, 7), wire(vccp, 1, gnd, 0));
  wires.push(wire(vccn, 0, op, 3), wire(vccn, 1, gnd, 0));
}

describe('Op-amp linear configurations', () => {
  it('implements an inverting amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.5);
    const rin = makeResistor(1e3);
    const rf = makeResistor(10e3);

    const components = [gnd, op, vin, rin, rf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, rin, 0),
      wire(rin, 1, op, 1), // inverting input
      wire(op, 2, gnd, 0), // non-inverting to ground
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-5, 3);
  });

  it('implements a non-inverting amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.25);
    const rg = makeResistor(1e3);
    const rf = makeResistor(9e3);

    const components = [gnd, op, vin, rg, rf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, op, 2), // non-inverting input
      wire(op, 1, rg, 0),
      wire(rg, 1, gnd, 0),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(2.5, 3);
  });

  it('acts as an inverting summer', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const v1 = makeVoltageSource(0.2);
    const v2 = makeVoltageSource(0.1);
    const r1 = makeResistor(10e3);
    const r2 = makeResistor(10e3);
    const rf = makeResistor(10e3);

    const components = [gnd, op, v1, v2, r1, r2, rf];
    const wires = [
      wire(v1, 1, gnd, 0),
      wire(v2, 1, gnd, 0),
      wire(v1, 0, r1, 0),
      wire(v2, 0, r2, 0),
      wire(r1, 1, op, 1),
      wire(r2, 1, op, 1),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1),
      wire(op, 2, gnd, 0)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-0.3, 3);
  });
});

describe('Op-amp nonlinear/temporal uses', () => {
  it('saturates as a comparator', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vpos = makeVoltageSource(5);
    const vinp = makeVoltageSource(3);
    const vinm = makeVoltageSource(2);
    const load = makeResistor(10e3);

    const components = [gnd, op, vpos, vinp, vinm, load];
    const wires = [
      wire(vpos, 0, op, 7), wire(vpos, 1, gnd, 0),
      wire(op, 3, gnd, 0),
      wire(vinp, 1, gnd, 0), wire(vinp, 0, op, 2),
      wire(vinm, 1, gnd, 0), wire(vinm, 0, op, 1),
      wire(op, 0, load, 0), wire(load, 1, gnd, 0)
    ];

    const high = simulateCircuit({ components, wires }).voltage(op, 0);
    expect(high).toBeCloseTo(4.9, 2);

    vinp.props.Vdc = '1';
    vinm.props.Vdc = '2.5';
    const low = simulateCircuit({ components, wires }).voltage(op, 0);
    expect(low).toBeCloseTo(0.1, 2);
  });

  it('integrates a constant input', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(1);
    const rin = makeResistor(1e3);
    const cf = makeCapacitor(1e-6);

    const components = [gnd, op, vin, rin, cf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, rin, 0),
      wire(rin, 1, op, 1),
      wire(op, 2, gnd, 0),
      wire(op, 0, cf, 0),
      wire(cf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const dt = 1e-5;
    let t = 0;
    const targetT = 0.0005;
    while (t <= targetT) {
      simulateCircuit({ components, wires, time: t, dt });
      t += dt;
    }
    const { voltage } = simulateCircuit({ components, wires, time: t, dt });
    expect(voltage(op, 0)).toBeCloseTo(-0.5, 1);
  });

  it('differentiates a sine input', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const fg = makeVoltageSource(0); // placeholder, sine injected via Function Generator analogue
    const cap = makeCapacitor(1e-6);
    const rf = makeResistor(1e3);

    // Use function generator values manually for expected derivatives
    const freq = 500;
    const Vpp = 1;

    const components = [gnd, op, fg, cap, rf];
    const wires = [
      wire(fg, 1, gnd, 0),
      wire(fg, 0, cap, 0),
      wire(cap, 1, op, 1),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1),
      wire(op, 2, gnd, 0)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const dt = 1e-5;
    let t = 0;
    const samples = [];
    const omega = 2 * Math.PI * freq;

    // drive the placeholder source by updating its Vdc each step to emulate a sine
    while (t <= 0.006) {
      const vin = (Vpp / 2) * Math.sin(omega * t);
      fg.props.Vdc = String(vin);
      const { voltage } = simulateCircuit({ components, wires, time: t, dt });
      if (t >= 0.004) { // after a few cycles
        samples.push({ t, out: voltage(op, 0), vin });
      }
      t += dt;
    }

    // Compare amplitude to ideal differentiator gain: |Vout| = |Vin| * omega * R * C
    const gain = omega * 1e3 * 1e-6;
    const peakVin = Vpp / 2;
    const expectedPeak = peakVin * gain;
    const measuredPeak = Math.max(...samples.map((s) => Math.abs(s.out)));
    expect(measuredPeak).toBeCloseTo(expectedPeak, 1);
  });
});
