import { Point } from '../types';

export interface EdgeProcessingOptions {
  threshold?: number;
  sampleRate?: number;
  maxPoints?: number;
  smoothingWindow?: number;
}

const defaultOptions: Required<EdgeProcessingOptions> = {
  threshold: 30,
  sampleRate: 3,
  maxPoints: 1500,
  smoothingWindow: 4
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

export const extractEdgePath = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: EdgeProcessingOptions = {}
): Point[] => {
  const { threshold, sampleRate, maxPoints, smoothingWindow } = { ...defaultOptions, ...opts };
  const points: Point[] = [];

  const getBrightness = (idx: number) => (data[idx] + data[idx+1] + data[idx+2]) / 3;

  for (let y = 0; y < height; y += sampleRate) {
    for (let x = 0; x < width; x += sampleRate) {
      const idx = (y * width + x) * 4;
      const leftIdx = (y * width + (x - 1)) * 4;
      const topIdx = ((y - 1) * width + x) * 4;

      if (x > 0 && y > 0) {
        const b = getBrightness(idx);
        const bLeft = getBrightness(leftIdx);
        const bTop = getBrightness(topIdx);
        
        const diff = Math.abs(b - bLeft) + Math.abs(b - bTop);
        
        if (diff > threshold) {
          points.push({ x: x - width / 2, y: y - height / 2 });
        }
      }
    }
  }

  if (points.length === 0) return [];

  let limitedPoints = points;
  if (points.length > maxPoints) {
    const step = Math.ceil(points.length / maxPoints);
    limitedPoints = points.filter((_, i) => i % step === 0);
  }

  const sortedPoints = buildPath(limitedPoints);
  const smoothedPoints: Point[] = [];

  for (let i = 0; i < sortedPoints.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let j = -smoothingWindow; j <= smoothingWindow; j++) {
      const idx = (i + j + sortedPoints.length) % sortedPoints.length;
      sumX += sortedPoints[idx].x;
      sumY += sortedPoints[idx].y;
      count++;
    }
    smoothedPoints.push({ x: sumX / count, y: sumY / count });
  }

  return smoothedPoints;
};

export const processImage = async (file: File, maxWidth: number = 800, opts: EdgeProcessingOptions = {}): Promise<Point[]> => {
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
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
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
