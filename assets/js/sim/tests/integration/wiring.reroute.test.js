import { describe, it, expect } from 'vitest';
import {
  adjustWireAnchors,
  getPinDirection,
  mergeCollinear,
  snapToBoardPoint
} from '../../../circuitforge.js';

class StubComponent {
  constructor(x, y, pinOffset = { x: 0, y: 0 }) {
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.mirrorX = false;
    this.pins = [pinOffset];
  }

  getPinPos(idx) {
    const p = this.pins[idx] || { x: 0, y: 0 };
    return snapToBoardPoint(this.x + p.x, this.y + p.y);
  }
}

describe('wiring anchors', () => {
  it('keeps collinear waypoints unless they are exact duplicates', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 }
    ];
    const merged = mergeCollinear(pts);
    expect(merged).toHaveLength(3);

    const deduped = mergeCollinear([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 }
    ]);
    expect(deduped).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 }
    ]);
  });

  it('adjusts only the moved endpoints while preserving manual bends', () => {
    const a = new StubComponent(20, 0);
    const b = new StubComponent(100, 100);
    const wire = {
      from: { c: a, p: 0 },
      to: { c: b, p: 0 },
      vertices: [{ x: 0, y: 40 }]
    };

    const startDir = getPinDirection(a, 0);
    const endDir = getPinDirection(b, 0);
    const updatedVerts = adjustWireAnchors(wire, {
      start: a.getPinPos(0),
      end: b.getPinPos(0),
      startDir,
      endDir
    });

    const manualBend = snapToBoardPoint(0, 40);
    const poly = [a.getPinPos(0), ...updatedVerts, b.getPinPos(0)];
    expect(poly.length).toBeGreaterThanOrEqual(3);
    expect(updatedVerts.some((v) => v.x === manualBend.x && v.y === manualBend.y)).toBe(true);

    const firstSeg = [poly[0], poly[1]];
    const lastSeg = [poly[poly.length - 2], poly[poly.length - 1]];
    expect(firstSeg[0].x === firstSeg[1].x || firstSeg[0].y === firstSeg[1].y).toBe(true);
    expect(lastSeg[0].x === lastSeg[1].x || lastSeg[0].y === lastSeg[1].y).toBe(true);
  });
});
