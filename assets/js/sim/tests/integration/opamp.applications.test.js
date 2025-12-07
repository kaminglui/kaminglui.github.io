import { describe, it, expect, test } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  makeOpAmp,
  runDC,
  runTransient,
  wire
} from '../testHarness';

function connectDualRails(op, gnd, vPos, vNeg, components, wires) {
  const vccp = makeVoltageSource(vPos);
  const vccn = makeVoltageSource(vNeg);
  components.push(vccp, vccn);
  wires.push(wire(vccp, 0, op, 7), wire(vccp, 1, gnd, 0));
  wires.push(wire(vccn, 0, op, 3), wire(vccn, 1, gnd, 0));
}

describe('Classic linear op-amp circuits', () => {
  test.each([0.2, 0.4, -0.2])('inverting amplifier gain with Vin=%d', (vin) => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const src = makeVoltageSource(vin);
    const rin = makeResistor(1e3);
    const rf = makeResistor(10e3);
    const components = [gnd, op, src, rin, rf];
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, rin, 0),
      wire(rin, 1, op, 1),
      wire(op, 2, gnd, 0),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 12, -12, components, wires);
    const { voltage } = runDC({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-10 * vin, 3);
  });

  it('implements a non-inverting amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.6);
    const r1 = makeResistor(1e3);
    const r2 = makeResistor(5e3);
    const components = [gnd, op, vin, r1, r2];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, op, 2),
      wire(op, 1, r1, 0),
      wire(r1, 1, gnd, 0),
      wire(op, 0, r2, 0),
      wire(r2, 1, op, 1)
    ];
    connectDualRails(op, gnd, 12, -12, components, wires);
    const { voltage } = runDC({ components, wires });
    const gain = 1 + r2.props.R / r1.props.R; // 6x
    expect(voltage(op, 0)).toBeCloseTo(gain * 0.6, 3);
  });

  it('computes a difference amplifier output', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const v1 = makeVoltageSource(0.5);
    const v2 = makeVoltageSource(2.0);
    const r1 = makeResistor(10e3);
    const r2 = makeResistor(10e3);
    const r3 = makeResistor(10e3);
    const r4 = makeResistor(10e3);
    const components = [gnd, op, v1, v2, r1, r2, r3, r4];
    const wires = [
      wire(v1, 1, gnd, 0), wire(v2, 1, gnd, 0),
      wire(v1, 0, r1, 0),
      wire(r1, 1, op, 1),
      wire(op, 0, r2, 0),
      wire(r2, 1, op, 1),
      wire(v2, 0, r3, 0),
      wire(r3, 1, op, 2),
      wire(op, 2, r4, 0),
      wire(r4, 1, gnd, 0)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);
    const { voltage } = runDC({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(v2.props.Vdc - v1.props.Vdc, 3);
  });

  it('saturates at the rails when overdriven', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(2);
    const rin = makeResistor(1e3);
    const rf = makeResistor(20e3);
    const components = [gnd, op, vin, rin, rf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, rin, 0),
      wire(rin, 1, op, 1),
      wire(op, 2, gnd, 0),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 5, -5, components, wires);
    const { voltage } = runDC({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-4.9, 1);
  });
});

describe('Dynamic op-amp behaviours', () => {
  it('integrates a steady input', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.5);
    const rin = makeResistor(10e3);
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
    connectDualRails(op, gnd, 12, -12, components, wires);

    const dt = 1e-4;
    const duration = 0.002;
    let finalOut = 0;
    runTransient({ components, wires }, {
      duration,
      dt,
      sampleInterval: duration,
      measure: ({ sim }) => { finalOut = sim.voltage(op, 0); }
    });
    const slope = -(vin.props.Vdc) / (10e3 * 1e-6); // -50 V/s
    expect(finalOut).toBeCloseTo(slope * duration, 1);
  });

  it('acts as an AC summing amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const v1 = makeVoltageSource(0.25);
    const v2 = makeVoltageSource(0.1);
    const r1 = makeResistor(5e3);
    const r2 = makeResistor(10e3);
    const rf = makeResistor(10e3);
    const components = [gnd, op, v1, v2, r1, r2, rf];
    const wires = [
      wire(v1, 1, gnd, 0), wire(v2, 1, gnd, 0),
      wire(v1, 0, r1, 0), wire(r1, 1, op, 1),
      wire(v2, 0, r2, 0), wire(r2, 1, op, 1),
      wire(op, 0, rf, 0), wire(rf, 1, op, 1),
      wire(op, 2, gnd, 0)
    ];
    connectDualRails(op, gnd, 12, -12, components, wires);
    const { voltage } = runDC({ components, wires });
    const expected = -(rf.props.R / r1.props.R) * 0.25 - (rf.props.R / r2.props.R) * 0.1;
    expect(voltage(op, 0)).toBeCloseTo(expected, 3);
  });
});
