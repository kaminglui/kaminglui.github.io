import { describe, it, expect } from 'vitest';
import { parseUnit, formatUnit, formatSignedUnit, getResColor } from './units.js';

describe('parseUnit', () => {
  it('parses plain numbers without suffix', () => {
    expect(parseUnit('0.5')).toBe(0.5);
    expect(parseUnit('-3.14')).toBeCloseTo(-3.14, 6);
  });

  it('handles SI prefixes', () => {
    expect(parseUnit('1k')).toBe(1000);
    expect(parseUnit('2.2M')).toBeCloseTo(2.2e6, 6);
    expect(parseUnit('3n')).toBeCloseTo(3e-9, 12);
    expect(parseUnit('33p')).toBeCloseTo(33e-12, 14);
    expect(parseUnit('1m')).toBeCloseTo(1e-3, 12);
    expect(parseUnit('1G')).toBe(1e9);
  });

  it('accepts µ / μ / u for micro', () => {
    expect(parseUnit('10u')).toBeCloseTo(1e-5, 12);
    expect(parseUnit('10µ')).toBeCloseTo(1e-5, 12);
    expect(parseUnit('10μ')).toBeCloseTo(1e-5, 12);
  });

  it('returns 0 for empty / non-numeric input', () => {
    expect(parseUnit('')).toBe(0);
    expect(parseUnit(null)).toBe(0);
    expect(parseUnit('abc')).toBe(0);
  });
});

describe('formatUnit', () => {
  it('scales into the appropriate SI band', () => {
    expect(formatUnit(0)).toBe('0');
    expect(formatUnit(1500, 'Ω')).toBe('1.50kΩ');
    expect(formatUnit(2.2e6, 'Ω')).toBe('2.20MΩ');
    expect(formatUnit(0.005, 'V')).toBe('5.00mV');
    expect(formatUnit(3.3e-9, 'F')).toBe('3.30nF');
  });

  it('returns 0 + unit for non-finite input', () => {
    expect(formatUnit(Infinity, 'V')).toBe('0V');
    expect(formatUnit(NaN)).toBe('0');
  });
});

describe('formatSignedUnit', () => {
  it('prefixes negative values with a minus sign', () => {
    expect(formatSignedUnit(-1500, 'Ω')).toBe('-1.50kΩ');
    expect(formatSignedUnit(2.2, 'V')).toBe('2.20V');
  });
});

describe('getResColor', () => {
  it('returns four color bands for a valid resistance', () => {
    const bands = getResColor('1k', '5');
    expect(bands).toHaveLength(4);
    bands.forEach((color) => expect(color).toMatch(/^#[0-9A-F]{6}$/i));
  });

  it('uses gold for 5% and silver-ish for 10% tolerance', () => {
    const gold = getResColor('4.7k', '5');
    const silver = getResColor('4.7k', '10');
    expect(gold[3]).toBe('#C08327');
    expect(silver[3]).toBe('#BFBEBF');
  });

  it('falls back to 1k for invalid resistance', () => {
    const oneK = getResColor('1k', '5');
    const invalid = getResColor('not-a-number', '5');
    expect(invalid).toEqual(oneK);
  });
});
