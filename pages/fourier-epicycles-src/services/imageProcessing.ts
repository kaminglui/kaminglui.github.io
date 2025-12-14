import { Point } from '../types';

export interface EdgeProcessingOptions {
  threshold?: number;
  sampleRate?: number;
  maxPoints?: number;
  smoothingWindow?: number;
  blurRadius?: number;
  morphRadius?: number;
  detail?: number;
}

const defaultOptions: Required<EdgeProcessingOptions> = {
  threshold: 30,
  sampleRate: 2,
  maxPoints: 1500,
  smoothingWindow: 4,
  blurRadius: 1,
  morphRadius: 2,
  detail: 0.9
};

const buildPath = (points: Point[]): Point[] => {
  if (points.length === 0) return [];

  const sortedPoints: Point[] = [];
  const visited = new Set<number>();
  let currentIdx = 0; // Start at first point

  sortedPoints.push(points[0]);
  visited.add(0);

  while (sortedPoints.length < points.length) {
    let nearestDist = Infinity;
    let nearestIdx = -1;
    
    const currentPoint = points[currentIdx];

    for (let i = 0; i < points.length; i++) {
      if (!visited.has(i)) {
        const p = points[i];
        const d = (currentPoint.x - p.x) ** 2 + (currentPoint.y - p.y) ** 2;
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
    }

    if (nearestIdx !== -1) {
      visited.add(nearestIdx);
      sortedPoints.push(points[nearestIdx]);
      currentIdx = nearestIdx;
    } else {
      break;
    }
  }

  return sortedPoints;
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const downsampleGrayscale = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sampleRate: number
): { gray: Uint8Array; w: number; h: number; step: number } => {
  const step = Math.max(1, Math.floor(sampleRate || 1));
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const gray = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const srcY = clampInt(y * step, 0, height - 1);
    for (let x = 0; x < w; x++) {
      const srcX = clampInt(x * step, 0, width - 1);
      const idx = (srcY * width + srcX) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      gray[y * w + x] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }

  return { gray, w, h, step };
};

const boxBlurGray = (src: Uint8Array, w: number, h: number, radius: number): Uint8Array => {
  const r = Math.max(0, Math.floor(radius || 0));
  if (r === 0 || w * h === 0) return src;

  const dst = new Uint8Array(w * h);
  const windowSize = (2 * r + 1) * (2 * r + 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clampInt(y + dy, 0, h - 1);
        for (let dx = -r; dx <= r; dx++) {
          const xx = clampInt(x + dx, 0, w - 1);
          sum += src[yy * w + xx] ?? 0;
        }
      }
      dst[y * w + x] = Math.round(sum / windowSize);
    }
  }

  return dst;
};

const otsuThreshold = (gray: Uint8Array): number => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length || 1;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxBetween = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    const count = hist[t];
    wB += count;
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * count;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxBetween) {
      maxBetween = between;
      threshold = t;
    }
  }

  return threshold;
};

const meanBorderGray = (gray: Uint8Array, w: number, h: number) => {
  if (w === 0 || h === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let x = 0; x < w; x++) {
    sum += gray[x] ?? 0;
    sum += gray[(h - 1) * w + x] ?? 0;
    count += 2;
  }
  for (let y = 1; y < h - 1; y++) {
    sum += gray[y * w] ?? 0;
    sum += gray[y * w + (w - 1)] ?? 0;
    count += 2;
  }
  return count > 0 ? sum / count : 0;
};

const dilateMask = (mask: Uint8Array, w: number, h: number, radius: number): Uint8Array => {
  const r = Math.max(1, Math.floor(radius || 1));
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
};

const erodeMask = (mask: Uint8Array, w: number, h: number, radius: number): Uint8Array => {
  const r = Math.max(1, Math.floor(radius || 1));
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let dy = -r; dy <= r && on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          on = 0;
          break;
        }
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !mask[yy * w + xx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
};

const closeMask = (mask: Uint8Array, w: number, h: number, radius: number): Uint8Array => {
  const r = Math.max(1, Math.floor(radius || 1));
  return erodeMask(dilateMask(mask, w, h, r), w, h, r);
};

