/* Dirichlet distribution utilities. Multivariate extension of Beta — a
   density over the K-simplex (K probabilities that sum to 1). Used by the
   3-sided-die posterior demo in Math Lab §7.

   Reuses the numerically stable logGamma from beta.js so posteriors with
   large pseudocounts still evaluate cleanly. */

import { logGamma } from './beta.js';

export function logDirichletNorm(alpha) {
  let sumAlpha = 0;
  let sumLogGamma = 0;
  for (let i = 0; i < alpha.length; i++) {
    sumAlpha += alpha[i];
    sumLogGamma += logGamma(alpha[i]);
  }
  return logGamma(sumAlpha) - sumLogGamma;
}

// Log of the PDF at the point p on the (K−1)-simplex. Returns -Infinity if
// any component is ≤ 0 so the caller can clip silently.
export function dirichletLogPDF(p, alpha) {
  let total = logDirichletNorm(alpha);
  for (let i = 0; i < alpha.length; i++) {
    if (p[i] <= 0) return -Infinity;
    total += (alpha[i] - 1) * Math.log(p[i]);
  }
  return total;
}

export function dirichletPDF(p, alpha) {
  const l = dirichletLogPDF(p, alpha);
  return l === -Infinity ? 0 : Math.exp(l);
}

export function dirichletMean(alpha) {
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i];
  return alpha.map((a) => a / sum);
}

// Conjugate posterior under a Categorical(p) likelihood with counts n_i per
// outcome. Same pseudocount-addition pattern as Beta ↔ Bernoulli.
export function dirichletPosterior(priorAlpha, counts) {
  return priorAlpha.map((a, i) => a + counts[i]);
}
