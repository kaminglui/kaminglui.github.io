import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeFunctionGenerator,
  makeResistor,
  runTransient,
  sineAt,
  triangleAt,
  FUNCGEN_REF_RES,
  FUNCGEN_SERIES_RES
} from '../testHarness';

function measureWaveform({ circuit, node, times, dt }) {
  const samples = [];
  runTransient(circuit, {
    duration: Math.max(...times) + dt,
    dt,
    sampleInterval: dt,
    measure: ({ t, sim }) => { samples.push({ t, v: sim.voltage(node.c, node.p) }); }
  });
  return times.map((target) => {
    let best = samples[0];
    samples.forEach((s) => {
      if (!best || Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
    });
    return best?.v;
  });
}

describe('Function generator output', () => {
  it('delivers the configured sine with COM floating', () => {
    const circuit = buildCircuit();
    const fg = makeFunctionGenerator({ Vpp: '6', Offset: '1', Freq: '50', Phase: '30' });
    const load = makeResistor(1e3);
    const gnd = makeGround();
    circuit.add(fg, load, gnd);
    circuit.connect(fg, 0, load, 0); // + to load
    circuit.connect(load, 1, gnd, 0); // only the load side is grounded

    const times = [0, 0.0025, 0.005, 0.0075, 0.01];
    const values = measureWaveform({ circuit, node: { c: load, p: 0 }, times, dt: 1e-4 });
    const attenuation = 1e3 / (1e3 + FUNCGEN_SERIES_RES);
    times.forEach((t, idx) => {
      const expected = sineAt(6, 50, t, 1, 30) * attenuation;
      expect(values[idx]).toBeCloseTo(expected, 1);
    });
  });

  it('honors phase and offset simultaneously', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '4', Offset: '2', Freq: '120', Phase: '90' });
    const load = makeResistor(2e3);
    circuit.add(gnd, fg, load);
    circuit.connect(fg, 1, gnd, 0);
    circuit.connect(fg, 0, load, 0);
    circuit.connect(load, 1, gnd, 0);

    const times = [0, 1 / 480, 1 / 240]; // 0, quarter period, half period
    const values = measureWaveform({ circuit, node: { c: load, p: 0 }, times, dt: 5e-5 });
    const attenuation = 2e3 / (2e3 + FUNCGEN_SERIES_RES);
    times.forEach((t, idx) => {
      const expected = sineAt(4, 120, t, 2, 90) * attenuation;
      expect(values[idx]).toBeCloseTo(expected, 1);
    });
  });

  it('sums multiple sources at one node', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg1 = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: '40', Wave: 'sine' });
    const fg2 = makeFunctionGenerator({ Vpp: '1', Offset: '0.5', Freq: '80', Wave: 'triangle' });
    const fg3 = makeFunctionGenerator({ Vpp: '0', Offset: '1.2', Freq: '0', Wave: 'sine' });
    const load = makeResistor(1e3);
    circuit.add(gnd, fg1, fg2, fg3, load);
    circuit.connect(fg1, 1, gnd, 0);
    circuit.connect(fg2, 1, gnd, 0);
    circuit.connect(fg3, 1, gnd, 0);
    circuit.connect(fg1, 0, load, 0);
    circuit.connect(fg2, 0, load, 0);
    circuit.connect(fg3, 0, load, 0);
    circuit.connect(load, 1, gnd, 0);

    const times = [0, 0.0025, 0.005, 0.0075];
    const values = measureWaveform({ circuit, node: { c: load, p: 0 }, times, dt: 1e-4 });
    times.forEach((t, idx) => {
      const v1 = sineAt(2, 40, t, 0);
      const v2 = triangleAt(1, 80, t, 0.5);
      const v3 = 1.2;
      const numerator = v1 / FUNCGEN_SERIES_RES + v2 / FUNCGEN_SERIES_RES + v3 / FUNCGEN_SERIES_RES;
      const totalG = 3 / FUNCGEN_SERIES_RES + 1 / 1e3;
      const expected = numerator / totalG;
      expect(values[idx]).toBeCloseTo(expected, 2);
    });
  });

  it('adds sources when wired in series', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fgA = makeFunctionGenerator({ Vpp: '2', Offset: '0', Freq: '20', Wave: 'sine' });
    const fgB = makeFunctionGenerator({ Vpp: '2', Offset: '1', Freq: '0', Wave: 'sine' }); // DC offset
    const load = makeResistor(500);
    circuit.add(gnd, fgA, fgB, load);
    circuit.connect(fgA, 0, load, 0);     // fgA + -> load
    circuit.connect(fgA, 1, fgB, 0);      // fgA COM -> fgB +
    circuit.connect(fgB, 1, gnd, 0);      // fgB COM to ground
    circuit.connect(load, 1, gnd, 0);

    const times = [0, 0.01, 0.02];
    const values = measureWaveform({ circuit, node: { c: load, p: 0 }, times, dt: 1e-4 });
    const seriesR = FUNCGEN_SERIES_RES * 2;
    times.forEach((t, idx) => {
      const expected = (sineAt(2, 20, t, 0) + sineAt(2, 0, t, 1)) * (500 / (500 + seriesR));
      expect(values[idx]).toBeCloseTo(expected, 1);
    });
  });
});