const keepLargestComponent = (mask: Uint8Array, w: number, h: number): Uint8Array => {
  const visited = new Uint8Array(mask.length);
  let best: number[] = [];
  const stack: number[] = [];

  const pushIf = (idx: number) => {
    if (idx < 0 || idx >= mask.length) return;
    if (!mask[idx] || visited[idx]) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;

    const component: number[] = [];
    stack.length = 0;
    visited[i] = 1;
    stack.push(i);

    while (stack.length) {
      const idx = stack.pop()!;
      component.push(idx);
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) pushIf(idx - 1);
      if (x < w - 1) pushIf(idx + 1);
      if (y > 0) pushIf(idx - w);
      if (y < h - 1) pushIf(idx + w);
    }

    if (component.length > best.length) best = component;
  }

  const out = new Uint8Array(mask.length);
  best.forEach((idx) => {
    out[idx] = 1;
  });
  return out;
};

const hasBoundaryNeighbor = (mask: Uint8Array, w: number, h: number, x: number, y: number): boolean => {
  const idx = y * w + x;
  if (!mask[idx]) return false;
  const left = x > 0 ? mask[idx - 1] : 0;
  const right = x < w - 1 ? mask[idx + 1] : 0;
  const up = y > 0 ? mask[idx - w] : 0;
  const down = y < h - 1 ? mask[idx + w] : 0;
  return !(left && right && up && down);
};

const traceContour = (mask: Uint8Array, w: number, h: number): Array<{ x: number; y: number }> => {
  if (w < 2 || h < 2) return [];
  let startX = -1;
  let startY = -1;

  for (let y = 0; y < h && startX === -1; y++) {
    for (let x = 0; x < w; x++) {
      if (hasBoundaryNeighbor(mask, w, h, x, y)) {
        startX = x;
        startY = y;
        break;
      }
    }
  }

  if (startX === -1 || startY === -1) return [];

  const dirs: Array<[number, number]> = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ];

  const dirIndex = (dx: number, dy: number) =>
    dirs.findIndex((d) => d[0] === dx && d[1] === dy);

  const isOn = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    return mask[y * w + x] === 1;
  };

  const start = { x: startX, y: startY };
  const b0 = { x: startX - 1, y: startY };
  let p = { ...start };
  let b = { ...b0 };
  const contour: Array<{ x: number; y: number }> = [{ ...p }];

  const maxSteps = w * h * 4;
  for (let steps = 0; steps < maxSteps; steps++) {
    const dx = Math.sign(b.x - p.x);
    const dy = Math.sign(b.y - p.y);
    const backDir = dirIndex(dx, dy);
    const startDir = backDir === -1 ? 0 : (backDir + 1) % 8;

    let found = false;
    let next = { x: p.x, y: p.y };
    let nextBack = { x: b.x, y: b.y };

    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = p.x + dirs[d][0];
      const ny = p.y + dirs[d][1];
      if (isOn(nx, ny)) {
        next = { x: nx, y: ny };
        const bd = (d + 7) % 8;
        nextBack = { x: p.x + dirs[bd][0], y: p.y + dirs[bd][1] };
        found = true;
        break;
      }
    }

    if (!found) break;
    p = next;
    b = nextBack;
    contour.push({ ...p });

    if (p.x === start.x && p.y === start.y && b.x === b0.x && b.y === b0.y) {
      break;
    }
  }

  return contour;
};

const smoothClosed = (points: Point[], windowSize: number): Point[] => {
  const w = Math.max(0, Math.floor(windowSize || 0));
  if (w <= 0 || points.length < 3) return points;
  const out: Point[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let j = -w; j <= w; j++) {
      const idx = (i + j + n) % n;
      sumX += points[idx].x;
      sumY += points[idx].y;
      count++;
    }
    out.push({ x: sumX / count, y: sumY / count });
  }
  return out;
};

const toPoints = (
  contour: Array<{ x: number; y: number }>,
  originalW: number,
  originalH: number,
  step: number,
  maxPoints: number
): Point[] => {
  if (!contour.length) return [];

  const decimation = contour.length > maxPoints ? Math.ceil(contour.length / maxPoints) : 1;
  const points: Point[] = [];
  for (let i = 0; i < contour.length; i += decimation) {
    const p = contour[i];
    const x = p.x * step - originalW / 2;
    const y = p.y * step - originalH / 2;
    points.push({ x, y });
  }

  return points;
};

const closeLoop = (points: Point[]): Point[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) return points;
  return [...points, { ...first }];
};

