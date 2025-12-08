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
  makeSwitch,
  makeOscilloscope,
  runTransient,
  runDC,
  wire,
  resistorCurrent,
  peakToPeak,
  toneProjection
} from '../testHarness';

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

  it('switches an op-amp between summing and difference modes to cancel common tones', () => {
    const freqsA = [110, 880];
    const freqsB = [3520, 880];
    const buildChannel = (f1, f2) => {
      const fg1 = makeFunctionGenerator({ Vpp: '0.5', Freq: String(f1), Offset: '0' });
      const fg2 = makeFunctionGenerator({ Vpp: '0.5', Freq: String(f2), Offset: '0' });
      return { fg1, fg2 };
    };

    const buildCircuitFor = (position) => {
      const circuit = buildCircuit();
      const gnd = makeGround();
      const op = makeOpAmp();
      const spdt = makeSwitch('SPDT', position);
      const R = 7.5e3;
      const ra = makeResistor(R);
      const rbInv = makeResistor(R);
      const rNon = makeResistor(R);
      const rBias = makeResistor(R);
      const rf = makeResistor(R);
      const load = makeResistor(10e3);
      const railsPos = makeVoltageSource(15);
      const railsNeg = makeVoltageSource(-15);
      const chanA = buildChannel(freqsA[0], freqsA[1]);
      const chanB = buildChannel(freqsB[0], freqsB[1]);

      circuit.add(
        gnd, op, spdt, ra, rbInv, rNon, rBias, rf, load,
        railsPos, railsNeg,
        chanA.fg1, chanA.fg2, chanB.fg1, chanB.fg2
      );

      // Rails
      circuit.connect(railsPos, 0, op, 7); circuit.connect(railsPos, 1, gnd, 0);
      circuit.connect(railsNeg, 0, op, 3); circuit.connect(railsNeg, 1, gnd, 0);

      // Feedback and bias
      circuit.connect(op, 0, rf, 0); circuit.connect(rf, 1, op, 1);
      circuit.connect(op, 2, rBias, 0); circuit.connect(rBias, 1, gnd, 0);
      circuit.connect(op, 0, load, 0); circuit.connect(load, 1, gnd, 0);

      // Channel A into inverting node
      circuit.connect(chanA.fg1, 0, ra, 0);
      circuit.connect(ra, 1, op, 1);
      circuit.connect(chanA.fg1, 1, chanA.fg2, 0);
      circuit.connect(chanA.fg2, 1, gnd, 0);

      // Channel B series stack into SPDT common
      circuit.connect(chanB.fg1, 0, spdt, 0);
      circuit.connect(chanB.fg1, 1, chanB.fg2, 0);
      circuit.connect(chanB.fg2, 1, gnd, 0);

      // SPDT throw A -> inverting resistor, throw B -> non-inverting resistor
      circuit.connect(spdt, 1, rbInv, 0); circuit.connect(rbInv, 1, op, 1);
      circuit.connect(spdt, 2, rNon, 0); circuit.connect(rNon, 1, op, 2);

      return { circuit, op, ra, spdt };
    };

    const collect = (pos) => {
      const { circuit, op, ra, spdt } = buildCircuitFor(pos);
      const samples = [];
      const leftSamples = [];
      const rightSamples = [];
      runTransient(circuit, {
        duration: 0.05,
        dt: 2e-6,
        sampleInterval: 2e-5,
        measure: ({ t, sim }) => {
          if (t >= 0.01) {
            samples.push({ t, v: sim.voltage(op, 0) });
            leftSamples.push({ t, v: sim.voltage(ra, 0) });
            rightSamples.push({ t, v: sim.voltage(spdt, 0) });
          }
        }
      });
      return { samples, leftSamples, rightSamples };
    };

    const analyze = ({ samples, leftSamples, rightSamples }) => {
      const values = samples.map((s) => s.v);
      const toneSet = (series) => ({
        110: toneProjection(series, 110),
        880: toneProjection(series, 880),
        3520: toneProjection(series, 3520)
      });
      const absMax = values.length ? Math.max(...values.map((v) => Math.abs(v))) : 0;
      return {
        p2p: peakToPeak(values),
        absMax,
        tones: toneSet(samples),
        inputs: {
          left: toneSet(leftSamples),
          right: toneSet(rightSamples)
        }
      };
    };

    const sum = analyze(collect('A'));
    const diff = analyze(collect('B'));

    expect(sum.p2p).toBeGreaterThan(0.6);
    expect(sum.absMax).toBeLessThan(5);
    expect(diff.p2p).toBeGreaterThan(0.3);
    expect(diff.absMax).toBeLessThan(5);
    expect(sum.inputs.left[110].amplitude).toBeGreaterThan(0.23);
    expect(sum.inputs.left[110].amplitude).toBeLessThan(0.27);
    expect(sum.inputs.left[880].amplitude).toBeGreaterThan(0.23);
    expect(sum.inputs.left[880].amplitude).toBeLessThan(0.27);
    expect(sum.inputs.right[3520].amplitude).toBeGreaterThan(0.23);
    expect(sum.inputs.right[3520].amplitude).toBeLessThan(0.27);
    expect(sum.inputs.right[880].amplitude).toBeGreaterThan(0.23);
    expect(sum.inputs.right[880].amplitude).toBeLessThan(0.27);
    expect(sum.inputs.left[3520].amplitude).toBeLessThan(0.02);
    expect(sum.inputs.right[110].amplitude).toBeLessThan(0.02);

    expect(sum.tones[880].amplitude).toBeGreaterThan(0.45);
    expect(sum.tones[880].amplitude).toBeLessThan(0.55);
    expect(sum.tones[880].sin).toBeLessThan(0);
    expect(diff.tones[880].amplitude).toBeLessThan(sum.tones[880].amplitude * 0.1);
    expect(diff.tones[880].amplitude).toBeLessThan(0.05);

    expect(sum.tones[110].amplitude).toBeGreaterThan(0.2);
    expect(sum.tones[110].amplitude).toBeLessThan(0.3);
    expect(sum.tones[110].sin).toBeLessThan(0);
    expect(diff.tones[110].amplitude).toBeGreaterThan(0.2);
    expect(diff.tones[110].amplitude).toBeLessThan(0.3);
    expect(diff.tones[110].sin).toBeLessThan(0);

    expect(sum.tones[3520].amplitude).toBeGreaterThan(0.2);
    expect(sum.tones[3520].amplitude).toBeLessThan(0.3);
    expect(sum.tones[3520].sin).toBeLessThan(0);
    expect(diff.tones[3520].amplitude).toBeGreaterThan(0.2);
    expect(diff.tones[3520].amplitude).toBeLessThan(0.3);
    expect(diff.tones[3520].sin).toBeGreaterThan(0);
  });
});
