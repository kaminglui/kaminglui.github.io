import { describe, expect, it } from 'vitest';
import { fitViewToPoints, screenToWorld, worldToScreen, zoomViewAt } from '../viewTransform';

describe('viewTransform', () => {
  it('screenToWorld and worldToScreen invert (within float error)', () => {
    const viewport = { width: 800, height: 600 };
    const view = { scale: 2, offsetX: 40, offsetY: -20 };
    const world = { x: 12.5, y: -7.25 };
    const screen = worldToScreen(world, viewport, view);
    const back = screenToWorld(screen, viewport, view);
    expect(back.x).toBeCloseTo(world.x, 8);
    expect(back.y).toBeCloseTo(world.y, 8);
  });

  it('zoomViewAt keeps the anchored world point fixed under the cursor', () => {
    const viewport = { width: 1000, height: 700 };
    const view = { scale: 1, offsetX: 20, offsetY: 10 };
    const cursor = { x: 250, y: 300 };
    const worldBefore = screenToWorld(cursor, viewport, view);

    const next = zoomViewAt(view, viewport, cursor, 2.25, 0.25, 6);
    const worldAfter = screenToWorld(cursor, viewport, next);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });

  it('fitViewToPoints centers and scales to fit bounds', () => {
    const viewport = { width: 100, height: 100 };
    const points = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 }
    ];

    const view = fitViewToPoints(points, viewport, { padding: 1, minScale: 0.25, maxScale: 100 });
    expect(view.scale).toBeCloseTo(50, 8);
    expect(view.offsetX).toBeCloseTo(0, 8);
    expect(view.offsetY).toBeCloseTo(0, 8);

    const corner = worldToScreen({ x: 1, y: 1 }, viewport, view);
    expect(corner.x).toBeCloseTo(100, 8);
    expect(corner.y).toBeCloseTo(100, 8);
  });
});
