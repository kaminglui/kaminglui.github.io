import { describe, it, expect } from 'vitest';
import {
  logDirichletNorm,
  dirichletLogPDF,
  dirichletPDF,
  dirichletMean,
  dirichletPosterior
} from '../dirichlet.js';

describe('logDirichletNorm', () => {
  it('matches the closed form for Dir(1, 1, 1) — log 2', () => {
    // Γ(3) / (Γ(1)³) = 2! / 1 = 2, so log = log 2.
    expect(logDirichletNorm([1, 1, 1])).toBeCloseTo(Math.log(2), 10);
  });
  it('is symmetric under permutation of alpha', () => {
    expect(logDirichletNorm([2, 3, 5])).toBeCloseTo(logDirichletNorm([5, 2, 3]), 12);
  });
});

describe('dirichletPDF', () => {
  it('is uniform on the simplex for Dir(1, 1, 1)', () => {
    const alpha = [1, 1, 1];
    expect(dirichletPDF([1/3, 1/3, 1/3], alpha)).toBeCloseTo(2, 10);
    expect(dirichletPDF([0.1, 0.2, 0.7], alpha)).toBeCloseTo(2, 10);
    expect(dirichletPDF([0.5, 0.4, 0.1], alpha)).toBeCloseTo(2, 10);
  });

  it('returns 0 when any component is ≤ 0', () => {
    expect(dirichletPDF([0, 0.5, 0.5], [1, 1, 1])).toBe(0);
    expect(dirichletPDF([-0.1, 0.6, 0.5], [1, 1, 1])).toBe(0);
  });

  it('is invariant under simultaneous permutation of p and alpha', () => {
    const a1 = dirichletPDF([0.2, 0.5, 0.3], [2, 4, 6]);
    const a2 = dirichletPDF([0.5, 0.3, 0.2], [4, 6, 2]);
    expect(a1).toBeCloseTo(a2, 10);
  });

  it('integrates to 1 over the simplex (Monte Carlo)', () => {
    // Sample uniformly on the 2-simplex and average PDF values × simplex area.
    // Uniform sampling via rejection from the unit square; the 2-simplex area
    // is 1/2 in barycentric p1, p2 (with p3 = 1−p1−p2 ≥ 0).
    const alpha = [3, 4, 5];
    const N = 20000;
    let sum = 0;
    let accepted = 0;
    let rng = 123456789;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 0x100000000;
    };
    for (let i = 0; i < N; i++) {
      const p1 = rand();
      const p2 = rand();
      if (p1 + p2 > 1) continue;
      const p3 = 1 - p1 - p2;
      sum += dirichletPDF([p1, p2, p3], alpha);
      accepted++;
    }
    // Uniform density on the triangle is 2 (area 1/2), so integral = (sum / accepted) / 2.
    const integral = (sum / accepted) / 2;
    expect(integral).toBeCloseTo(1, 1);
  });
});

describe('dirichletMean', () => {
  it('matches α_i / Σα', () => {
    const m = dirichletMean([1, 2, 3]);
    expect(m[0]).toBeCloseTo(1/6, 12);
    expect(m[1]).toBeCloseTo(2/6, 12);
    expect(m[2]).toBeCloseTo(3/6, 12);
  });

  it('is uniform for symmetric α', () => {
    const m = dirichletMean([4, 4, 4]);
    expect(m[0]).toBeCloseTo(1/3, 12);
    expect(m[1]).toBeCloseTo(1/3, 12);
    expect(m[2]).toBeCloseTo(1/3, 12);
  });
});

describe('dirichletPosterior', () => {
  it('adds counts to each α component', () => {
    expect(dirichletPosterior([1, 1, 1], [5, 2, 3])).toEqual([6, 3, 4]);
  });
  it('preserves zero-observations as identity', () => {
    expect(dirichletPosterior([2.5, 1, 3.1], [0, 0, 0])).toEqual([2.5, 1, 3.1]);
  });
});
