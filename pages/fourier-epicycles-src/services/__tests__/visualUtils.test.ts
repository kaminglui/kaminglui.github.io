import { describe, expect, it } from 'vitest';
import { amplitudeToColor, legendGradient, normalizeAmplitude, termColor } from '../visualUtils';

describe('visualUtils', () => {
  it('normalizes amplitude into [0,1]', () => {
    expect(normalizeAmplitude(5, 10)).toBeCloseTo(0.5);
    expect(normalizeAmplitude(-5, 10)).toBe(0);
    expect(normalizeAmplitude(5, 0)).toBe(0);
  });

  it('creates hue-shifted colors for amplitude', () => {
    const low = amplitudeToColor(0, 10);
    const high = amplitudeToColor(10, 10, true);
    expect(low).toMatch(/hsla\(/);
    expect(high).toContain('0.95'); // highlight alpha
    expect(low).not.toEqual(high);
  });

  it('builds a smooth gradient legend string', () => {
    const grad = legendGradient(10);
    expect(grad.startsWith('linear-gradient')).toBe(true);
    expect(grad).toContain('%');
  });

  it('respects highlight flag for term color', () => {
    const colorA = termColor({ re: 1, im: 0, amp: 1, freq: 1, phase: 0 }, 2, false);
    const colorB = termColor({ re: 1, im: 0, amp: 1, freq: 1, phase: 0 }, 2, true);
    expect(colorA).not.toEqual(colorB);
  });
});
