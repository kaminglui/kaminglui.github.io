import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  wire,
  simulateCircuit
} from '../helpers';

describe('RC transient response', () => {
  it('charges a capacitor with the expected exponential', () => {
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const c = makeCapacitor(1e-6); // RC = 1 ms
    const wires = [
      wire(src, 1, gnd, 0),
      wire(src, 0, r, 0),
      wire(r, 1, c, 0),
      wire(c, 1, gnd, 0)
    ];

    const targets = [0.0005, 0.001, 0.002, 0.005];
    const samples = new Map(targets.map((t) => [t, null]));
    let t = 0;
    const dt = 5e-6;
    const comps = [gnd, src, r, c];
    const maxT = Math.max(...targets);

    while (t <= maxT + dt / 2) {
      const { voltage } = simulateCircuit({ components: comps, wires, time: t, dt });
      const vCap = voltage(c, 0);
      targets.forEach((target) => {
        if (samples.get(target) === null && t >= target - 1e-12) {
          samples.set(target, vCap);
        }
      });
      t += dt;
    }

    const RC = 1e-3;
    samples.forEach((val, time) => {
      const expected = 5 * (1 - Math.exp(-time / RC));
      expect(val).toBeCloseTo(expected, 1);
    });
  });

  it('discharges a capacitor from an initial voltage', () => {
    const gnd = makeGround();
    const r = makeResistor(1e3);
    const c = makeCapacitor(1e-6);
    c._lastV = 5;
    const wires = [
      wire(r, 0, c, 0),
      wire(c, 1, gnd, 0),
      wire(r, 1, gnd, 0)
    ];

    const targets = [0.0005, 0.001, 0.002, 0.003];
    const samples = new Map(targets.map((t) => [t, null]));
    let t = 0;
    const dt = 5e-6;
    const comps = [gnd, r, c];
    const maxT = Math.max(...targets);

    while (t <= maxT + dt / 2) {
      const { voltage } = simulateCircuit({ components: comps, wires, time: t, dt });
      const vCap = voltage(c, 0);
      targets.forEach((target) => {
        if (samples.get(target) === null && t >= target - 1e-12) {
          samples.set(target, vCap);
        }
      });
      t += dt;
    }

    const RC = 1e-3;
    samples.forEach((val, time) => {
      const expected = 5 * Math.exp(-time / RC);
      expect(val).toBeCloseTo(expected, 1);
    });
  });
});
