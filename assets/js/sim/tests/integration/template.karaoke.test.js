import { describe, it, expect } from 'vitest';
import {
  importCircuit,
  runTransient,
  peakToPeak,
  singleToneAmplitude,
  resetIdRegistry
} from '../testHarness';
import { loadTemplate } from '../../../circuit-lab/templateRegistry.js';

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

function measureOutput(circuit, position = 'B') {
  const sw = circuit.components.find((c) => c.kind === 'switch');
  if (sw) sw.props.Position = position;
  const op = circuit.components.find((c) => c.kind === 'lf412');
  const samples = [];
  runTransient(circuit, {
    duration: 0.02,
    dt: 4e-6,
    sampleInterval: 4e-5,
    measure: ({ t, sim }) => {
      if (t > 0.004) samples.push({ t, v: sim.voltage(op, 0) });
    }
  });
  const p2p = peakToPeak(samples.map((s) => s.v));
  const tone880 = singleToneAmplitude(samples, 880);
  return { p2p, tone880 };
}

describe('Mixer Karaoke template', () => {
  it('loads and mixes signals without singularities', () => {
    const circuit = loadMixerKaraoke();
    const sum = measureOutput(circuit, 'A');
    const diff = measureOutput(circuit, 'B');
    expect(Number.isFinite(sum.p2p)).toBe(true);
    expect(Number.isFinite(diff.p2p)).toBe(true);
    expect(diff.p2p).toBeLessThan(sum.p2p * 0.8);
    expect(diff.tone880).toBeLessThan(sum.tone880 * 0.5);
  });
});
