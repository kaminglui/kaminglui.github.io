// Validates the karaoke mixer template by projecting outputs onto known tone
// frequencies and comparing summed vs differential behaviour derived from op-amp
// summing/difference equations (no simulator internals are used as oracles).
import { describe, it, expect } from 'vitest';
import {
  importCircuit,
  runTransient,
  peakToPeak,
  toneProjection,
  resetIdRegistry
} from '../testHarness';
import { loadTemplate } from '../../../circuit-lab/templateRegistry.js';

const FREQUENCIES = [110, 880, 3520];

function loadMixerKaraoke() {
  const data = loadTemplate('mixer-karaoke');
  if (!data) throw new Error('Karaoke template not found');
  const normalized = {
    components: (data.components || []).map((c) => ({
      id: c.id,
      kind: (c.type || c.kind || '').toLowerCase(),
      props: c.props || {}
    })),
    wires: (data.wires || []).map((w) => ({
      from: { id: w.from?.id, p: w.from?.p ?? w.from?.pin ?? 0 },
      to: { id: w.to?.id, p: w.to?.p ?? w.to?.pin ?? 0 }
    }))
  };
  resetIdRegistry();
  return importCircuit(normalized, { resetIds: false });
}

function analyzeOutput(position = 'B') {
  const circuit = loadMixerKaraoke();
  const sw = circuit.components.find((c) => c.kind === 'switch');
  if (sw) sw.props.Position = position;
  const op = circuit.components.find((c) => c.kind === 'lf412');
  const rLeft = circuit.components.find((c) => c.id === 'r2');
  const rRight = circuit.components.find((c) => c.id === 'r3');
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
        if (rLeft) leftSamples.push({ t, v: sim.voltage(rLeft, 0) });
        if (rRight) rightSamples.push({ t, v: sim.voltage(rRight, 0) });
      }
    }
  });
  const values = samples.map((s) => s.v);
  const absMax = values.length ? Math.max(...values.map((v) => Math.abs(v))) : 0;
  const analyzeTones = (series) => {
    const tones = {};
    FREQUENCIES.forEach((f) => { tones[f] = toneProjection(series, f); });
    return tones;
  };
  const tones = analyzeTones(samples);
  const inputs = {
    left: analyzeTones(leftSamples),
    right: analyzeTones(rightSamples)
  };
  return {
    p2p: peakToPeak(values),
    absMax,
    tones,
    inputs
  };
}

describe('Mixer Karaoke template', () => {
  it('sums both channels on throw A and cancels the shared tone on throw B', { timeout: 20000 }, () => {
    const sum = analyzeOutput('A');
    const diff = analyzeOutput('B');

    const sumTones = sum.tones;
    const diffTones = diff.tones;
    const sumInputs = sum.inputs;
    const diffInputs = diff.inputs;

    // Summing mode: all tones present and inverted, healthy amplitude well below the rails.
    expect(sum.p2p).toBeGreaterThan(1.2);
    expect(sum.absMax).toBeLessThan(5);
    expect(sumInputs.left[110].amplitude).toBeGreaterThan(0.23);
    expect(sumInputs.left[110].amplitude).toBeLessThan(0.27);
    expect(sumInputs.left[880].amplitude).toBeGreaterThan(0.23);
    expect(sumInputs.left[880].amplitude).toBeLessThan(0.27);
    expect(sumInputs.right[3520].amplitude).toBeGreaterThan(0.23);
    expect(sumInputs.right[3520].amplitude).toBeLessThan(0.27);
    expect(sumInputs.right[880].amplitude).toBeGreaterThan(0.23);
    expect(sumInputs.right[880].amplitude).toBeLessThan(0.27);
    expect(sumInputs.left[3520].amplitude).toBeLessThan(0.02);
    expect(sumInputs.right[110].amplitude).toBeLessThan(0.02);
    expect(sumTones[110].amplitude).toBeGreaterThan(0.2);
    expect(sumTones[110].amplitude).toBeLessThan(0.3);
    expect(sumTones[110].sin).toBeLessThan(0);
    expect(sumTones[880].amplitude).toBeGreaterThan(0.45);
    expect(sumTones[880].amplitude).toBeLessThan(0.55);
    expect(sumTones[880].sin).toBeLessThan(0);
    expect(sumTones[3520].amplitude).toBeGreaterThan(0.2);
    expect(sumTones[3520].amplitude).toBeLessThan(0.3);
    expect(sumTones[3520].sin).toBeLessThan(0);

    // Difference mode: common 880 Hz tone is heavily rejected, other tones survive with the right polarity.
    expect(diff.p2p).toBeGreaterThan(0.3);
    expect(diff.absMax).toBeLessThan(5);
    expect(diffTones[880].amplitude).toBeLessThan(sumTones[880].amplitude * 0.1);
    expect(diffTones[880].amplitude).toBeLessThan(0.05);
    expect(diffTones[110].amplitude).toBeGreaterThan(0.2);
    expect(diffTones[110].amplitude).toBeLessThan(0.3);
    expect(diffTones[110].sin).toBeLessThan(0);
    expect(diffTones[3520].amplitude).toBeGreaterThan(0.2);
    expect(diffTones[3520].amplitude).toBeLessThan(0.3);
    expect(diffTones[3520].sin).toBeGreaterThan(0);

    // Switching the SPDT should not distort the channel inputs.
    expect(diffInputs.left[880].amplitude).toBeGreaterThan(0.23);
    expect(diffInputs.right[880].amplitude).toBeGreaterThan(0.23);
  });
});
