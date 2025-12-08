import { describe, it, expect } from 'vitest';
import {
  importCircuit,
  runTransient,
  peakToPeak,
  toneProjection,
  resetIdRegistry
} from '../testHarness';
import { loadTemplate } from '../../../circuit-lab/templateRegistry.js';

const FREQUENCIES = { low: 110, high: 3520 };

function loadBaxandall() {
  const data = loadTemplate('baxandall-tone');
  if (!data) throw new Error('Baxandall template not found');
  resetIdRegistry();
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
  return importCircuit(normalized, { resetIds: false });
}

function measureCircuit({ treble = 50, bass = 50 } = {}) {
  const circuit = loadBaxandall();
  const potBass = circuit.components.find((c) => c.id === 'POT1');
  const potTreble = circuit.components.find((c) => c.id === 'POT2');
  if (potBass) potBass.props.Turn = String(bass);
  if (potTreble) potTreble.props.Turn = String(treble);
  const op = circuit.components.find((c) => c.kind === 'lf412');
  const samples = [];
  runTransient(circuit, {
    duration: 0.03,
    dt: 5e-6,
    sampleInterval: 5e-5,
    measure: ({ t, sim }) => {
      if (t >= 0.01) samples.push({ t, v: sim.voltage(op, 6) });
    }
  });
  const values = samples.map((s) => s.v);
  return {
    p2p: peakToPeak(values),
    tones: {
      low: toneProjection(samples, FREQUENCIES.low),
      high: toneProjection(samples, FREQUENCIES.high)
    }
  };
}

describe('Baxandall Tone Control template', () => {
  it('boosts/cuts lows and highs via the two pots without losing signal', { timeout: 20000 }, () => {
    const flat = measureCircuit({ treble: 50, bass: 50 });
    const trebleHigh = measureCircuit({ treble: 95, bass: 50 });
    const trebleLow = measureCircuit({ treble: 5, bass: 50 });
    const bassHigh = measureCircuit({ treble: 50, bass: 95 });
    const bassLow = measureCircuit({ treble: 50, bass: 5 });

    expect(flat.p2p).toBeGreaterThan(0.05);
    expect(flat.p2p).toBeLessThan(5);

    const highMax = Math.max(trebleHigh.tones.high.amplitude, trebleLow.tones.high.amplitude);
    const highMin = Math.min(trebleHigh.tones.high.amplitude, trebleLow.tones.high.amplitude);
    expect(highMax).toBeGreaterThan(highMin * 1.5);
    expect(highMax).toBeGreaterThan(flat.tones.high.amplitude * 0.8);
    expect(highMin).toBeLessThan(flat.tones.high.amplitude * 1.2);

    const lowMax = Math.max(bassHigh.tones.low.amplitude, bassLow.tones.low.amplitude);
    const lowMin = Math.min(bassHigh.tones.low.amplitude, bassLow.tones.low.amplitude);
    expect(lowMax).toBeGreaterThan(lowMin * 1.5);
    expect(lowMax).toBeGreaterThan(flat.tones.low.amplitude * 0.8);
    expect(lowMin).toBeLessThan(flat.tones.low.amplitude * 1.2);

    // Controls do not wipe out the opposite band.
    expect(trebleHigh.tones.low.amplitude).toBeGreaterThan(0.05);
    expect(bassHigh.tones.high.amplitude).toBeGreaterThan(0.05);
  });
});
