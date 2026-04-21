import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractEdgePath, processImage } from '../imageProcessing';

const buildBrightnessData = (width: number, height: number, brightCoords: Array<[number, number]>) => {
  const data = new Uint8ClampedArray(width * height * 4);
  brightCoords.forEach(([x, y]) => {
    const idx = (y * width + x) * 4;
    data[idx] = 255;
    data[idx + 1] = 255;
    data[idx + 2] = 255;
    data[idx + 3] = 255;
  });
  return data;
};

const buildSolidRectData = (
  width: number,
  height: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  colors: { bg: number; fg: number }
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inRect = x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
      const v = inRect ? colors.fg : colors.bg;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return data;
};

const buildRectOutlineData = (
  width: number,
  height: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  gap?: { x: number; y: number }
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const setPixel = (x: number, y: number, v: number) => {
    const idx = (y * width + x) * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  };

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    data[idx] = 255;
    data[idx + 1] = 255;
    data[idx + 2] = 255;
    data[idx + 3] = 255;
  }

  for (let x = rect.x0; x <= rect.x1; x++) {
    setPixel(x, rect.y0, 0);
    setPixel(x, rect.y1, 0);
  }
  for (let y = rect.y0; y <= rect.y1; y++) {
    setPixel(rect.x0, y, 0);
    setPixel(rect.x1, y, 0);
  }
  if (gap) {
    setPixel(gap.x, gap.y, 255);
  }

  return data;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractEdgePath', () => {
  it('detects edge points from image data', () => {
    const width = 4;
    const height = 4;
    const data = buildBrightnessData(width, height, [
      [1, 1],
      [2, 2]
    ]);

    const points = extractEdgePath(data, width, height, { sampleRate: 1, threshold: 10, smoothingWindow: 1 });
    expect(points.length).toBeGreaterThan(0);
    const maxDisplacement = Math.max(...points.map((p) => Math.hypot(p.x, p.y)));
    expect(maxDisplacement).toBeGreaterThan(0);
  });

  it('returns empty when no strong edges exist', () => {
    const width = 4;
    const height = 4;
    const data = buildBrightnessData(width, height, []);

    const points = extractEdgePath(data, width, height, { threshold: 200, sampleRate: 1 });
    expect(points).toEqual([]);
  });

  it('extracts a connected outline from a simple silhouette', () => {
    const width = 64;
    const height = 64;
    const data = buildSolidRectData(width, height, { x0: 14, y0: 10, x1: 50, y1: 52 }, { bg: 255, fg: 0 });

    const points = extractEdgePath(data, width, height, {
      sampleRate: 1,
      maxPoints: 1500,
      smoothingWindow: 2,
      morphRadius: 2,
      blurRadius: 1,
      threshold: 24
    });

    expect(points.length).toBeGreaterThan(80);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(points[0]).toEqual(points[points.length - 1]);

    const maxStep = Math.max(
      ...points.slice(1).map((p, i) => {
        const prev = points[i];
        return Math.hypot(p.x - prev.x, p.y - prev.y);
      })
    );
    expect(maxStep).toBeLessThan(40);
  });

  it('bridges small gaps to keep the outline connected', () => {
    const width = 64;
    const height = 64;
    const rect = { x0: 12, y0: 12, x1: 52, y1: 52 };
    const data = buildRectOutlineData(width, height, rect, { x: 32, y: rect.y0 });

    const points = extractEdgePath(data, width, height, {
      sampleRate: 1,
      maxPoints: 1500,
      smoothingWindow: 1,
      morphRadius: 2,
      blurRadius: 1,
      threshold: 24
    });

    expect(points.length).toBeGreaterThan(40);
    expect(points[0]).toEqual(points[points.length - 1]);

    const maxStep = Math.max(
      ...points.slice(1).map((p, i) => {
        const prev = points[i];
        return Math.hypot(p.x - prev.x, p.y - prev.y);
      })
    );
    expect(maxStep).toBeLessThan(60);
  });
});

describe('processImage', () => {
  it('processes an uploaded image into points', async () => {
    const width = 64;
    const height = 64;
    const data = buildRectOutlineData(width, height, { x0: 12, y0: 12, x1: 52, y1: 52 });

    class MockImage {
      width = width;
      height = height;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onload: (() => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onerror: ((err: any) => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload && this.onload());
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Image = MockImage as any;

    const originalCreate = document.createElement.bind(document);
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data, width, height }))
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx
        } as unknown as HTMLCanvasElement;
      }
      return originalCreate(tag);
    });

    const result = await processImage(new File([''], 'test.png'));
    expect(result.length).toBeGreaterThan(0);
  });

  it('rejects when a canvas context cannot be created', async () => {
    const width = 2;
    const height = 2;

    class MockImage {
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload && this.onload());
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Image = MockImage as any;

    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null
        } as unknown as HTMLCanvasElement;
      }
      return originalCreate(tag);
    });

    await expect(
      processImage(new File([''], 'broken.png'))
    ).rejects.toBeInstanceOf(Error);
  });
});
