import { FourierTerm, Point } from '../types';

export interface EnergyBreakdown {
  energyPct: number;
  cumulativePct: number;
}

export interface EnergyMetrics {
  energyPct: number;
  rmsError: number;
  topTerms: { freq: number; amp: number; phase: number; energyPct: number; cumulativePct: number }[];
  breakdown: EnergyBreakdown[];
}

export const pickEpicycleCountForEnergy = (
  terms: FourierTerm[],
  targetPct: number,
  maxCount?: number
): number => {
  if (terms.length === 0) return 0;
  const cap = Math.max(1, Math.min(maxCount ?? terms.length, terms.length));
  const clampedTarget = Math.max(0, Math.min(100, targetPct));
  if (clampedTarget <= 0) return 1;
  if (clampedTarget >= 100) return cap;

  const energies = terms.map((t) => t.amp * t.amp);
  const totalEnergy = energies.reduce((acc, e) => acc + e, 0);
  if (!Number.isFinite(totalEnergy) || totalEnergy <= 0) return 1;

  const desired = (clampedTarget / 100) * totalEnergy;
  let cumulative = 0;
  for (let i = 0; i < cap; i++) {
    cumulative += energies[i];
    if (cumulative >= desired) return i + 1;
  }
  return cap;
};

export const computeEnergyMetrics = (
  terms: FourierTerm[],
  points: Point[],
  numEpicycles: number,
  sampleBudget = 600
): EnergyMetrics => {
  if (!terms.length || !points.length) {
    return { energyPct: 0, rmsError: 0, topTerms: [], breakdown: [] };
  }

  const energies = terms.map((t) => t.amp * t.amp);
  const totalEnergy = energies.reduce((acc, e) => acc + e, 0) || 1;
  const m = Math.max(Math.min(numEpicycles || terms.length, terms.length), 1);
  const capturedEnergy = energies.slice(0, m).reduce((acc, e) => acc + e, 0);

  let cumulative = 0;
  const breakdown: EnergyBreakdown[] = energies.map((e) => {
    cumulative += e;
    return {
      energyPct: (e / totalEnergy) * 100,
      cumulativePct: (cumulative / totalEnergy) * 100
    };
  });

  let cumulativeTop = 0;
  const topTerms = terms.slice(0, 6).map((t, idx) => {
    const e = energies[idx];
    cumulativeTop += e;
    return {
      freq: t.freq,
      amp: t.amp,
      phase: t.phase,
      energyPct: (e / totalEnergy) * 100,
      cumulativePct: (cumulativeTop / totalEnergy) * 100
    };
  });

  const N = points.length;
  const sampleStep = Math.max(1, Math.floor(N / sampleBudget));
  const termsUsed = terms.slice(0, m);
  let errorSum = 0;
  let samples = 0;

  for (let n = 0; n < N; n += sampleStep) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < termsUsed.length; i++) {
      const t = termsUsed[i];
      const theta = (2 * Math.PI * t.freq * n) / N;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      re += t.re * cosT - t.im * sinT;
      im += t.re * sinT + t.im * cosT;
    }
    const dx = re - points[n].x;
    const dy = im - points[n].y;
    errorSum += dx * dx + dy * dy;
    samples++;
  }

  const rmsError = Math.sqrt(errorSum / Math.max(samples, 1));

  return {
    energyPct: Number(((capturedEnergy / totalEnergy) * 100).toFixed(2)),
    rmsError: Number(rmsError.toFixed(2)),
    topTerms,
    breakdown
  };
};
