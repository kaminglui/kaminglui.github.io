/* Beta distribution utilities. Pure functions, no DOM. Used by the Bayesian
   coin-flip demo in Math Lab §7 and available for future Reinforcement Learning Lab Thompson-
   sampling / Bayesian-coin demos.

   Numerics: the Beta PDF is x^(α−1) (1−x)^(β−1) / B(α, β). For large α, β the
   normaliser B(α, β) underflows a naive Math.pow chain, so we go through
   log-space using a Lanczos log-Γ. Accurate to ~14 digits across the
   parameter range the demos care about. */

// Lanczos approximation for log Γ(x), valid for x > 0.5; reflection handles x < 0.5.
// Coefficients from Stephen Moshier's Cephes.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7
];

export function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS_C[0];
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_C.length; i++) a += LANCZOS_C[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export function logBeta(alpha, beta) {
  return logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
}

export function betaPDF(x, alpha, beta) {
  if (x <= 0 || x >= 1) return 0;
  const logPdf =
    (alpha - 1) * Math.log(x) +
    (beta - 1) * Math.log(1 - x) -
    logBeta(alpha, beta);
  return Math.exp(logPdf);
}

export function betaMean(alpha, beta) {
  return alpha / (alpha + beta);
}

export function betaVariance(alpha, beta) {
  const s = alpha + beta;
  return (alpha * beta) / (s * s * (s + 1));
}

// Posterior under a Bernoulli/Binomial likelihood with conjugate Beta prior.
// This is the whole point of conjugacy: no integration, just arithmetic on
// the pseudocounts.
export function betaPosterior(priorAlpha, priorBeta, heads, tails) {
  return { alpha: priorAlpha + heads, beta: priorBeta + tails };
}

// Peak of the PDF (mode of Beta). Only defined for α > 1 and β > 1; returns
// the mean as a display fallback for the U-shaped / uniform regimes. The
// interactive uses this for its y-axis scaling so the curve doesn't clip.
export function betaModeOrMean(alpha, beta) {
  if (alpha > 1 && beta > 1) {
    return (alpha - 1) / (alpha + beta - 2);
  }
  return betaMean(alpha, beta);
}

// Box-Muller Gaussian sampler. Kept local so beta.js stays self-contained
// and can be imported by both math-lab and rl-lab without crossing labs.
function sampleStandardNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Marsaglia–Tsang (2000) Gamma(shape, 1) sampler. Accepts any shape > 0 via
// the usual "α < 1 → α + 1 with Uniform power-down" recursion.
export function sampleGamma(shape) {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x;
    let v;
    do {
      x = sampleStandardNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Beta(α, β) sampler via two independent Gammas. Used by Thompson-sampling
// bandits: draw one θ_i per arm, pull argmax. Always returns a value in
// the open interval (0, 1) given finite positive α, β.
export function sampleBeta(alpha, beta) {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}
