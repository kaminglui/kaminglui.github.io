import { Complex, FourierTerm, Point } from '../types';
import { dft, smoothPoints } from './mathUtils';

const DEFAULT_LIMIT = 500;

const toComplex = (pts: Point[]): Complex[] =>
  pts.map((p) => ({ re: p.x, im: p.y }));

const clampLimit = (limit?: number) => (limit && limit > 0 ? limit : DEFAULT_LIMIT);

export const downsamplePoints = (points: Point[], limit: number = DEFAULT_LIMIT): Point[] => {
  const safeLimit = clampLimit(limit);
  if (points.length <= safeLimit) return [...points];

  const step = Math.ceil(points.length / safeLimit);
  return points.filter((_, idx) => idx % step === 0);
};

export const preparePoints = (points: Point[], smoothing: number, limit: number = DEFAULT_LIMIT): Point[] => {
  const trimmed = downsamplePoints(points, limit);
  return smoothPoints(trimmed, smoothing);
};

export const computeFourier = (
  points: Point[],
  options: { smoothing?: number; limit?: number } = {}
): { prepared: Point[]; spectrum: FourierTerm[] } => {
  const { smoothing = 0, limit = DEFAULT_LIMIT } = options;
  const prepared = preparePoints(points, smoothing, limit);
  const spectrum = dft(toComplex(prepared));

  return { prepared, spectrum };
};

export { toComplex as pointsToComplex };