const buildMaskFromOtsu = (gray: Uint8Array, thr: number, pickDark: boolean): Uint8Array => {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    out[i] = pickDark ? (v <= thr ? 1 : 0) : (v >= thr ? 1 : 0);
  }
  return out;
};

const buildMaskFromBackgroundDiff = (
  gray: Uint8Array,
  w: number,
  h: number,
  delta: number
): Uint8Array => {
  const border = meanBorderGray(gray, w, h);
  const d = Math.max(1, Math.floor(delta));
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.abs(gray[i] - border) >= d ? 1 : 0;
  }
  return out;
};

const buildMaskFromSobel = (gray: Uint8Array, w: number, h: number): Uint8Array => {
  if (w < 3 || h < 3) return new Uint8Array(gray.length);
  const mag = new Uint16Array(gray.length);
  const hist = new Uint32Array(1025);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const a00 = gray[idx - w - 1];
      const a01 = gray[idx - w];
      const a02 = gray[idx - w + 1];
      const a10 = gray[idx - 1];
      const a12 = gray[idx + 1];
      const a20 = gray[idx + w - 1];
      const a21 = gray[idx + w];
      const a22 = gray[idx + w + 1];

      const gx = -a00 + a02 - 2 * a10 + 2 * a12 - a20 + a22;
      const gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
      const m = Math.min(1024, Math.abs(gx) + Math.abs(gy));
      mag[idx] = m;
      hist[m]++;
    }
  }

  const total = (w - 2) * (h - 2);
  let target = Math.floor(total * 0.08);
  target = clampInt(target, 50, total);

  let cumulative = 0;
  let threshold = 1024;
  for (let v = 1024; v >= 0; v--) {
    cumulative += hist[v];
    if (cumulative >= target) {
      threshold = v;
      break;
    }
  }

  const out = new Uint8Array(gray.length);
  for (let i = 0; i < mag.length; i++) {
    out[i] = mag[i] >= threshold && mag[i] > 0 ? 1 : 0;
  }
  return out;
};

const countOn = (mask: Uint8Array) => {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i] ? 1 : 0;
  return count;
};

const gaussianKernel1D = (sigma: number): Float32Array => {
  const s = Math.max(0.01, sigma);
  const radius = Math.max(1, Math.ceil(3 * s));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const denom = 2 * s * s;
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / denom);
    kernel[i + radius] = weight;
    sum += weight;
  }

  if (sum > 0) {
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  }

  return kernel;
};

const gaussianBlurGray = (src: Uint8Array, w: number, h: number, sigma: number): Float32Array => {
  const n = w * h;
  const s = Math.max(0, sigma);
  if (n === 0) return new Float32Array(0);

  if (s <= 0.01) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = src[i];
    return out;
  }

  const kernel = gaussianKernel1D(s);
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(n);
  const out = new Float32Array(n);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = clampInt(x + k, 0, w - 1);
        acc += kernel[k + radius] * (src[row + xx] ?? 0);
      }
      tmp[row + x] = acc;
    }
  }

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = clampInt(y + k, 0, h - 1);
        acc += kernel[k + radius] * (tmp[yy * w + x] ?? 0);
      }
      out[row + x] = acc;
    }
  }

  return out;
};

