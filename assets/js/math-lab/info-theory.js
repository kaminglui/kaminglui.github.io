/* Gaussian + mixture utilities for the info-theory demos in Math Lab §8 / §9.
   Kept pure (no DOM, no canvas) so they're unit-testable and reusable between
   the KL visualiser (two single Gaussians) and the mode-covering / mode-
   seeking fit panel (Gaussian vs mixture). */

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const LOG_2PIE = Math.log(2 * Math.PI * Math.E);

export function gaussianPDF(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * SQRT_2PI);
}

export function gaussianEntropy(sigma) {
  return 0.5 * (LOG_2PIE + 2 * Math.log(sigma));
}

// Closed-form KL between two 1-D Gaussians; no numerical integration needed.
// Caller is responsible for σ > 0.
export function gaussianKL(mu1, sigma1, mu2, sigma2) {
  const v1 = sigma1 * sigma1;
  const v2 = sigma2 * sigma2;
  return Math.log(sigma2 / sigma1) + (v1 + (mu1 - mu2) ** 2) / (2 * v2) - 0.5;
}

export function gaussianCrossEntropy(mu1, sigma1, mu2, sigma2) {
  return gaussianEntropy(sigma1) + gaussianKL(mu1, sigma1, mu2, sigma2);
}

export function mixturePDF(x, weights, components) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * gaussianPDF(x, components[i].mu, components[i].sigma);
  }
  return sum;
}

export function mixtureMoments(weights, components) {
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < weights.length; i++) {
    const { mu, sigma } = components[i];
    m1 += weights[i] * mu;
    m2 += weights[i] * (mu * mu + sigma * sigma);
  }
  return { mean: m1, variance: m2 - m1 * m1 };
}

// Moment matching is the exact argmin of forward KL(p‖q) when q is a single
// Gaussian and p is arbitrary. Used by the mode-covering panel.
export function momentMatchFit(weights, components) {
  const { mean, variance } = mixtureMoments(weights, components);
  return { mu: mean, sigma: Math.sqrt(variance) };
}

export function trapezoidIntegrate(fn, a, b, n) {
  const h = (b - a) / n;
  let sum = 0.5 * (fn(a) + fn(b));
  for (let i = 1; i < n; i++) sum += fn(a + i * h);
  return sum * h;
}

// Overlap coefficient ∫ min(p, q). No closed form for two 1-D Gaussians; a
// fixed grid around the union of ±5σ windows is plenty for a demo readout.
export function gaussianOverlap(mu1, sigma1, mu2, sigma2, { n = 400 } = {}) {
  const spread = 5 * Math.max(sigma1, sigma2);
  const a = Math.min(mu1, mu2) - spread;
  const b = Math.max(mu1, mu2) + spread;
  return trapezoidIntegrate(
    (x) => Math.min(gaussianPDF(x, mu1, sigma1), gaussianPDF(x, mu2, sigma2)),
    a,
    b,
    n
  );
}
