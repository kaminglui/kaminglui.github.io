import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeFunctionGenerator,
  makeResistor,
  makeCapacitor,
  makeOpAmp,
  makeMosfet,
  makeOscilloscope,
  runTransient,
  runDC,
  wire,
  resistorCurrent
} from './testHarness';

function measureAmplitude(trace) {
  if (!trace.length) return 0;
  const max = Math.max(...trace);
  const min = Math.min(...trace);
  return (max - min) / 2;
}

describe('Integrated behaviour', () => {
  it('filters then buffers a sine chain', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: '1000' });
    const r = makeResistor(1e3);
    const c = makeCapacitor(1e-6);
    const op = makeOpAmp();
    const load = makeResistor(10e3);
    const vpos = makeVoltageSource(12);
    const vneg = makeVoltageSource(-12);
    circuit.add(gnd, fg, r, c, op, load, vpos, vneg);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, r, 0);
    circuit.connect(r, 1, c, 0);
    circuit.connect(c, 1, gnd, 0);
    // Voltage follower on the RC node
    circuit.connect(r, 1, op, 2);
    circuit.connect(op, 1, op, 0);
    circuit.connect(op, 0, load, 0);
    circuit.connect(load, 1, gnd, 0);
    circuit.connect(vpos, 0, op, 7);
    circuit.connect(vpos, 1, gnd, 0);
    circuit.connect(vneg, 0, op, 3);
    circuit.connect(vneg, 1, gnd, 0);

    const period = 1 / 1000;
    const dt = period / 200;
    const duration = period * 6;
    const settle = period * 3;
    const out = [];
    const tap = [];
    const vinSamples = [];
    runTransient(circuit, {
      duration,
      dt,
      sampleInterval: dt,
      measure: ({ t, sim }) => {
        if (t >= settle) {
          vinSamples.push(sim.voltage(r, 0));
          tap.push(sim.voltage(r, 1));
          out.push(sim.voltage(op, 0));
        }
      }
    });
    const gainMeasured = measureAmplitude(tap) / measureAmplitude([...(vinSamples.length ? vinSamples : [1])]);
    const fc = 1 / (2 * Math.PI * 1e3 * 1e-6);
    const gainExpected = 1 / Math.sqrt(1 + (1000 / fc) ** 2);
    expect(gainMeasured).toBeCloseTo(gainExpected, 1);
  });

  it('lets an op-amp comparator drive a MOSFET load stage', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vref = makeVoltageSource(1.5);
    const vin = makeVoltageSource(3);
    const nmos = makeMosfet('NMOS', { W: '10u', Kp: '1m' });
    const r = makeResistor(330);
    const railsPos = makeVoltageSource(5);
    const components = [gnd, op, vref, vin, nmos, r, railsPos];
    const wires = [
      wire(railsPos, 1, gnd, 0),
      wire(railsPos, 0, op, 7),
      wire(gnd, 0, op, 3),
      wire(vref, 1, gnd, 0), wire(vin, 1, gnd, 0),
      wire(vref, 0, op, 1),
      wire(vin, 0, op, 2),
      wire(op, 0, nmos, 0),
      wire(nmos, 2, gnd, 0),
      wire(nmos, 3, nmos, 2),
      wire(railsPos, 0, r, 0),
      wire(r, 1, nmos, 1)
    ];

    const measure = (vinLevel) => {
      vin.props.Vdc = String(vinLevel);
      let current = 0;
      runTransient({ components, wires }, {
        duration: 2e-3,
        dt: 1e-5,
        sampleInterval: 2e-4,
        measure: ({ sim }) => { current = resistorCurrent(r, sim.voltage); }
      });
      return current;
    };

    const on = measure(3);
    const off = measure(0.5);
    expect(Number.isFinite(on)).toBe(true);
    expect(Number.isFinite(off)).toBe(true);
    expect(Math.abs(on - off)).toBeGreaterThan(1e-6);
  });

  it('drives a CMOS inverter from a function generator without upsetting probes', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '5', Offset: '2.5', Freq: '500', Wave: 'square' });
    const vdd = makeVoltageSource(5);
    const pmos = makeMosfet('PMOS', { W: '8u', Kp: '2m' });
    const nmos = makeMosfet('NMOS', { W: '8u', Kp: '2m' });
    const scope = makeOscilloscope();
    circuit.add(gnd, fg, vdd, pmos, nmos, scope);
    circuit.connect(vdd, 1, gnd, 0);
    circuit.connect(vdd, 0, pmos, 2);
    circuit.connect(pmos, 3, pmos, 2);
    circuit.connect(nmos, 3, nmos, 2);
    circuit.connect(nmos, 2, gnd, 0);
    circuit.connect(pmos, 1, nmos, 1);
    circuit.connect(scope, 0, pmos, 1);
    circuit.connect(scope, 2, gnd, 0);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, pmos, 0);
    circuit.connect(fg, 0, nmos, 0);

    const period = 1 / 500;
    const dt = period / 100;
    const duration = period * 4;
    const out = [];
    runTransient(circuit, {
      duration,
      dt,
      sampleInterval: dt,
      measure: ({ sim }) => out.push(sim.voltage(pmos, 1))
    });
    const max = Math.max(...out);
    const min = Math.min(...out);
    expect(Number.isFinite(max)).toBe(true);
    expect(Number.isFinite(min)).toBe(true);
    expect(max - min).toBeGreaterThan(1);
  });
});
