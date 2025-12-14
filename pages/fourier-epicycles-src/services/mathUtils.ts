import { Complex, FourierTerm, Point } from '../types';

/**
 * Calculates the Discrete Fourier Transform (DFT) for a set of complex points.
 * X_k = sum_{n=0}^{N-1} x_n * e^(-i * 2 * pi * k * n / N)
 */
export const dft = (x: Complex[]): FourierTerm[] => {
  const X: FourierTerm[] = [];
  const N = x.length;

  for (let k = 0; k < N; k++) {
    let sumRe = 0;
    let sumIm = 0;

    for (let n = 0; n < N; n++) {
      const phi = (Math.PI * 2 * k * n) / N;
      const c = Math.cos(phi);
      const s = Math.sin(phi);

      // Euler's formula: e^(-ix) = cos(x) - i*sin(x)
      // (a + bi) * (c - di) = (ac + bd) + i(bc - ad)
      // Here: x[n] = (re + i*im)
      // Term: (re + i*im) * (cos - i*sin)
      
      const re = x[n].re;
      const im = x[n].im;

      sumRe += re * c + im * s;
      sumIm += im * c - re * s;
    }

    sumRe = sumRe / N;
    sumIm = sumIm / N;

    const freq = k;
    const amp = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    const phase = Math.atan2(sumIm, sumRe);

    X.push({ re: sumRe, im: sumIm, freq, amp, phase });
  }

  // Sort by amplitude (descending) to draw largest circles first
  return X.sort((a, b) => b.amp - a.amp);
};

export const smoothPoints = (points: Point[], windowSize: number): Point[] => {
    if (windowSize <= 0 || points.length < 2) return [...points];
    const smoothed: Point[] = [];
    for (let i = 0; i < points.length; i++) {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < points.length) {
                sumX += points[idx].x;
                sumY += points[idx].y;
                count++;
            }
        }
        smoothed.push({ x: sumX / count, y: sumY / count });
    }
    return smoothed;
};

// --- Presets ---

export const generateSquare = (): Point[] => {
  const points: Point[] = [];
  const size = 200;
  const steps = 50; // Points per side
  
  // Top
  for (let i = 0; i < steps; i++) points.push({ x: -size + (i * 2 * size) / steps, y: -size });
  // Right
  for (let i = 0; i < steps; i++) points.push({ x: size, y: -size + (i * 2 * size) / steps });
  // Bottom
  for (let i = 0; i < steps; i++) points.push({ x: size - (i * 2 * size) / steps, y: size });
  // Left
  for (let i = 0; i < steps; i++) points.push({ x: -size, y: size - (i * 2 * size) / steps });

  return points;
};

export const generateCircle = (): Point[] => {
  const points: Point[] = [];
  const radius = 200;
  const steps = 200;
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
};

export const generateHeart = (): Point[] => {
  const points: Point[] = [];
  const steps = 300;
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    // Heart formula
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    points.push({ x: x * 15, y: y * 15 });
  }
  return points;
};

export const generateInfinity = (): Point[] => {
    const points: Point[] = [];
    const steps = 300;
    const scale = 150;
    for (let i = 0; i < steps; i++) {
        const t = (Math.PI * 2 * i) / steps;
        const x = scale * Math.cos(t);
        const y = scale * Math.sin(t) * Math.cos(t);
        points.push({ x, y });
    }
    return points;
};

export const generateMusicNote = (): Point[] => {
    const points: Point[] = [];
    const steps = 100;
    // Simple approximation of a note head and stem
    // Ellipse for head
    for(let i=0; i<steps; i++) {
        const t = Math.PI * 2 * i / steps;
        points.push({ x: 40 * Math.cos(t) - 50, y: 30 * Math.sin(t) + 100 });
    }
    // Stem (up and down to close loop roughly)
    for(let i=0; i<20; i++) {
        points.push({ x: -10, y: 100 - (200 * i/20) });
    }
    // Flag
    for(let i=0; i<30; i++) {
        const t = i/30;
        points.push({ x: -10 + 50 * Math.sin(t * Math.PI), y: -100 + 50 * t });
    }
     // Return stem
     for(let i=0; i<20; i++) {
        points.push({ x: -10, y: -50 + (150 * i/20) });
    }
    return points;
}