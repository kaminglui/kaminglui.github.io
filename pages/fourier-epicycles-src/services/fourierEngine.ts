import { Complex, FourierTerm, Point } from '../types';
import { dft, smoothPoints } from './mathUtils';

const DEFAULT_LIMIT = 1500;
const MIN_RESAMPLE_OPEN = 120;
const MIN_RESAMPLE_CLOSED = 200;

const toComplex = (pts: Point[]): Complex[] =>
  pts.map((p) => ({ re: p.x, im: p.y }));

const clampLimit = (limit?: number) => (limit && limit > 0 ? limit : DEFAULT_LIMIT);

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clampInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

const boundsDiag = (points: Point[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return 0;
  }
  return Math.hypot(maxX - minX, maxY - minY);
};

const isLikelyClosedLoop = (points: Point[]) => {
  if (points.length < 3) return false;
  const start = points[0];
  const end = points[points.length - 1];
  const diag = boundsDiag(points);
  const threshold = Math.max(10, diag * 0.04);
  return dist(start, end) <= threshold;
};

const dedupePoints = (points: Point[], minStep = 0.25): Point[] => {
  if (points.length < 2) return [...points];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const next = points[i];
    if (dist(prev, next) >= minStep) out.push(next);
  }
  return out;
};

const resamplePath = (points: Point[], targetCount: number, closed: boolean): Point[] => {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...points[0] }];

  const target = clampInt(targetCount, 2, 10_000);
  const segCount = closed ? n : n - 1;
  const segLens = new Array<number>(segCount);
  let total = 0;

  for (let i = 0; i < segCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = dist(a, b);
    segLens[i] = len;
    total += len;
  }

  if (total <= 0) {
    return Array.from({ length: target }, () => ({ ...points[0] }));
  }

  const step = total / (closed ? target : target - 1);
  const result: Point[] = [];

  const sampleAt = (distanceAlong: number) => {
    let segIdx = 0;
    let acc = 0;
    while (segIdx < segCount - 1 && acc + segLens[segIdx] < distanceAlong) {
      acc += segLens[segIdx];
      segIdx++;
    }

    const a = points[segIdx];
    const b = points[(segIdx + 1) % n];
    const segLen = segLens[segIdx] || 1;
    const t = Math.max(0, Math.min(1, (distanceAlong - acc) / segLen));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  if (closed) {
    for (let i = 0; i < target; i++) {
      result.push(sampleAt(step * i));
    }
    return result;
  }

  result.push({ ...points[0] });
  for (let i = 1; i < target - 1; i++) {
    result.push(sampleAt(step * i));
  }
  result.push({ ...points[n - 1] });
  return result;
};

const smoothPointsCircular = (points: Point[], windowSize: number): Point[] => {
  if (windowSize <= 0 || points.length < 2) return [...points];
  const n = points.length;
  const win = clampInt(windowSize, 1, Math.floor(n / 2));
  const out: Point[] = [];

  for (let i = 0; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let j = -win; j <= win; j++) {
      const idx = (i + j + n) % n;
      sumX += points[idx].x;
      sumY += points[idx].y;
      count++;
    }
    out.push({ x: sumX / count, y: sumY / count });
  }
  return out;
};

export const downsamplePoints = (points: Point[], limit: number = DEFAULT_LIMIT): Point[] => {
  const safeLimit = clampLimit(limit);
  if (points.length <= safeLimit) return [...points];

  const step = Math.ceil(points.length / safeLimit);
  return points.filter((_, idx) => idx % step === 0);
};

export const preparePoints = (points: Point[], smoothing: number, limit: number = DEFAULT_LIMIT): Point[] => {
  const safeLimit = clampLimit(limit);
  const cleaned = dedupePoints(points);
  if (cleaned.length === 0) return [];

  const closed = isLikelyClosedLoop(cleaned);
  const minTarget = closed ? MIN_RESAMPLE_CLOSED : MIN_RESAMPLE_OPEN;
  const target = Math.min(safeLimit, Math.max(cleaned.length, minTarget));
  const resampled = resamplePath(cleaned, target, closed);

  const window = smoothing > 0 ? clampInt(smoothing, 0, 999) : 0;
  return closed ? smoothPointsCircular(resampled, window) : smoothPoints(resampled, window);
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