const buildDoGEdgeMask = (
  gray: Uint8Array,
  w: number,
  h: number,
  detail: number,
  blurRadius: number
): Uint8Array => {
  const n = w * h;
  if (w < 3 || h < 3 || n === 0) return new Uint8Array(n);

  const minDim = Math.min(w, h);
  const blurScale = Math.max(0.35, blurRadius || 1);
  const baseSigma = lerp(2.4, 0.7, detail) * blurScale;
  const maxSigma = Math.max(0.35, minDim / 4);
  const sigma1 = Math.min(Math.max(0.35, baseSigma), maxSigma);
  const sigma2 = Math.min(Math.max(sigma1 * 1.6, sigma1 + 0.15), maxSigma * 1.6);

  const b1 = gaussianBlurGray(gray, w, h, sigma1);
  const b2 = gaussianBlurGray(gray, w, h, sigma2);
  const dog = new Float32Array(n);
  for (let i = 0; i < n; i++) dog[i] = b1[i] - b2[i];

  const strength = new Uint16Array(n);
  const hist = new Uint32Array(1025);
  let nonZero = 0;

  const qScale = 4;
  const offsets = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const v = dog[idx];
      const s0 = v >= 0;
      let best = 0;

      for (let i = 0; i < offsets.length; i++) {
        const nIdx = idx + offsets[i];
        const nv = dog[nIdx];
        if ((nv >= 0) === s0) continue;
        const diff = Math.abs(v - nv);
        if (diff > best) best = diff;
      }

      if (best > 0) {
        const q = clampInt(Math.round(best * qScale), 0, 1024);
        strength[idx] = q;
        hist[q]++;
        nonZero++;
      }
    }
  }

  if (nonZero === 0) return new Uint8Array(n);

  const strongFraction = lerp(0.02, 0.08, detail);
  const desiredStrong = clampInt(Math.floor(nonZero * strongFraction), 1, nonZero);

  let cumulative = 0;
  let high = 1024;
  for (let v = 1024; v >= 1; v--) {
    cumulative += hist[v];
    if (cumulative >= desiredStrong) {
      high = v;
      break;
    }
  }

  const lowRatio = lerp(0.6, 0.22, detail);
  const low = Math.max(1, Math.floor(high * lowRatio));

  const edges = new Uint8Array(n);
  const stack: number[] = [];

  for (let idx = 0; idx < n; idx++) {
    if (strength[idx] >= high) {
      edges[idx] = 1;
      stack.push(idx);
    }
  }

  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;

    for (let d = 0; d < 8; d++) {
      const nx = x + dx[d];
      const ny = y + dy[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (edges[nIdx]) continue;
      if (strength[nIdx] >= low) {
        edges[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  return edges;
};

const buildCannyEdgeMask = (gray: Uint8Array, w: number, h: number, detail: number): Uint8Array => {
  if (w < 3 || h < 3) return new Uint8Array(gray.length);

  const mag = new Uint16Array(w * h);
  const dir = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;

      const a00 = gray[idx - w - 1];
      const a01 = gray[idx - w];
      const a02 = gray[idx - w + 1];
      const a10 = gray[idx - 1];
      const a12 = gray[idx + 1];
      const a20 = gray[idx + w - 1];
      const a21 = gray[idx + w];
      const a22 = gray[idx + w + 1];

      const gx = -a00 + a02 - 2 * a10 + 2 * a12 - a20 + a22;
      const gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
      const absGx = Math.abs(gx);
      const absGy = Math.abs(gy);

      const m = Math.min(1024, absGx + absGy);
      mag[idx] = m;

      let d = 0;
      if (absGx >= absGy) {
        if (absGy * 2 <= absGx) {
          d = 0;
        } else {
          d = gx * gy >= 0 ? 1 : 3;
        }
      } else {
        if (absGx * 2 <= absGy) {
          d = 2;
        } else {
          d = gx * gy >= 0 ? 1 : 3;
        }
      }
      dir[idx] = d;
    }
  }

  const nms = new Uint16Array(w * h);
  const hist = new Uint32Array(1025);
  let nonZero = 0;

  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const m = mag[idx];
      if (m === 0) continue;

      const d = dir[idx];
      let m1 = 0;
      let m2 = 0;
      if (d === 0) {
        m1 = mag[idx - 1];
        m2 = mag[idx + 1];
      } else if (d === 2) {
        m1 = mag[idx - w];
        m2 = mag[idx + w];
      } else if (d === 1) {
        m1 = mag[idx - w + 1];
        m2 = mag[idx + w - 1];
      } else {
        m1 = mag[idx - w - 1];
        m2 = mag[idx + w + 1];
      }

      if (m >= m1 && m >= m2) {
        nms[idx] = m;
        hist[m]++;
        nonZero++;
      }
    }
  }

  if (nonZero === 0) return new Uint8Array(gray.length);

  const strongFraction = lerp(0.02, 0.1, detail);
  const desiredStrong = clampInt(Math.floor(nonZero * strongFraction), 1, nonZero);

  let cumulative = 0;
  let high = 1024;
  for (let v = 1024; v >= 1; v--) {
    cumulative += hist[v];
    if (cumulative >= desiredStrong) {
      high = v;
      break;
    }
  }

  const lowRatio = lerp(0.55, 0.25, detail);
  const low = Math.max(1, Math.floor(high * lowRatio));

  const edges = new Uint8Array(w * h);
  const stack: number[] = [];

  for (let idx = 0; idx < nms.length; idx++) {
    if (nms[idx] >= high) {
      edges[idx] = 1;
      stack.push(idx);
    }
  }

  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;

    for (let d = 0; d < 8; d++) {
      const nx = x + dx[d];
      const ny = y + dy[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (edges[nIdx]) continue;
      if (nms[nIdx] >= low) {
        edges[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  return edges;
};

const edgeMaskToPolylines = (mask: Uint8Array, w: number, h: number): number[][] => {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const opp = [4, 5, 6, 7, 0, 1, 2, 3];

  const degree = new Uint8Array(mask.length);
  const edgeIndices: number[] = [];

  for (let idx = 0; idx < mask.length; idx++) {
    if (!mask[idx]) continue;
    const x = idx % w;
    const y = (idx - x) / w;
    let deg = 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + dx[d];
      const ny = y + dy[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (mask[ny * w + nx]) deg++;
    }
    degree[idx] = deg;
    if (deg > 0) edgeIndices.push(idx);
  }

  const used = new Uint8Array(mask.length);
  const polylines: number[][] = [];

  const hasNeighbor = (idx: number, d: number) => {
    const x = idx % w;
    const y = (idx - x) / w;
    const nx = x + dx[d];
    const ny = y + dy[d];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return -1;
    const nIdx = ny * w + nx;
    return mask[nIdx] ? nIdx : -1;
  };

  const markUsed = (a: number, d: number, b: number) => {
    used[a] |= 1 << d;
    used[b] |= 1 << opp[d];
  };

  const traceChain = (startIdx: number, startDir: number, stopAtBranch: boolean) => {
    const firstNeighbor = hasNeighbor(startIdx, startDir);
    if (firstNeighbor < 0) return [];

    const poly: number[] = [startIdx];
    let prevDir = startDir;
    let curIdx = firstNeighbor;
    markUsed(startIdx, startDir, curIdx);
    poly.push(curIdx);

    const maxSteps = w * h * 2;
    for (let steps = 0; steps < maxSteps; steps++) {
      const deg = degree[curIdx];
      if (stopAtBranch && deg !== 2) break;

      const backDir = opp[prevDir];
      let nextDir = -1;
      for (let d = 0; d < 8; d++) {
        if (d === backDir) continue;
        const nIdx = hasNeighbor(curIdx, d);
        if (nIdx >= 0) {
          nextDir = d;
          break;
        }
      }
      if (nextDir < 0) break;
      if (used[curIdx] & (1 << nextDir)) break;

      const nextIdx = hasNeighbor(curIdx, nextDir);
      if (nextIdx < 0) break;
      markUsed(curIdx, nextDir, nextIdx);
      curIdx = nextIdx;
      prevDir = nextDir;
      poly.push(curIdx);
      if (!stopAtBranch && curIdx === startIdx) break;
    }

    return poly;
  };

  for (const idx of edgeIndices) {
    const deg = degree[idx];
    if (deg === 0 || deg === 2) continue;
    for (let d = 0; d < 8; d++) {
      const nIdx = hasNeighbor(idx, d);
      if (nIdx < 0) continue;
      if (used[idx] & (1 << d)) continue;
      const poly = traceChain(idx, d, true);
      if (poly.length > 1) polylines.push(poly);
    }
  }

  for (const idx of edgeIndices) {
    for (let d = 0; d < 8; d++) {
      const nIdx = hasNeighbor(idx, d);
      if (nIdx < 0) continue;
      if (used[idx] & (1 << d)) continue;
      const poly = traceChain(idx, d, false);
      if (poly.length > 1) {
        if (poly[0] === poly[poly.length - 1]) {
          polylines.push(poly);
        } else {
          polylines.push([...poly, poly[0]]);
        }
      }
    }
  }

  return polylines;
};

const idxToPoint = (idx: number, w: number, step: number, originalW: number, originalH: number): Point => {
  const x = idx % w;
  const y = (idx - x) / w;
  return { x: x * step - originalW / 2, y: y * step - originalH / 2 };
};

const dedupeConsecutive = (points: Point[]): Point[] => {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const p = points[i];
    if (prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  return out;
};

const simplifyRDP = (points: Point[], epsilon: number): Point[] => {
  if (points.length < 3 || epsilon <= 0) return points;

  const epsilonSq = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const distSqPointToSegment = (p: Point, a: Point, b: Point) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return wx * wx + wy * wy;
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      return dx * dx + dy * dy;
    }
    const t = c1 / c2;
    const projX = a.x + t * vx;
    const projY = a.y + t * vy;
    const dx = p.x - projX;
    const dy = p.y - projY;
    return dx * dx + dy * dy;
  };

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistSq = 0;
    let idx = -1;
    const a = points[start];
    const b = points[end];
    for (let i = start + 1; i < end; i++) {
      const dSq = distSqPointToSegment(points[i], a, b);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        idx = i;
      }
    }
    if (idx !== -1 && maxDistSq > epsilonSq) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }

  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
};

