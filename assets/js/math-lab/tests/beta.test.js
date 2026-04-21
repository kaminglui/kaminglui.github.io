import { describe, it, expect } from 'vitest';
import {
  logGamma,
  logBeta,
  betaPDF,
  betaMean,
  betaVariance,
  betaPosterior,
  betaModeOrMean
} from '../beta.js';

describe('logGamma', () => {
  it('matches log((n-1)!) for small positive integers', () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);                   // 0! = 1
    expect(logGamma(2)).toBeCloseTo(0, 10);                   // 1! = 1
    expect(logGamma(3)).toBeCloseTo(Math.log(2), 10);         // 2! = 2
    expect(logGamma(6)).toBeCloseTo(Math.log(120), 10);       // 5! = 120
    expect(logGamma(11)).toBeCloseTo(Math.log(3628800), 8);   // 10! = 3628800
  });

  it('handles the reflection-formula range (x < 0.5)', () => {
    // Γ(0.5) = √π, so log Γ(0.5) = ½ log π.
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10);
  });
});

describe('logBeta', () => {
  it('recovers B(1, 1) = 1', () => {
    expect(logBeta(1, 1)).toBeCloseTo(0, 12);
  });
  it('recovers B(2, 3) = 1/12', () => {
    expect(logBeta(2, 3)).toBeCloseTo(Math.log(1 / 12), 10);
  });
  it('is symmetric: B(α, β) = B(β, α)', () => {
    expect(logBeta(4, 7)).toBeCloseTo(logBeta(7, 4), 12);
  });
});

describe('betaPDF', () => {
  it('is uniform for Beta(1, 1)', () => {
    expect(betaPDF(0.1, 1, 1)).toBeCloseTo(1, 10);
    expect(betaPDF(0.5, 1, 1)).toBeCloseTo(1, 10);
    expect(betaPDF(0.9, 1, 1)).toBeCloseTo(1, 10);
  });

  it('matches analytic Beta(2, 1) = 2x', () => {
    expect(betaPDF(0.25, 2, 1)).toBeCloseTo(0.5, 10);
    expect(betaPDF(0.5, 2, 1)).toBeCloseTo(1.0, 10);
    expect(betaPDF(0.75, 2, 1)).toBeCloseTo(1.5, 10);
  });

  it('is symmetric under α ↔ β with x ↔ 1−x', () => {
    expect(betaPDF(0.2, 3, 7)).toBeCloseTo(betaPDF(0.8, 7, 3), 10);
  });

  it('returns 0 outside (0, 1)', () => {
    expect(betaPDF(0, 2, 5)).toBe(0);
    expect(betaPDF(1, 2, 5)).toBe(0);
    expect(betaPDF(-0.1, 2, 5)).toBe(0);
    expect(betaPDF(1.1, 2, 5)).toBe(0);
  });

  it('integrates to 1 via trapezoid sum over (0, 1)', () => {
    const n = 4000;
    let total = 0;
    for (let i = 1; i < n; i++) {
      total += betaPDF(i / n, 4, 6);
    }
    // trapezoid w/ endpoints = 0 (the endpoints return 0 explicitly).
    total *= 1 / n;
    expect(total).toBeCloseTo(1, 3);
  });
});

describe('moments', () => {
  it('betaMean = α / (α + β)', () => {
    expect(betaMean(2, 5)).toBeCloseTo(2 / 7, 12);
    expect(betaMean(1, 1)).toBeCloseTo(0.5, 12);
  });
  it('betaVariance matches analytic form', () => {
    // Beta(2, 5): var = 10 / (49 · 8) = 10/392 = 5/196
    expect(betaVariance(2, 5)).toBeCloseTo(5 / 196, 12);
  });
});

describe('betaPosterior', () => {
  it('adds heads to α and tails to β', () => {
    expect(betaPosterior(1, 1, 7, 3)).toEqual({ alpha: 8, beta: 4 });
  });
  it('is a no-op for zero observations', () => {
    expect(betaPosterior(2.5, 3.1, 0, 0)).toEqual({ alpha: 2.5, beta: 3.1 });
  });
});

describe('betaModeOrMean', () => {
  it('returns the mode (α−1)/(α+β−2) when both > 1', () => {
    // Beta(3, 5): mode = 2/6 = 1/3
    expect(betaModeOrMean(3, 5)).toBeCloseTo(1 / 3, 12);
  });
  it('falls back to the mean for the uniform / U-shaped regime', () => {
    expect(betaModeOrMean(1, 1)).toBeCloseTo(0.5, 12);
    expect(betaModeOrMean(0.5, 0.5)).toBeCloseTo(0.5, 12);
  });
});
