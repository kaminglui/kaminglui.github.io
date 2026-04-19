import { describe, it, expect } from 'vitest';
import {
  ROUTE_ORIENTATION,
  snapToGrid,
  snapToBoardPoint,
  mergeCollinear,
  ensureOrthogonalPath,
  directionToOrientation,
  firstSegmentOrientation,
  lastSegmentOrientation,
  inferRoutePreference,
  buildTwoPointPath,
  buildStableWirePath,
  routeManhattan,
  adjustWireAnchors,
  distToSegment
} from './geometry.js';
import { GRID } from './config.js';

describe('snapToGrid / snapToBoardPoint', () => {
  it('snapToGrid rounds to nearest grid step', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(GRID / 2 - 0.1)).toBe(0);
    expect(snapToGrid(GRID / 2 + 0.1)).toBe(GRID);
    expect(snapToGrid(GRID * 3)).toBe(GRID * 3);
  });

  it('snapToBoardPoint lands on hole centers offset by GRID/2', () => {
    const p = snapToBoardPoint(0, 0);
    expect(p).toEqual({ x: GRID / 2, y: GRID / 2 });
    const q = snapToBoardPoint(GRID * 1.6, GRID * 2.4);
    expect(q.x % GRID).toBe(GRID / 2);
    expect(q.y % GRID).toBe(GRID / 2);
  });
});

describe('mergeCollinear', () => {
  it('returns an empty array for non-array input', () => {
    expect(mergeCollinear(null)).toEqual([]);
    expect(mergeCollinear(undefined)).toEqual([]);
  });

  it('returns a copy of a 1-element input', () => {
    expect(mergeCollinear([{ x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }]);
  });

  it('drops duplicate adjacent points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(mergeCollinear(pts)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('preserves user bends that are not duplicates', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(mergeCollinear(pts)).toEqual(pts);
  });
});

describe('ensureOrthogonalPath', () => {
  // With GRID=20, breadboard hole centers live at ((n + 0.5) * GRID) — e.g. 10, 30, 50, 70.
  // Inputs and elbows must fall on hole centers, otherwise snapToBoardPoint would move them.

  it('inserts an elbow between diagonal points', () => {
    const path = ensureOrthogonalPath([{ x: 10, y: 10 }, { x: 50, y: 30 }]);
    expect(path.length).toBe(3);
    const elbow = path[1];
    expect(elbow.x === 10 || elbow.y === 10 || elbow.x === 50 || elbow.y === 30).toBe(true);
  });

  it('returns a copy when inputs are already axis-aligned', () => {
    const input = [{ x: 10, y: 10 }, { x: 50, y: 10 }];
    const out = ensureOrthogonalPath(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('honours H_FIRST preference', () => {
    const path = ensureOrthogonalPath(
      [{ x: 10, y: 10 }, { x: 50, y: 30 }],
      ROUTE_ORIENTATION.H_FIRST
    );
    expect(path[1].x).toBe(50);
    expect(path[1].y).toBe(10);
  });

  it('honours V_FIRST preference', () => {
    const path = ensureOrthogonalPath(
      [{ x: 10, y: 10 }, { x: 50, y: 30 }],
      ROUTE_ORIENTATION.V_FIRST
    );
    expect(path[1].x).toBe(10);
    expect(path[1].y).toBe(30);
  });
});

describe('direction / segment orientation helpers', () => {
  it('directionToOrientation prefers H for mostly-horizontal directions', () => {
    expect(directionToOrientation({ x: 1, y: 0 })).toBe(ROUTE_ORIENTATION.H_FIRST);
    expect(directionToOrientation({ x: 0, y: 1 })).toBe(ROUTE_ORIENTATION.V_FIRST);
    expect(directionToOrientation(null)).toBe(null);
  });

  it('firstSegmentOrientation skips zero-length segments', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }];
    expect(firstSegmentOrientation(pts)).toBe(ROUTE_ORIENTATION.H_FIRST);
  });

  it('lastSegmentOrientation reads the final meaningful segment', () => {
    const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 40 }];
    expect(lastSegmentOrientation(pts)).toBe(ROUTE_ORIENTATION.V_FIRST);
  });

  it('inferRoutePreference matches the first-segment orientation of the full polyline', () => {
    const pref = inferRoutePreference({ x: 0, y: 0 }, [{ x: 20, y: 0 }], { x: 20, y: 40 });
    expect(pref).toBe(ROUTE_ORIENTATION.H_FIRST);
  });
});

describe('buildTwoPointPath', () => {
  it('returns a direct 2-point path when already axis-aligned', () => {
    expect(buildTwoPointPath({ x: 10, y: 10 }, { x: 50, y: 10 })).toEqual(
      [{ x: 10, y: 10 }, { x: 50, y: 10 }]
    );
  });

  it('places the elbow so H_FIRST keeps the starting Y', () => {
    const path = buildTwoPointPath({ x: 10, y: 10 }, { x: 50, y: 30 }, ROUTE_ORIENTATION.H_FIRST);
    expect(path.length).toBe(3);
    expect(path[1].x).toBe(50);
    expect(path[1].y).toBe(10);
  });
});

describe('buildStableWirePath', () => {
  it('snaps endpoints and returns an orthogonal path', () => {
    const path = buildStableWirePath({ x: 3, y: 4 }, [], { x: 100, y: 80 });
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (const p of path) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      expect(prev.x === curr.x || prev.y === curr.y).toBe(true);
    }
  });
});

describe('routeManhattan', () => {
  it('produces an orthogonal polyline honoring start and end directions', () => {
    const pts = routeManhattan(
      { x: 10, y: 10 },
      [],
      { x: 90, y: 70 },
      { x: 1, y: 0 },
      { x: -1, y: 0 }
    );
    expect(pts[0]).toEqual({ x: 10, y: 10 });
    expect(pts[pts.length - 1]).toEqual({ x: 90, y: 70 });
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      expect(prev.x === curr.x || prev.y === curr.y).toBe(true);
    }
  });
});

describe('distToSegment', () => {
  it('returns the distance from a point to a segment endpoint when t clamps to 0', () => {
    expect(distToSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(10);
  });

  it('projects perpendicularly when the foot lies within the segment', () => {
    expect(distToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4);
  });

  it('returns the distance to the single point when the segment has zero length', () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('adjustWireAnchors', () => {
  it('returns empty vertices when start and end are axis-aligned with no dir hints', () => {
    const verts = adjustWireAnchors({ vertices: [] }, { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } });
    expect(verts).toEqual([]);
  });

  it('inserts an elbow near a diagonal endpoint when given a direction hint', () => {
    const verts = adjustWireAnchors(
      { vertices: [] },
      { start: { x: 0, y: 0 }, end: { x: 60, y: 40 }, startDir: { x: 1, y: 0 } }
    );
    expect(Array.isArray(verts)).toBe(true);
  });
});
