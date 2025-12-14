import { describe, expect, it, vi } from 'vitest';
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
});

describe('processImage', () => {
  it('processes an uploaded image into points', async () => {
    const width = 4;
    const height = 4;
    const data = buildBrightnessData(width, height, [[1, 1]]);

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

    const result = await processImage(new File([''], 'test.png'), 10, { sampleRate: 1, threshold: 5, smoothingWindow: 1 });
    expect(result.length).toBeGreaterThan(0);
  });
});
