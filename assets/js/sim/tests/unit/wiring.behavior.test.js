import { describe, it, expect } from 'vitest';
import { createWiringApi } from '../../../circuit-lab/wiring.js';
import { snapToBoardPoint, getPinDirection } from '../../../circuitforge.js';

const GRID = 20;
const ROUTE_ORIENTATION = { H_FIRST: 'h-first', V_FIRST: 'v-first' };

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

class StubJunction extends StubComponent {
  constructor(x, y) {
    super(x, y, { x: 0, y: 0 });
    this.pins = [{ x: 0, y: 0 }];
  }
}

function distToSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function createApi() {
  let components = [];
  let wires = [];

  const api = createWiringApi({
    GRID,
    ROUTE_ORIENTATION,
    WIRE_HIT_DISTANCE: 12,
    snapToBoardPoint,
    getPinDirection,
    getComponents: () => components,
    setComponents: (next) => { components = next; },
    getWires: () => wires,
    setWires: (next) => { wires = next; },
    Junction: StubJunction,
    distToSegment
  });

  return {
    api,
    get components() { return components; },
    set components(next) { components = next; },
    get wires() { return wires; },
    set wires(next) { wires = next; }
  };
}

describe('wiring drag stability', () => {
  it('translates all vertices when both endpoints move together', () => {
    const ctx = createApi();
    const { api } = ctx;
    const a = new StubComponent(0, 0);
    const b = new StubComponent(120, 0);
    ctx.components.push(a, b);
    ctx.wires.push({
      from: { c: a, p: 0 },
      to: { c: b, p: 0 },
      vertices: [
        { x: 40, y: 0, userPlaced: true },
        { x: 40, y: 60, userPlaced: true }
      ]
    });
    api.tagWireRoutePreference(ctx.wires[0]);

    const snap = api.captureWireSnapshots([a, b])[0];
    const basePolyline = snap.polyline;
    const baseMids = snap.polyline.slice(1, snap.polyline.length - 1);
    const baseRoutePref = ctx.wires[0].routePref;

    const dx = 40;
    const dy = 20;
    a.x += dx; a.y += dy;
    b.x += dx; b.y += dy;
    api.updateWireFromSnapshot(snap, new Map([[a, { dx, dy }], [b, { dx, dy }]]));

    const after = ctx.wires[0].vertices;
    const startDelta = {
      dx: a.getPinPos(0).x - snap.polyline[0].x,
      dy: a.getPinPos(0).y - snap.polyline[0].y
    };
    expect(after).toHaveLength(baseMids.length);
    after.forEach((v, idx) => {
      expect(v.x - baseMids[idx].x).toBe(startDelta.dx);
      expect(v.y - baseMids[idx].y).toBe(startDelta.dy);
    });
    const translatedPolyline = api.getWirePolyline(ctx.wires[0]);
    expect(translatedPolyline).toHaveLength(basePolyline.length);
    translatedPolyline.forEach((p, idx) => {
      expect(p.x - basePolyline[idx].x).toBe(startDelta.dx);
      expect(p.y - basePolyline[idx].y).toBe(startDelta.dy);
    });
    expect(ctx.wires[0].routePref).toBe(baseRoutePref);
  });

  it('keeps first segment orientation stable during a single-end drag', () => {
    const ctx = createApi();
    const { api } = ctx;
    const a = new StubComponent(0, 0);
    const b = new StubComponent(120, 60);
    ctx.components.push(a, b);
    ctx.wires.push({
      from: { c: a, p: 0 },
      to: { c: b, p: 0 },
      vertices: [{ x: 60, y: 60, userPlaced: true }]
    });
    api.tagWireRoutePreference(ctx.wires[0]);

    const snap = api.captureWireSnapshots([b])[0];
    const initialOrientation = api.firstSegmentOrientation(api.getWirePolyline(ctx.wires[0]));

    [10, 20, 30].forEach((delta) => {
      b.y += delta;
      api.updateWireFromSnapshot(snap, new Map([[b, { dx: 0, dy: delta }]]));
      const poly = api.getWirePolyline(ctx.wires[0]);
      const orientationNow = api.firstSegmentOrientation(poly);
      expect(orientationNow).toBe(initialOrientation);
      expect(poly.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps interior user-placed vertices fixed when only one endpoint moves', () => {
    const ctx = createApi();
    const { api } = ctx;
    const a = new StubComponent(0, 0);
    const b = new StubComponent(120, 80);
    ctx.components.push(a, b);
    const verts = [
      { ...snapToBoardPoint(40, 0), userPlaced: true },
      { ...snapToBoardPoint(40, 60), userPlaced: true },
      { ...snapToBoardPoint(80, 60), userPlaced: true }
    ];
    ctx.wires.push({
      from: { c: a, p: 0 },
      to: { c: b, p: 0 },
      vertices: verts
    });
    api.tagWireRoutePreference(ctx.wires[0]);

    const snap = api.captureWireSnapshots([b])[0];
    const interiorBefore = ctx.wires[0].vertices.slice(1, -1).map((v) => ({ ...v }));

    const dx = 20;
    b.x += dx;
    api.updateWireFromSnapshot(snap, new Map([[b, { dx, dy: 0 }]]));

    const after = ctx.wires[0].vertices;
    const interiorAfter = after.slice(1, -1);
    expect(interiorAfter).toEqual(interiorBefore);
    interiorAfter.forEach((v) => expect(v.userPlaced).toBe(true));
  });
});

describe('junction insertion', () => {
  it('splits a wire and connects a new junction', () => {
    const ctx = createApi();
    const { api } = ctx;
    const a = new StubComponent(0, 0);
    const b = new StubComponent(120, 0);
    ctx.components.push(a, b);
    ctx.wires.push({
      from: { c: a, p: 0 },
      to: { c: b, p: 0 },
      vertices: [{ x: 60, y: 0 }]
    });
    api.tagWireRoutePreference(ctx.wires[0]);

    const junction = api.splitWireAtPoint(ctx.wires[0], { x: 60, y: 0 });
    expect(junction).toBeInstanceOf(StubJunction);
    expect(ctx.wires.length).toBe(2);
    const junctionConnections = ctx.wires.filter(
      (w) => w.from.c === junction || w.to.c === junction
    );
    expect(junctionConnections.length).toBe(2);
    const junctionPos = junction.getPinPos(0);
    junctionConnections.forEach((w) => {
      const poly = api.getWirePolyline(w);
      expect(poly.some((p) => p.x === junctionPos.x && p.y === junctionPos.y)).toBe(true);
    });
  });
});

describe('overlap avoidance', () => {
  it('picks an alternate orientation to avoid overlapping existing segments', () => {
    const ctx = createApi();
    const { api } = ctx;
    const baseA = new StubComponent(0, 0);
    const baseB = new StubComponent(40, 0);
    ctx.components.push(baseA, baseB);
    ctx.wires.push({
      from: { c: baseA, p: 0 },
      to: { c: baseB, p: 0 },
      vertices: []
    });
    api.tagWireRoutePreference(ctx.wires[0]);

    const a = new StubComponent(0, 0);
    const b = new StubComponent(40, 40);
    ctx.components.push(a, b);
    const verts = api.buildWireVertices({ c: a, p: 0 }, [], { c: b, p: 0 });
    const poly = [a.getPinPos(0), ...verts, b.getPinPos(0)];
    expect(api.firstSegmentOrientation(poly)).toBe(ROUTE_ORIENTATION.V_FIRST);
    expect(verts.every((v) => v.y !== 0 || v.x === 0)).toBe(true);
  });

  it('nudges a new parallel wire off an occupied lane', () => {
    const ctx = createApi();
    const { api } = ctx;
    const start = snapToBoardPoint(0, 0);
    const end = snapToBoardPoint(100, 0);
    const pathKey = `${Math.min(start.x, end.x)},${Math.min(start.y, end.y)}-${Math.max(start.x, end.x)},${Math.max(start.y, end.y)}`;
    const occupancy = {
      keys: new Set([pathKey]),
      segments: [{ a: start, b: end }]
    };

    const routed = api.routeManhattan(start, [], end, null, null, { occupancy });
    const direct = [start, end];
    expect(routed).not.toEqual(direct);
    expect(routed.length).toBeGreaterThan(2);
    expect(routed.some((p) => p.y !== start.y)).toBe(true);
  });
});
