import { describe, it, expect } from 'vitest';
import {
  logGamma,
  logBeta,
  betaPDF,
  betaMean,
  betaVariance,
  betaPosterior,
  betaModeOrMean,
  sampleGamma,
  sampleBeta
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

describe('sampleGamma', () => {
  it('returns positive samples with empirical mean ≈ shape', () => {
    // Gamma(shape, 1) has mean = shape. 5000 samples → ~1% stderr.
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const x = sampleGamma(4);
      expect(x).toBeGreaterThan(0);
      sum += x;
    }
    expect(sum / N).toBeGreaterThan(3.6);
    expect(sum / N).toBeLessThan(4.4);
  });

  it('handles the α < 1 recursion branch', () => {
    // Shape 0.5 mean = 0.5; variance = 0.5; check mean is plausible.
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleGamma(0.5);
    expect(sum / N).toBeGreaterThan(0.4);
    expect(sum / N).toBeLessThan(0.6);
  });
});

describe('sampleBeta', () => {
  it('returns values in (0, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = sampleBeta(3, 5);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has empirical mean matching α / (α + β) for Beta(3, 5)', () => {
    // True mean = 3/8 = 0.375; SE over 5000 samples ≈ 0.005.
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(3, 5);
    expect(sum / N).toBeCloseTo(0.375, 1);
  });

  it('matches argmax of true p on a 3-arm bandit at the tails', () => {
    // When posteriors are very concentrated (large α, β), Thompson sampling
    // picks near the MAP — this is the key convergence property that makes
    // Thompson's regret O(log n).
    const posteriors = [
      { a: 200, b: 800 },   // mean = 0.20
      { a: 700, b: 300 },   // mean = 0.70  (best)
      { a: 400, b: 600 }    // mean = 0.40
    ];
    let wins = [0, 0, 0];
    for (let i = 0; i < 1000; i++) {
      const draws = posteriors.map((p) => sampleBeta(p.a, p.b));
      let best = 0;
      for (let k = 1; k < 3; k++) if (draws[k] > draws[best]) best = k;
      wins[best]++;
    }
    // Middle arm should dominate — roughly 100% at these concentrations.
    expect(wins[1]).toBeGreaterThan(900);
  });
});
