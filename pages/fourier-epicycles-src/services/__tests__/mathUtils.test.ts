import { describe, expect, it } from 'vitest';
import {
  dft,
  generateCircle,
  generateHeart,
  generateInfinity,
  generateMusicNote,
  generateSquare,
  smoothPoints
} from '../mathUtils';
import { computeFourier, downsamplePoints, pointsToComplex, preparePoints } from '../fourierEngine';
import { Point } from '../../types';

describe('mathUtils', () => {
  it('computes DFT for a constant signal', () => {
    const samples: Point[] = [
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 }
    ];
    const spectrum = dft(pointsToComplex(samples));
    expect(spectrum[0].re).toBeCloseTo(1);
    expect(spectrum[0].im).toBeCloseTo(0);
    expect(spectrum.slice(1).every((term) => Math.abs(term.re) < 1e-6)).toBe(true);
  });

  it('smooths noisy points', () => {
    const noisy: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: -10 },
      { x: 30, y: 10 }
    ];
    const smoothed = smoothPoints(noisy, 1);
    expect(smoothed.length).toBe(noisy.length);
    expect(Math.abs(smoothed[1].y)).toBeLessThan(Math.abs(noisy[2].y));
  });

  it('generates preset shapes', () => {
    expect(generateCircle().length).toBeGreaterThan(100);
    expect(generateSquare().length).toBeGreaterThan(100);
    expect(generateHeart().length).toBeGreaterThan(100);
    expect(generateInfinity().length).toBeGreaterThan(100);
    expect(generateMusicNote().length).toBeGreaterThan(50);
  });

  it('keeps spectrum amplitudes sorted from largest to smallest', () => {
    const samples = generateInfinity().slice(0, 80);
    const spectrum = dft(pointsToComplex(samples));
    const amps = spectrum.map((term) => term.amp);
    expect(amps.every((amp, idx) => idx === 0 || amp <= amps[idx - 1])).toBe(true);
  });
});

describe('fourierEngine helpers', () => {
  it('downsamples long paths', () => {
    const longPath = Array.from({ length: 1000 }).map((_, i) => ({ x: i, y: 0 }));
    const result = downsamplePoints(longPath, 100);
    expect(result.length).toBeLessThan(longPath.length);
    expect(result.length).toBeGreaterThan(90);
  });

  it('prepares points with smoothing and limiting', () => {
    const longPath = Array.from({ length: 20 }).map((_, i) => ({ x: i * 10, y: i % 2 === 0 ? 10 : -10 }));
    const prepared = preparePoints(longPath, 2, 10);
    expect(prepared.length).toBeLessThanOrEqual(10);
    expect(Math.abs(prepared[1].y)).toBeLessThanOrEqual(10); // smoothing reduces oscillation
  });

  it('computes spectrum with matching length', () => {
    const path = generateCircle().slice(0, 50);
    const { prepared, spectrum } = computeFourier(path, { smoothing: 1, limit: 60 });
    expect(spectrum.length).toBe(prepared.length);
    expect(spectrum[0].amp).toBeGreaterThan(0);
  });

  it('does not mutate original input when preparing points', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: -5 }
    ];
    const snapshot = original.map((p) => ({ ...p }));
    const prepared = preparePoints(original, -2, 10);
    expect(original).toEqual(snapshot);
    expect(prepared).not.toBe(original);
  });

  it('handles empty inputs gracefully', () => {
    const { prepared, spectrum } = computeFourier([], { smoothing: 1, limit: 20 });
    expect(prepared).toEqual([]);
    expect(spectrum).toEqual([]);
  });
});
