import { describe, it, expect } from 'vitest';
import { calculateWorkspaceMetrics } from '../circuitforge.js';

describe('layout workspace metrics', () => {
  it('computes workspace height from viewport, header, and sim bar', () => {
    const metrics = calculateWorkspaceMetrics({ viewportH: 800, headerH: 120, simbarH: 92 });
    expect(metrics.workspaceH).toBe(800 - 120 - 92);
    expect(metrics.headerH).toBe(120);
    expect(metrics.simbarH).toBe(92);
  });

  it('never allows negative workspace height', () => {
    const metrics = calculateWorkspaceMetrics({ viewportH: 100, headerH: 120, simbarH: 20 });
    expect(metrics.workspaceH).toBe(0);
  });
});

