import { describe, expect, it } from 'vitest';
import { computeEnergyMetrics, pickEpicycleCountForEnergy } from '../metrics';
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

describe('pickEpicycleCountForEnergy', () => {
  it('returns 0 for empty terms', () => {
    expect(pickEpicycleCountForEnergy([], 99.99)).toBe(0);
  });

  it('clamps target <= 0 to 1 term', () => {
    const terms: FourierTerm[] = [{ re: 0, im: 0, freq: 0, amp: 2, phase: 0 }];
    expect(pickEpicycleCountForEnergy(terms, 0)).toBe(1);
    expect(pickEpicycleCountForEnergy(terms, -5)).toBe(1);
  });

  it('clamps target >= 100 to the provided cap', () => {
    const terms: FourierTerm[] = [
      { re: 0, im: 0, freq: 0, amp: 2, phase: 0 },
      { re: 0, im: 0, freq: 1, amp: 1, phase: 0 },
      { re: 0, im: 0, freq: 2, amp: 1, phase: 0 }
    ];
    expect(pickEpicycleCountForEnergy(terms, 100, 2)).toBe(2);
    expect(pickEpicycleCountForEnergy(terms, 120, 2)).toBe(2);
  });

  it('returns the smallest term count that reaches the target energy', () => {
    const terms: FourierTerm[] = [
      { re: 0, im: 0, freq: 0, amp: 10, phase: 0 }, // energy=100
      { re: 0, im: 0, freq: 1, amp: 1, phase: 0 },  // energy=1
      { re: 0, im: 0, freq: 2, amp: 1, phase: 0 }   // energy=1
    ];
    // total=102; 98% => 99.96, first term alone is enough
    expect(pickEpicycleCountForEnergy(terms, 98)).toBe(1);
    // 99% => 100.98, need one more term
    expect(pickEpicycleCountForEnergy(terms, 99)).toBe(2);
    // 99.99% => 101.9898, need all 3
    expect(pickEpicycleCountForEnergy(terms, 99.99)).toBe(3);
  });

  it('honors maxCount when the target cannot be reached within the cap', () => {
    const terms: FourierTerm[] = [
      { re: 0, im: 0, freq: 0, amp: 3, phase: 0 }, // 9
      { re: 0, im: 0, freq: 1, amp: 3, phase: 0 }  // 9
    ];
    // Need both terms to reach 100%, but cap=1 forces return=1.
    expect(pickEpicycleCountForEnergy(terms, 99.99, 1)).toBe(1);
  });
});
