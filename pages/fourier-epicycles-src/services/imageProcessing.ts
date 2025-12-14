import { Point } from '../types';

export interface EdgeProcessingOptions {
  threshold?: number;
  sampleRate?: number;
  maxPoints?: number;
  smoothingWindow?: number;
  blurRadius?: number;
  morphRadius?: number;
}

const defaultOptions: Required<EdgeProcessingOptions> = {
  threshold: 30,
  sampleRate: 2,
  maxPoints: 1500,
  smoothingWindow: 4,
  blurRadius: 1,
  morphRadius: 2
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

export const extractEdgePath = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: EdgeProcessingOptions = {}
): Point[] => {
  const { threshold, sampleRate, maxPoints, smoothingWindow, blurRadius, morphRadius } = { ...defaultOptions, ...opts };

  const { gray: rawGray, w, h, step } = downsampleGrayscale(data, width, height, sampleRate);
  const gray = boxBlurGray(rawGray, w, h, blurRadius);

  const candidates: Uint8Array[] = [];

  const otsu = otsuThreshold(gray);
  const maskDark = buildMaskFromOtsu(gray, otsu, true);
  const maskLight = buildMaskFromOtsu(gray, otsu, false);
  candidates.push(maskDark, maskLight);
  candidates.push(buildMaskFromBackgroundDiff(gray, w, h, threshold));
  candidates.push(buildMaskFromSobel(gray, w, h));

  const total = w * h || 1;
  let bestContour: Array<{ x: number; y: number }> = [];

  for (const candidate of candidates) {
    const filled = closeMask(candidate, w, h, morphRadius);
    const reduced = keepLargestComponent(filled, w, h);
    const on = countOn(reduced);
    const ratio = on / total;
    if (ratio < 0.002 || ratio > 0.9) continue;

    const contour = traceContour(reduced, w, h);
    if (contour.length > bestContour.length) {
      bestContour = contour;
    }
  }

  if (bestContour.length >= 8) {
    const points = toPoints(bestContour, width, height, step, maxPoints);
    return closeLoop(smoothClosed(points, smoothingWindow));
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

  return smoothedLegacy;
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
