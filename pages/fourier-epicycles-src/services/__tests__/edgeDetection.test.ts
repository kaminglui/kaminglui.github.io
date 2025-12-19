import { describe, it, expect } from 'vitest';
import {
  buildEdgeMaskFromGray,
  gaussianBlurGray,
  nonMaxSuppression,
  hysteresis,
  sobelGradients
} from '../imageProcessing';

function countNonZero(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) c++;
  return c;
}

function countNonZero16(mask: Uint16Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) c++;
  return c;
}

function makeConstantGray(w: number, h: number, v: number): Uint8Array {
  const a = new Uint8Array(w * h);
  a.fill(v);
  return a;
}

function makeVerticalStep(w: number, h: number, leftVal: number, rightVal: number, stepX: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      a[y * w + x] = x < stepX ? leftVal : rightVal;
    }
  }
  return a;
}

function makeSquare(w: number, h: number, x0: number, y0: number, x1: number, y1: number, insideVal: number, outsideVal: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = (x >= x0 && x <= x1 && y >= y0 && y <= y1);
      a[y * w + x] = inside ? insideVal : outsideVal;
    }
  }
  return a;
}

// Deterministic PRNG for noise tests
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Edge Detection - Canny pipeline', () => {
  it('gaussianBlurGray: sigma<=0 returns identical output', () => {
    const w = 8, h = 8;
    const gray = makeVerticalStep(w, h, 0, 255, 4);
    const out = gaussianBlurGray(gray, w, h, 0);
    expect(out.length).toBe(gray.length);
    for (let i = 0; i < gray.length; i++) expect(out[i]).toBe(gray[i]);
  });

  it('sobelGradients: constant image yields zero magnitude', () => {
    const w = 8, h = 8;
    const gray = makeConstantGray(w, h, 128);
    const { mag } = sobelGradients(gray, w, h);
    expect(countNonZero16(mag)).toBe(0);
  });

  it('nonMaxSuppression: keeps local maxima along direction', () => {
    const w = 5, h = 5;
    const mag = new Uint16Array(w * h);
    const dir = new Uint8Array(w * h);
    const idx = (x: number, y: number) => y * w + x;

    mag[idx(1, 2)] = 5;
    mag[idx(2, 2)] = 10;
    mag[idx(3, 2)] = 7;
    dir[idx(1, 2)] = 0;
    dir[idx(2, 2)] = 0;
    dir[idx(3, 2)] = 0;

    const nms = nonMaxSuppression(mag, dir, w, h);
    expect(nms[idx(2, 2)]).toBe(10);
    expect(nms[idx(1, 2)]).toBe(0);
    expect(nms[idx(3, 2)]).toBe(0);
  });

  it('buildEdgeMaskFromGray: blank image returns no edges', () => {
    const w = 32, h = 32;
    const gray = makeConstantGray(w, h, 128);
    const mask = buildEdgeMaskFromGray(gray, w, h, {
      method: 'canny',
      sigma: 1.2,
      highPercentile: 90,
      lowRatio: 0.4
    });
    expect(countNonZero(mask)).toBe(0);
  });

  it('buildEdgeMaskFromGray: vertical step produces edges near boundary (not everywhere)', () => {
    const w = 32, h = 32;
    const stepX = 16;
    const gray = makeVerticalStep(w, h, 0, 255, stepX);

    const mask = buildEdgeMaskFromGray(gray, w, h, {
      method: 'canny',
      sigma: 0,
      highPercentile: 80,
      lowRatio: 0.4
    });

    const totalEdges = countNonZero(mask);
    expect(totalEdges).toBeGreaterThan(0);

    let boundaryEdges = 0;
    let nonBoundaryEdges = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = mask[y * w + x] !== 0;
        if (!v) continue;
        if (x === stepX || x === stepX - 1) boundaryEdges++;
        else nonBoundaryEdges++;
      }
    }

    expect(boundaryEdges).toBeGreaterThan(nonBoundaryEdges * 3);
  });

  it('buildEdgeMaskFromGray: square yields perimeter edges and few interior edges', () => {
    const w = 64, h = 64;
    const gray = makeSquare(w, h, 16, 16, 47, 47, 255, 0);

    const mask = buildEdgeMaskFromGray(gray, w, h, {
      method: 'canny',
      sigma: 1.0,
      highPercentile: 90,
      lowRatio: 0.4
    });

    const totalEdges = countNonZero(mask);
    expect(totalEdges).toBeGreaterThan(0);

    let interiorEdges = 0;
    for (let y = 24; y <= 39; y++) {
      for (let x = 24; x <= 39; x++) {
        if (mask[y * w + x] !== 0) interiorEdges++;
      }
    }
    expect(interiorEdges).toBeLessThan(10);
  });

  it('hysteresis: weak pixels connected to strong are kept; isolated below low are rejected', () => {
    const w = 10, h = 10;
    const nms = new Uint16Array(w * h);
    const idx = (x: number, y: number) => y * w + x;

    nms[idx(5, 5)] = 100;
    nms[idx(6, 5)] = 60;
    nms[idx(7, 5)] = 40;

    const mask = hysteresis(nms, w, h, 50, 90);
    expect(mask[idx(5, 5)]).toBe(255);
    expect(mask[idx(6, 5)]).toBe(255);
    expect(mask[idx(7, 5)]).toBe(0);
  });

  it('noise suppression: larger sigma should reduce spurious edges in noisy constant image', () => {
    const w = 64, h = 64;
    const base = 128;
    const rng = mulberry32(1234);
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const noise = Math.floor((rng() - 0.5) * 40);
      let v = base + noise;
      v = Math.max(0, Math.min(255, v));
      gray[i] = v;
    }

    const maskNoBlur = buildEdgeMaskFromGray(gray, w, h, {
      method: 'canny',
      sigma: 0,
      highPercentile: 90,
      lowRatio: 0.4
    });

    const maskBlur = buildEdgeMaskFromGray(gray, w, h, {
      method: 'canny',
      sigma: 2.0,
      highPercentile: 90,
      lowRatio: 0.4
    });

    expect(countNonZero(maskBlur)).toBeLessThan(countNonZero(maskNoBlur));
  });
});
