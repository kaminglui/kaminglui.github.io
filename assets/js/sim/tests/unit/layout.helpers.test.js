import { describe, it, expect } from 'vitest';
import { computeWorkspaceHeight, validateLayoutHeights } from '../../../circuitforge.js';

describe('layout helpers', () => {
  it('computes workspace height from viewport, header, and sim bar', () => {
    expect(computeWorkspaceHeight({ viewportH: 800, headerH: 120, simBarH: 80 })).toBe(600);
    expect(computeWorkspaceHeight({ viewportH: 500, headerH: 400, simBarH: 200 })).toBe(0);
  });

  it('returns ok when DOM is not present', () => {
    const check = validateLayoutHeights();
    expect(check.ok).toBe(true);
  });
});
