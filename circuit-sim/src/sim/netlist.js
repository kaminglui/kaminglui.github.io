/**
 * Netlist representation and compiler that turns a schematic graph into solver-ready objects.
 */
import { Solver, createDeviceInstance } from './solver.js';

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)));
    return this.parent.get(x);
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function compileNetlist(schematic) {
  // Collect pins and wire endpoints
  const uf = new UnionFind();
  const points = [];
  const groundKeys = new Set();
  schematic.components.forEach((comp) => {
    comp.pins.forEach((p) => {
      const key = `${p.x},${p.y}`;
      points.push(key);
      uf.find(key);
      if (comp.kind === 'GND') groundKeys.add(key);
    });
  });
  const wireKeys = new Set();
  schematic.wires.forEach((w) => {
    for (let i = 0; i < w.points.length - 1; i++) {
      const p1 = w.points[i];
      const p2 = w.points[i + 1];
      const k1 = `${p1.x},${p1.y}`;
      const k2 = `${p2.x},${p2.y}`;
      uf.union(k1, k2);
    }
    w.points.forEach((p) => {
      const k = `${p.x},${p.y}`;
      points.push(k);
      uf.find(k);
      wireKeys.add(k);
    });
  });

  // connect pins that sit on wires
  schematic.components.forEach((comp) => {
    comp.pins.forEach((p) => {
      const key = `${p.x},${p.y}`;
      if (wireKeys.has(key)) uf.union(key, key);
    });
  });

  const netMap = new Map();
  let netIndex = 1; // reserve 0 for GND
  points.forEach((p) => {
    const root = uf.find(p);
    const isGround = groundKeys.has(p);
    if (isGround) {
      netMap.set(root, 0);
      return;
    }
    if (!netMap.has(root)) {
      netMap.set(root, netIndex++);
    }
  });

  const nodes = [{ id: 0, name: 'GND' }];
  for (let i = 1; i < netIndex; i++) nodes.push({ id: i, name: `N${String(i).padStart(3, '0')}` });
  const pointToNode = new Map();
  points.forEach((p) => {
    const root = uf.find(p);
    pointToNode.set(p, netMap.get(root) || 0);
  });

  const devices = schematic.components
    .filter((c) => c.kind !== 'GND')
    .map((comp) => {
      const nodesIdx = comp.pins.map((p) => {
        if (p.netLabel && p.netLabel.toUpperCase() === 'GND') return 0;
        const key = `${p.x},${p.y}`;
        if (groundKeys.has(key)) return 0;
        return netMap.get(uf.find(key)) || 0;
      });
      return {
        type: comp.kind,
        nodes: nodesIdx,
        params: comp.params || {}
      };
    });

  return { nodes, devices, pointToNode };
}

export function buildSolverFromNetlist(netlist) {
  const solver = new Solver();
  // Add nodes
  netlist.nodes.slice(1).forEach((n) => solver.addNode(n.name));
  // Add devices
  netlist.devices.forEach((d) => solver.addDevice(createDeviceInstance(d)));
  solver.finalize();
  return solver;
}
