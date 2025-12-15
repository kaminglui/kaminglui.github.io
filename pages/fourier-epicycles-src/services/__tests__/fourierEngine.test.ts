import { describe, expect, it } from 'vitest';
import { computeFourier } from '../fourierEngine';
import { Point } from '../../types';

describe('computeFourier', () => {
  it('upsamples open paths to a minimum resolution', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 }
    ];

    const { prepared, spectrum } = computeFourier(points, { smoothing: 0, limit: 500 });
    expect(prepared.length).toBeGreaterThanOrEqual(300);
    expect(prepared.length).toBeLessThanOrEqual(500);
    expect(spectrum.length).toBe(prepared.length);
    expect(prepared.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('upsamples closed loops to a higher minimum resolution', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
      { x: 0, y: 0 }
    ];

    const { prepared, spectrum } = computeFourier(points, { smoothing: 0, limit: 1200 });
    expect(prepared.length).toBeGreaterThanOrEqual(600);
    expect(prepared.length).toBeLessThanOrEqual(1200);
    expect(spectrum.length).toBe(prepared.length);
    const start = prepared[0];
    const end = prepared[prepared.length - 1];
    expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(5);
  });
});
