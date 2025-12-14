import { describe, expect, it } from 'vitest';
import { computeEnergyMetrics } from '../metrics';
import { FourierTerm, Point } from '../../types';

const makeUnitCircle = (samples: number): Point[] =>
  Array.from({ length: samples }).map((_, n) => ({
    x: Math.cos((2 * Math.PI * n) / samples),
    y: Math.sin((2 * Math.PI * n) / samples)
  }));

describe('computeEnergyMetrics', () => {
  it('returns zeros for empty inputs', () => {
    const metrics = computeEnergyMetrics([], [], 0);
    expect(metrics.energyPct).toBe(0);
    expect(metrics.rmsError).toBe(0);
    expect(metrics.topTerms).toEqual([]);
    expect(metrics.breakdown).toEqual([]);
  });

  it('captures full energy when using all terms', () => {
    const points = makeUnitCircle(8);
    const terms: FourierTerm[] = [
      { re: 1, im: 0, freq: 1, amp: 1, phase: 0 },
      { re: 0, im: 0, freq: 0, amp: 0, phase: 0 }
    ];
    const metrics = computeEnergyMetrics(terms, points, terms.length, 32);
    expect(metrics.energyPct).toBeCloseTo(100);
    expect(metrics.rmsError).toBeLessThan(0.5);
    expect(metrics.breakdown.length).toBe(terms.length);
  });

  it('reports decreasing energy when truncating terms', () => {
    const points = makeUnitCircle(16);
    const terms: FourierTerm[] = [
      { re: 1, im: 0, freq: 1, amp: 1, phase: 0 },
      { re: 0.5, im: 0, freq: 2, amp: 0.5, phase: 0 }
    ];
    const full = computeEnergyMetrics(terms, points, 2, 32);
    const partial = computeEnergyMetrics(terms, points, 1, 32);
    expect(full.energyPct).toBeGreaterThan(partial.energyPct);
    expect(full.breakdown[0].cumulativePct).toBeLessThanOrEqual(100);
  });
});
