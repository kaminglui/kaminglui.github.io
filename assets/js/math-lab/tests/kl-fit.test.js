import { describe, it, expect } from 'vitest';
import { reverseKLLoss, reverseKLGradStep } from '../kl-fit.js';
import { momentMatchFit } from '../info-theory.js';

// Modes at ±3 with σ=1 — wide enough that mode-seeking is the global min
// of reverse KL, while a wide Gaussian at the centre is a second local min.
const sb = {
  weights: [0.5, 0.5],
  components: [
    { mu: -3, sigma: 1 },
    { mu: 3, sigma: 1 }
  ]
};

describe('reverseKLLoss', () => {
  it('is zero when q equals a single-Gaussian target', () => {
    const loss = reverseKLLoss(0.5, 0.8, [1], [{ mu: 0.5, sigma: 0.8 }]);
    expect(Math.abs(loss)).toBeLessThan(1e-3);
  });

  it('is positive for any mismatched fit on a bimodal target', () => {
    expect(reverseKLLoss(0, 1, sb.weights, sb.components)).toBeGreaterThan(0);
    expect(reverseKLLoss(1.5, 0.8, sb.weights, sb.components)).toBeGreaterThan(0);
  });

  it('rewards collapsing onto a mode (reverse-KL global min)', () => {
    // At (μ=3, σ=1) q sits on one mode; at (μ=0, σ=√10) it covers both.
    // On this target the mode solution has lower reverse KL (log 2 ≈ 0.69)
    // than the wide moment-match solution (≈ 0.78).
    const mode = reverseKLLoss(3, 1, sb.weights, sb.components);
    const wide = reverseKLLoss(0, Math.sqrt(10), sb.weights, sb.components);
    expect(mode).toBeLessThan(wide);
  });
});

describe('forward-KL (moment-match) fit', () => {
  it('recovers a single-Gaussian target exactly', () => {
    const fit = momentMatchFit([1], [{ mu: 1.5, sigma: 0.7 }]);
    expect(fit.mu).toBeCloseTo(1.5, 10);
    expect(fit.sigma).toBeCloseTo(0.7, 10);
  });

  it('matches E_p[X] and Var_p[X] on the bimodal target', () => {
    const fit = momentMatchFit(sb.weights, sb.components);
    expect(fit.mu).toBeCloseTo(0, 10);
    // E[X²] = 0.5·(9+1) + 0.5·(9+1) = 10
    expect(fit.sigma).toBeCloseTo(Math.sqrt(10), 10);
  });
});

describe('reverseKLGradStep', () => {
  it('decreases the loss by one step from an off-centre init', () => {
    const before = reverseKLLoss(1.5, 1, sb.weights, sb.components);
    const step = reverseKLGradStep(1.5, 1, sb.weights, sb.components, { lr: 0.05 });
    const after = reverseKLLoss(step.mu, step.sigma, sb.weights, sb.components);
    expect(after).toBeLessThan(before);
  });

  it('does not break μ-symmetry from exactly the midpoint', () => {
    // By symmetry, ∂L/∂μ |_{μ=0} = 0 on a symmetric target, so finite-
    // difference gradient pins μ at 0 even as σ moves.
    let mu = 0;
    let sigma = 1;
    for (let i = 0; i < 100; i++) {
      const s = reverseKLGradStep(mu, sigma, sb.weights, sb.components, { lr: 0.1 });
      mu = s.mu;
      sigma = s.sigma;
    }
    expect(Math.abs(mu)).toBeLessThan(1e-4);
  });

  it('converges onto one mode from an init inside the mode basin', () => {
    let mu = 1.8;
    let sigma = 1;
    for (let i = 0; i < 500; i++) {
      const s = reverseKLGradStep(mu, sigma, sb.weights, sb.components, { lr: 0.1 });
      mu = s.mu;
      sigma = s.sigma;
    }
    expect(mu).toBeGreaterThan(2.5);
    expect(mu).toBeLessThan(3.5);
    expect(sigma).toBeGreaterThan(0.7);
    expect(sigma).toBeLessThan(1.5);
  });

  it('settles into the wide-centre local min from an init near centre', () => {
    // Reverse KL has multiple local minima on a bimodal target. Inits too
    // close to the midpoint never escape the wide-Gaussian basin.
    let mu = 0.5;
    let sigma = 1;
    for (let i = 0; i < 500; i++) {
      const s = reverseKLGradStep(mu, sigma, sb.weights, sb.components, { lr: 0.1 });
      mu = s.mu;
      sigma = s.sigma;
    }
    expect(Math.abs(mu)).toBeLessThan(0.5);
    expect(sigma).toBeGreaterThan(2);
  });
});

describe('mode-covering vs mode-seeking contrast', () => {
  it('forward-KL fit is substantially wider than the reverse-KL mode solution', () => {
    const forward = momentMatchFit(sb.weights, sb.components);
    expect(forward.sigma).toBeGreaterThan(3);

    let mu = 1.8;
    let sigma = 1;
    for (let i = 0; i < 500; i++) {
      const s = reverseKLGradStep(mu, sigma, sb.weights, sb.components, { lr: 0.1 });
      mu = s.mu;
      sigma = s.sigma;
    }
    expect(sigma).toBeLessThan(forward.sigma - 1.5);
  });
});
