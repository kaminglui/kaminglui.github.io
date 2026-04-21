/* Beta distribution utilities. Pure functions, no DOM. Used by the Bayesian
   coin-flip demo in Math Lab §7 and available for future RL Lab Thompson-
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
