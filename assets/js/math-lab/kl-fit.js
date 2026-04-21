/* Reverse-KL fitting of a single Gaussian q(x; μ, σ) to a mixture target p.
   Pure functions, no DOM. Used by the mode-seeking panel in Math Lab §9 and
   testable in isolation. Forward KL has a closed-form answer (moment match,
   lives in info-theory.js) so no optimisation is needed there. */

import { gaussianPDF, mixturePDF, trapezoidIntegrate } from './info-theory.js';

// Domain wide enough that q with μ ≤ 4 and σ ≤ 3 still has negligible mass
// at the boundary, even when targets sit near ±sep with their own widths.
const DEFAULT_DOMAIN_MIN = -16;
const DEFAULT_DOMAIN_MAX = 16;
const DEFAULT_GRID = 600;
const DEFAULT_STEP = 1e-3;
const DEFAULT_SIGMA_MIN = 0.1;

export function forwardKLLoss(weights, components, mu, sigma, opts = {}) {
  const a = opts.min ?? DEFAULT_DOMAIN_MIN;
  const b = opts.max ?? DEFAULT_DOMAIN_MAX;
  const n = opts.n ?? DEFAULT_GRID;
  return trapezoidIntegrate(
    (x) => {
      const p = mixturePDF(x, weights, components);
      if (p === 0) return 0;
      const q = gaussianPDF(x, mu, sigma);
      if (q === 0) return 0;
      return p * Math.log(p / q);
    },
    a,
    b,
    n
  );
}

export function reverseKLLoss(mu, sigma, weights, components, opts = {}) {
  const a = opts.min ?? DEFAULT_DOMAIN_MIN;
  const b = opts.max ?? DEFAULT_DOMAIN_MAX;
  const n = opts.n ?? DEFAULT_GRID;
  return trapezoidIntegrate(
    (x) => {
      const q = gaussianPDF(x, mu, sigma);
      if (q === 0) return 0;
      const p = mixturePDF(x, weights, components);
      if (p === 0) return 0;
      return q * Math.log(q / p);
    },
    a,
    b,
    n
  );
}

// One finite-difference gradient step on (μ, σ). Returns the new parameters
// plus pre-step loss and gradient magnitudes for display. σ is clamped to
// sigmaMin so a wobbly gradient can't collapse q into a delta function.
export function reverseKLGradStep(mu, sigma, weights, components, opts = {}) {
  const lr = opts.lr ?? 0.05;
  const h = opts.h ?? DEFAULT_STEP;
  const sigmaMin = opts.sigmaMin ?? DEFAULT_SIGMA_MIN;

  const loss = reverseKLLoss(mu, sigma, weights, components, opts);
  const lossMuPlus = reverseKLLoss(mu + h, sigma, weights, components, opts);
  const lossMuMinus = reverseKLLoss(mu - h, sigma, weights, components, opts);
  const lossSigmaPlus = reverseKLLoss(mu, sigma + h, weights, components, opts);
  const lossSigmaMinus = reverseKLLoss(mu, sigma - h, weights, components, opts);

  const gradMu = (lossMuPlus - lossMuMinus) / (2 * h);
  const gradSigma = (lossSigmaPlus - lossSigmaMinus) / (2 * h);

  return {
    mu: mu - lr * gradMu,
    sigma: Math.max(sigmaMin, sigma - lr * gradSigma),
    loss,
    gradMu,
    gradSigma
  };
}