const joinPolylines = (polylines: Point[][], detail: number): Point[] => {
  if (polylines.length === 0) return [];
  const remaining = [...polylines].sort((a, b) => b.length - a.length);
  let path: Point[] = [...remaining.shift()!];

  const distSq = (a: Point, b: Point) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const bridgeSteps = clampInt(Math.round(lerp(2, 10, detail)), 2, 12);

  while (remaining.length) {
    const end = path[path.length - 1];
    let bestIdx = 0;
    let bestReverse = false;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const poly = remaining[i];
      const dStart = distSq(end, poly[0]);
      const dEnd = distSq(end, poly[poly.length - 1]);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestReverse = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        bestIdx = i;
        bestReverse = true;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    if (bestReverse) next.reverse();

    const start = next[0];
    const dx = start.x - end.x;
    const dy = start.y - end.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
      for (let i = 1; i <= bridgeSteps; i++) {
        const t = i / (bridgeSteps + 1);
        path.push({ x: end.x + dx * t, y: end.y + dy * t });
      }
    }

    if (path[path.length - 1].x === start.x && path[path.length - 1].y === start.y) {
      path.push(...next.slice(1));
    } else {
      path.push(...next);
    }
  }

  return path;
};

const resampleClosedPath = (points: Point[], targetCount: number): Point[] => {
  const target = Math.max(8, Math.floor(targetCount));
  const closed = closeLoop(dedupeConsecutive(points));
  if (closed.length < 4) return closed;
  const loop = closed.slice(0, -1);
  const n = loop.length;

  const segLens = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    segLens[i] = d;
    total += d;
  }

  if (!Number.isFinite(total) || total <= 0) {
    return closeLoop(loop);
  }

  const stepLen = total / target;
  const out: Point[] = [{ ...loop[0] }];
  let segIdx = 0;
  let segStart = loop[0];
  let segEnd = loop[1 % n];
  let segLen = segLens[0];
  let distAcc = 0;
  let nextDist = stepLen;

  const maxIter = target * (n + 4);
  let guard = 0;
  while (out.length < target && guard++ < maxIter) {
    if (segLen === 0) {
      segIdx = (segIdx + 1) % n;
      segStart = loop[segIdx];
      segEnd = loop[(segIdx + 1) % n];
      segLen = segLens[segIdx];
      continue;
    }

    if (distAcc + segLen >= nextDist - 1e-9) {
      const t = (nextDist - distAcc) / segLen;
      out.push({
        x: segStart.x + (segEnd.x - segStart.x) * t,
        y: segStart.y + (segEnd.y - segStart.y) * t
      });
      nextDist += stepLen;
    } else {
      distAcc += segLen;
      segIdx = (segIdx + 1) % n;
      segStart = loop[segIdx];
      segEnd = loop[(segIdx + 1) % n];
      segLen = segLens[segIdx];
    }
  }

  if (out.length > target) out.length = target;
  return closeLoop(out);
};

