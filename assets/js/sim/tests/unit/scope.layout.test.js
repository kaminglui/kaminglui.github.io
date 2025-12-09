import { describe, it, expect } from 'vitest';
import { computeScopeLayout } from '../../../circuitforge.js';

describe('scope layout helper', () => {
  it('fills the available shell in fullscreen mode', () => {
    const layout = computeScopeLayout('fullscreen', {
      shellRect: { width: 820, height: 480 },
      viewport: { width: 820, height: 600 },
      headerH: 64,
      simBarH: 52,
      windowPos: { x: 10, y: 10 },
      windowSize: { width: 640, height: 420 }
    });

    expect(layout.windowed).toBe(false);
    expect(layout.left).toBe(0);
    expect(layout.top).toBe(0);
    expect(layout.width).toBe(820);
    expect(layout.height).toBe(480);
  });

  it('clamps windowed layout to the shell bounds', () => {
    const layout = computeScopeLayout('window', {
      shellRect: { width: 640, height: 360 },
      viewport: { width: 640, height: 400 },
      windowPos: { x: 620, y: 350 },
      windowSize: { width: 320, height: 260 }
    });

    expect(layout.windowed).toBe(true);
    expect(layout.width).toBe(320);
    expect(layout.height).toBeLessThanOrEqual(260);
    expect(layout.left).toBeLessThanOrEqual(320);
    expect(layout.top).toBeLessThanOrEqual(100);
  });

  it('keeps the window pinned under the header without extra offset', () => {
    const layout = computeScopeLayout('window', {
      shellRect: { width: 800, height: 500 },
      viewport: { width: 800, height: 600 },
      windowPos: { x: 0, y: -20 },
      windowSize: { width: 720, height: 440 }
    });

    expect(layout.top).toBe(0);
    expect(layout.left).toBe(0);
  });
});
