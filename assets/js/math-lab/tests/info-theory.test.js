import { describe, it, expect } from 'vitest';
import {
  gaussianPDF,
  gaussianEntropy,
  gaussianKL,
  gaussianCrossEntropy,
  mixturePDF,
  mixtureMoments,
  momentMatchFit,
  gaussianOverlap,
  trapezoidIntegrate
} from '../info-theory.js';

describe('gaussianPDF', () => {
  it('peaks at μ with value 1/(σ√2π)', () => {
    expect(gaussianPDF(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 10);
    expect(gaussianPDF(2, 2, 0.5)).toBeCloseTo(1 / (0.5 * Math.sqrt(2 * Math.PI)), 10);
  });
  it('integrates to 1 on a wide interval', () => {
    const total = trapezoidIntegrate((x) => gaussianPDF(x, 0, 1), -10, 10, 2000);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('gaussianEntropy', () => {
  it('matches ½ log(2πe σ²)', () => {
    expect(gaussianEntropy(1)).toBeCloseTo(0.5 * Math.log(2 * Math.PI * Math.E), 10);
    expect(gaussianEntropy(2)).toBeCloseTo(0.5 * Math.log(2 * Math.PI * Math.E * 4), 10);
  });
});

describe('gaussianKL', () => {
  it('is zero for identical distributions', () => {
    expect(gaussianKL(0, 1, 0, 1)).toBeCloseTo(0, 12);
    expect(gaussianKL(2.5, 0.7, 2.5, 0.7)).toBeCloseTo(0, 12);
  });
  it('is non-negative (Gibbs)', () => {
    expect(gaussianKL(0, 1, 1, 1)).toBeGreaterThan(0);
    expect(gaussianKL(-2, 0.5, 1, 2)).toBeGreaterThan(0);
  });
  it('is asymmetric in general', () => {
    const fwd = gaussianKL(0, 1, 0, 2);
    const rev = gaussianKL(0, 2, 0, 1);
    expect(Math.abs(fwd - rev)).toBeGreaterThan(0.1);
  });
  it('matches closed-form reference values', () => {
    // Mean shift by 1 at σ=1:  KL = (0 + 1)/(2·1) - 0 = 0.5
    expect(gaussianKL(0, 1, 1, 1)).toBeCloseTo(0.5, 10);
    // Variance widens 1 → 2 at matched mean:  log 2 + 1/8 − 1/2
    expect(gaussianKL(0, 1, 0, 2)).toBeCloseTo(Math.log(2) + 1 / 8 - 0.5, 10);
  });
  it('matches a brute-force numerical KL for a generic pair', () => {
    const mu1 = -0.5, s1 = 0.9, mu2 = 1.1, s2 = 1.3;
    const analytic = gaussianKL(mu1, s1, mu2, s2);
    const numeric = trapezoidIntegrate(
      (x) => {
        const p = gaussianPDF(x, mu1, s1);
        const q = gaussianPDF(x, mu2, s2);
        return p * Math.log(p / q);
      },
      -8,
      8,
      4000
    );
    expect(analytic).toBeCloseTo(numeric, 4);
  });
});

describe('gaussianCrossEntropy', () => {
  it('decomposes as H(p) + KL(p‖q)', () => {
    const mu1 = 0.3, s1 = 0.8, mu2 = -1, s2 = 1.5;
    const expected = gaussianEntropy(s1) + gaussianKL(mu1, s1, mu2, s2);
    expect(gaussianCrossEntropy(mu1, s1, mu2, s2)).toBeCloseTo(expected, 12);
  });
});

describe('mixturePDF + mixtureMoments', () => {
  it('integrates to 1 for weights that sum to 1', () => {
    const w = [0.3, 0.7];
    const c = [{ mu: -1, sigma: 0.5 }, { mu: 2, sigma: 1 }];
    const total = trapezoidIntegrate((x) => mixturePDF(x, w, c), -10, 10, 4000);
    expect(total).toBeCloseTo(1, 5);
  });
  it('computes the correct mean and variance of a symmetric bimodal', () => {
    const w = [0.5, 0.5];
    const c = [{ mu: -2, sigma: 1 }, { mu: 2, sigma: 1 }];
    const { mean, variance } = mixtureMoments(w, c);
    expect(mean).toBeCloseTo(0, 10);
    // E[X²] = 0.5·(4+1) + 0.5·(4+1) = 5;  Var = 5 − 0² = 5
    expect(variance).toBeCloseTo(5, 10);
  });
});

describe('momentMatchFit', () => {
  it('recovers a single-Gaussian target exactly', () => {
    const fit = momentMatchFit([1], [{ mu: 1.5, sigma: 0.7 }]);
    expect(fit.mu).toBeCloseTo(1.5, 12);
    expect(fit.sigma).toBeCloseTo(0.7, 12);
  });
  it('covers both modes of a symmetric bimodal target', () => {
    const fit = momentMatchFit([0.5, 0.5], [{ mu: -2, sigma: 1 }, { mu: 2, sigma: 1 }]);
    expect(fit.mu).toBeCloseTo(0, 10);
    expect(fit.sigma).toBeCloseTo(Math.sqrt(5), 10);
    // Wider than either component — the mode-covering fingerprint.
    expect(fit.sigma).toBeGreaterThan(2);
  });
});

describe('gaussianOverlap', () => {
  it('is 1 for identical Gaussians', () => {
    expect(gaussianOverlap(0, 1, 0, 1)).toBeCloseTo(1, 3);
  });
  it('decreases as distributions separate', () => {
    const close = gaussianOverlap(0, 1, 0.5, 1);
    const far = gaussianOverlap(0, 1, 4, 1);
    expect(close).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.05);
  });
});
