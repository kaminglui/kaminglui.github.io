import { describe, expect, it } from 'vitest';
import {
  decidePolarity,
  extractPathFromGray,
  joinPolylinesByEps,
  median3x3,
  otsuThreshold,
  thinZhangSuen
} from '../imageProcessing';
import { pickEpicycleCountForEnergy } from '../metrics';

const makeConstant = (w: number, h: number, v: number) => {
  const a = new Uint8Array(w * h);
  a.fill(v);
  return a;
};

const makeBorderLightCenterDark = (w: number, h: number) => {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      a[y * w + x] = isBorder ? 240 : 40;
    }
  }
  return a;
};

const makeImpulseNoise = (w: number, h: number, base = 128) => {
  const a = makeConstant(w, h, base);
  a[(h >> 1) * w + (w >> 1)] = 255;
  return a;
};

const countNonZeroU8 = (a: Uint8Array) => {
  let c = 0;
  for (const v of a) if (v) c++;
  return c;
};

describe('Polarity detection', () => {
  it('auto detects normal when border is light and center is dark', () => {
    const w = 32;
    const h = 32;
    const gray = makeBorderLightCenterDark(w, h);
    const p = decidePolarity(gray, w, h);
    expect(p).toBe('normal');
  });
});

describe('Denoise', () => {
  it('median3x3 removes isolated impulse noise', () => {
    const w = 15;
    const h = 15;
    const gray = makeImpulseNoise(w, h, 128);
    const out = median3x3(gray, w, h);
    expect(out[(h >> 1) * w + (w >> 1)]).toBe(128);
  });
});

describe('Thresholding', () => {
  it('otsuThreshold returns mid threshold for bimodal image', () => {
    const w = 32;
    const h = 32;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = i < gray.length / 2 ? 30 : 220;
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThan(200);
  });
});

describe('Thinning / merge close lines', () => {
  it('thinZhangSuen collapses a 2-pixel-thick line into ~1-pixel-thick', () => {
    const w = 32;
    const h = 32;
    const mask = new Uint8Array(w * h);
    for (let y = 5; y < 27; y++) {
      mask[y * w + 15] = 255;
      mask[y * w + 16] = 255;
    }
    const th = thinZhangSuen(mask, w, h);
    const before = countNonZeroU8(mask);
    const after = countNonZeroU8(th);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(10);
  });
});

describe('Polyline joining', () => {
  it('joinPolylinesByEps joins endpoints within epsilon', () => {
    const p1 = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const p2 = [{ x: 10.5, y: 0.2 }, { x: 20, y: 0 }];
    const joined = joinPolylinesByEps([p1, p2], 1.0);
    expect(joined.length).toBe(1);
    expect(joined[0].length).toBeGreaterThan(p1.length + p2.length - 1);
  });
});

describe('Energy epicycle selection', () => {
  it('pickEpicycleCountForEnergy selects enough terms to hit 0.9999 energy', () => {
    const coeffs = [
      { re: 10, im: 0, freq: 0, amp: 10, phase: 0 },
      { re: 1, im: 0, freq: 1, amp: 1, phase: 0 },
      { re: 1, im: 0, freq: 2, amp: 1, phase: 0 }
    ];
    const n = pickEpicycleCountForEnergy(coeffs, 0.9999);
    expect(n).toBe(3);
  });
});

describe('End-to-end (synthetic)', () => {
  it('extractPathFromGray finds a usable path from a simple square outline', () => {
    const w = 64;
    const h = 64;
    const gray = makeConstant(w, h, 240);
    for (let x = 16; x < 48; x++) {
      gray[16 * w + x] = 20;
      gray[47 * w + x] = 20;
    }
    for (let y = 16; y < 48; y++) {
      gray[y * w + 16] = 20;
      gray[y * w + 47] = 20;
    }

    const path = extractPathFromGray(gray, w, h, { polarity: 'auto' });
    expect(path.length).toBeGreaterThan(100);
  });
});
