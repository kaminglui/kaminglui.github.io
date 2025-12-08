// RC transient and AC filter behaviour validated against exponential charging
// curves and standard first-order transfer functions; measurements use sampled
// voltages, not solver internals.
import { describe, it, expect, test } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  makeFunctionGenerator,
  runTransient
} from '../testHarness';

function amplitude(arr) {
  return (Math.max(...arr) - Math.min(...arr)) / 2;
}

describe('RC step responses', () => {
  it('charges toward the source with the expected exponential', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const c = makeCapacitor(1e-6); // RC = 1 ms
    circuit.add(gnd, src, r, c);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, c, 0);
    circuit.connect(c, 1, gnd, 0);

    const targets = [0.0005, 0.001, 0.002, 0.005];
    const readings = [];
    runTransient(circuit, {
      duration: Math.max(...targets),
      dt: 5e-6,
      sampleInterval: 5e-6,
      measure: ({ t, sim }) => readings.push({ t, v: sim.voltage(c, 0) })
    });

    const samples = targets.map((target) => {
      let best = readings[0];
      readings.forEach((s) => {
        if (Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
      });
      return best?.v;
    });

    const RC = 1e-3;
    targets.forEach((t, idx) => {
      const expected = 5 * (1 - Math.exp(-t / RC));
      expect(samples[idx]).toBeCloseTo(expected, 1);
    });
  });

  it('discharges from an initial voltage', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const r = makeResistor(2e3);
    const c = makeCapacitor(2e-6); // RC = 4 ms
    c._lastV = 4;
    circuit.add(gnd, r, c);
    circuit.connect(r, 0, c, 0);
    circuit.connect(c, 1, gnd, 0);
    circuit.connect(r, 1, gnd, 0);

    const targets = [0.002, 0.004, 0.008];
    const readings = [];
    runTransient(circuit, {
      duration: Math.max(...targets),
      dt: 1e-5,
      sampleInterval: 1e-5,
      measure: ({ t, sim }) => readings.push({ t, v: sim.voltage(c, 0) })
    });

    const samples = targets.map((target) => {
      let best = readings[0];
      readings.forEach((s) => {
        if (Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
      });
      return best?.v;
    });

    const RC = 4e-3;
    targets.forEach((t, idx) => {
      const expected = 4 * Math.exp(-t / RC);
      expect(samples[idx]).toBeCloseTo(expected, 1);
    });
  });
});

describe('RC filters in the time domain', () => {
  const fc = 1 / (2 * Math.PI * 1e3 * 1e-6); // ~159 Hz

  test.each([10, 100, 1000, 10000])('low-pass gain at %d Hz', (freq) => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: String(freq) });
    const r = makeResistor(1e3);
    const c = makeCapacitor(1e-6);
    circuit.add(gnd, fg, r, c);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, r, 0);
    circuit.connect(r, 1, c, 0);
    circuit.connect(c, 1, gnd, 0);

    const period = 1 / freq;
    const dt = period / 200;
    const duration = period * 6;
    const settle = period * 2;
    const vin = [];
    const vout = [];

    runTransient(circuit, {
      duration,
      dt,
      sampleInterval: dt,
      measure: ({ t, sim }) => {
        if (t >= settle) {
          vin.push(sim.voltage(r, 0));
          vout.push(sim.voltage(r, 1));
        }
      }
    });

    const gainMeasured = amplitude(vout) / amplitude(vin || [1]);
    const gainExpected = 1 / Math.sqrt(1 + (freq / fc) ** 2);
    expect(gainMeasured).toBeCloseTo(gainExpected, 1);
  });

  test.each([10, 100, 1000, 10000])('high-pass gain at %d Hz', (freq) => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: String(freq) });
    const c = makeCapacitor(1e-6);
    const r = makeResistor(1e3);
    circuit.add(gnd, fg, c, r);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, c, 0);
    circuit.connect(c, 1, r, 0);
    circuit.connect(r, 1, gnd, 0);

    const period = 1 / freq;
    const dt = period / 200;
    const duration = period * 6;
    const settle = period * 2;
    const vin = [];
    const vout = [];

    runTransient(circuit, {
      duration,
      dt,
      sampleInterval: dt,
      measure: ({ t, sim }) => {
        if (t >= settle) {
          vin.push(sim.voltage(c, 0));
          vout.push(sim.voltage(r, 0));
        }
      }
    });

    const gainMeasured = amplitude(vout) / amplitude(vin || [1]);
    const gainExpected = (freq / fc) / Math.sqrt(1 + (freq / fc) ** 2);
    expect(gainMeasured).toBeCloseTo(gainExpected, 1);
  });

  it('passes AC and blocks DC with a coupling capacitor', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '1', Offset: '1', Freq: '200' });
    const c = makeCapacitor(4.7e-6);
    const r = makeResistor(10e3);
    circuit.add(gnd, fg, c, r);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, c, 0);
    circuit.connect(c, 1, r, 0);
    circuit.connect(r, 1, gnd, 0);

    const period = 1 / 200;
    const dt = period / 200;
    const duration = period * 6;
    const settle = period * 3;
    const samples = [];

    runTransient(circuit, {
      duration,
      dt,
      sampleInterval: dt,
      measure: ({ t, sim }) => {
        if (t >= settle) samples.push(sim.voltage(r, 0));
      }
    });

    const dcComponent = samples.reduce((acc, v) => acc + v, 0) / samples.length;
    const peak = Math.max(...samples.map((v) => Math.abs(v - dcComponent)));
    const expectedPeak = 0.58; // 1 Vpp input -> ~0.58 V amplitude after AC coupling with ref resistors
    expect(Math.abs(dcComponent)).toBeLessThan(0.7);
    expect(peak).toBeCloseTo(expectedPeak, 1);
  });
});