export const extractEdgePath = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: EdgeProcessingOptions = {}
): Point[] => {
  const merged = { ...defaultOptions, ...opts };
  const detail = clamp01(merged.detail);
  const sampleRate = typeof opts.sampleRate === 'number'
    ? Math.max(1, Math.floor(merged.sampleRate))
    : detail >= 0.88
      ? 1
      : detail >= 0.55
        ? 2
        : 3;
  const maxPoints = Math.max(200, Math.floor(merged.maxPoints));
  const smoothingWindow = Math.max(0, Math.floor(merged.smoothingWindow));
  const blurRadius = Math.max(0, Math.floor(merged.blurRadius));
  const morphRadius = Math.max(0, Math.floor(merged.morphRadius));
  const threshold = Math.max(1, Math.floor(merged.threshold));

  const { gray: rawGray, w, h, step } = downsampleGrayscale(data, width, height, sampleRate);
  const gray = rawGray;

  let edgeMask = buildDoGEdgeMask(gray, w, h, detail, blurRadius);
  if (countOn(edgeMask) < Math.max(10, Math.floor(w * h * 0.001))) {
    edgeMask = buildMaskFromSobel(gray, w, h);
  }
  if (morphRadius > 0) {
    edgeMask = closeMask(edgeMask, w, h, morphRadius);
  }

  const polylinesIdx = edgeMaskToPolylines(edgeMask, w, h);
  const minSegment = clampInt(Math.round(lerp(40, 10, detail)), 6, 80);
  const epsilon = lerp(6, 1.2, detail) * step;

  const polylines: Point[][] = polylinesIdx
    .filter((poly) => poly.length >= minSegment)
    .map((poly) => poly.map((idx) => idxToPoint(idx, w, step, width, height)))
    .map((poly) => {
      const cleaned = dedupeConsecutive(poly);
      const closed = cleaned.length > 2 && cleaned[0].x === cleaned[cleaned.length - 1].x && cleaned[0].y === cleaned[cleaned.length - 1].y;
      if (closed) {
        const open = cleaned.slice(0, -1);
        return closeLoop(simplifyRDP(open, epsilon));
      }
      return simplifyRDP(cleaned, epsilon);
    })
    .filter((poly) => poly.length >= 2);

  if (polylines.length > 0) {
    const joined = joinPolylines(polylines, detail);
    const closed = closeLoop(dedupeConsecutive(joined));
    const smoothed = smoothingWindow > 0 ? smoothClosed(closed, smoothingWindow) : closed;
    const target = clampInt(Math.round(lerp(400, maxPoints, detail)), 120, maxPoints);
    return resampleClosedPath(smoothed, target);
  }

  const legacyPoints: Point[] = [];
  const getBrightness = (idx: number) => (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

  for (let y = 0; y < height; y += sampleRate) {
    for (let x = 0; x < width; x += sampleRate) {
      if (x <= 0 || y <= 0) continue;
      const idx = (y * width + x) * 4;
      const leftIdx = (y * width + (x - 1)) * 4;
      const topIdx = ((y - 1) * width + x) * 4;
      const b = getBrightness(idx);
      const bLeft = getBrightness(leftIdx);
      const bTop = getBrightness(topIdx);
      const diff = Math.abs(b - bLeft) + Math.abs(b - bTop);
      if (diff > threshold) {
        legacyPoints.push({ x: x - width / 2, y: y - height / 2 });
      }
    }
  }

  if (legacyPoints.length === 0) return [];

  const stepLegacy = legacyPoints.length > maxPoints ? Math.ceil(legacyPoints.length / maxPoints) : 1;
  const limitedLegacy = stepLegacy === 1 ? legacyPoints : legacyPoints.filter((_, idx) => idx % stepLegacy === 0);
  const orderedLegacy = buildPath(limitedLegacy);

  const smoothedLegacy: Point[] = [];
  for (let i = 0; i < orderedLegacy.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let j = -smoothingWindow; j <= smoothingWindow; j++) {
      const idx = (i + j + orderedLegacy.length) % orderedLegacy.length;
      sumX += orderedLegacy[idx].x;
      sumY += orderedLegacy[idx].y;
      count++;
    }
    smoothedLegacy.push({ x: sumX / count, y: sumY / count });
  }

  return closeLoop(smoothedLegacy);
};

export const processImage = async (file: File, maxDimension: number = 900, opts: EdgeProcessingOptions = {}): Promise<Point[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      let width = img.width;
      let height = img.height;
      const maxSide = Math.max(width, height);
      const safeMax = maxDimension && maxDimension > 0 ? maxDimension : 900;
      if (maxSide > safeMax) {
        const ratio = safeMax / maxSide;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = true;
      (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const points = extractEdgePath(imageData.data, width, height, opts);

      URL.revokeObjectURL(url);
      resolve(points);
    };

    img.onerror = (err) => reject(err);

    img.src = url;
  });
};
