/**
 * Lightweight schematic editor with grid snapping, Manhattan wiring, and basic selection.
 */
import { compileNetlist } from '../sim/netlist.js';

const GRID = 20;

function snap(v) {
  return Math.round(v / GRID) * GRID;
}

function colorForVoltage(v) {
  if (v > 0.05) return '#22d3ee';
  if (v < -0.05) return '#f87171';
  return '#9ca3af';
}

const pinDefs = {
  R: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  C: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  L: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  VDC: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  VAC: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  MOS: [{ x: -20, y: 0 }, { x: 0, y: -20 }, { x: 20, y: 0 }],
  GND: [{ x: 0, y: 0 }]
};

let idCounter = 1;

export class Schematic {
  constructor(canvas, logFn) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.log = logFn;
    this.components = [];
    this.wires = [];
    this.mode = 'select';
    this.activeTool = null;
    this.selected = null;
    this.tempWire = null;
    this.nodeVoltages = new Map();
    this.attachEvents();
    this.draw();
  }

  attachEvents() {
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
  }

  setMode(mode) {
    this.mode = mode;
    this.activeTool = mode;
  }

  addComponent(kind, pos, params = {}) {
    const def = pinDefs[kind];
    if (!def) return;
    const comp = {
      id: idCounter++,
      kind,
      x: snap(pos.x),
      y: snap(pos.y),
      params: { ...params },
      pins: def.map((p) => ({ x: snap(pos.x + p.x), y: snap(pos.y + p.y) }))
    };
    this.components.push(comp);
    this.selected = comp;
    this.draw();
    return comp;
  }

  addWirePoint(pt) {
    if (!this.tempWire) this.tempWire = { points: [pt] };
    this.tempWire.points.push(pt);
  }

  finishWire(pt) {
    if (this.tempWire && this.tempWire.points.length > 1) {
      this.tempWire.points.push(pt);
      this.wires.push(this.tempWire);
    }
    this.tempWire = null;
  }

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = snap(e.clientX - rect.left);
    const y = snap(e.clientY - rect.top);
    if (this.mode === 'wire') {
      if (this.tempWire) {
        this.finishWire({ x, y });
      } else {
        this.addWirePoint({ x, y });
      }
      this.draw();
      return;
    }
    if (this.activeTool && this.activeTool !== 'select' && this.activeTool !== 'wire') {
      this.addComponent(this.activeTool, { x, y });
      return;
    }
    // Selection
    const hit = this.components.find((c) => Math.abs(c.x - x) < GRID && Math.abs(c.y - y) < GRID);
    if (hit) this.selected = hit;
    this.draw();
  }

  onMove(e) {
    if (!this.tempWire) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = snap(e.clientX - rect.left);
    const y = snap(e.clientY - rect.top);
    const pts = [...this.tempWire.points, { x, y }];
    this.draw(pts);
  }

  draw(tempWirePts = null) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // wires
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#9ca3af';
    const drawWire = (pts) => {
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    };
    this.wires.forEach((w) => {
      const color = this.nodeVoltages.get(`${w.points[0].x},${w.points[0].y}`);
      ctx.strokeStyle = color || '#9ca3af';
      drawWire(w.points);
    });
    if (tempWirePts) {
      ctx.setLineDash([5, 5]);
      drawWire(tempWirePts);
      ctx.setLineDash([]);
    }

    // components
    for (const comp of this.components) {
      ctx.save();
      ctx.translate(comp.x, comp.y);
      ctx.strokeStyle = this.selected === comp ? '#22d3ee' : '#e5e7eb';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      switch (comp.kind) {
        case 'R':
          ctx.rect(-20, -6, 40, 12);
          break;
        case 'C':
          ctx.moveTo(-8, -12);
          ctx.lineTo(-8, 12);
          ctx.moveTo(8, -12);
          ctx.lineTo(8, 12);
          break;
        case 'L':
          ctx.arc(-10, 0, 6, 0, Math.PI * 2);
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.arc(10, 0, 6, 0, Math.PI * 2);
          break;
        case 'VDC':
        case 'VAC':
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          break;
        case 'MOS':
          ctx.rect(-12, -18, 24, 36);
          ctx.moveTo(-12, 0);
          ctx.lineTo(-22, 0);
          ctx.moveTo(12, 0);
          ctx.lineTo(22, 0);
          ctx.moveTo(0, -18);
          ctx.lineTo(0, -28);
          break;
        case 'GND':
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.moveTo(-6, 4);
          ctx.lineTo(6, 4);
          ctx.moveTo(-2, 8);
          ctx.lineTo(2, 8);
          break;
      }
      ctx.stroke();
      // pins
      ctx.fillStyle = '#22d3ee';
      comp.pins.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x - comp.x, p.y - comp.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  updateNodeVoltages(solver) {
    const map = new Map();
    if (this.pointToNode) {
      this.pointToNode.forEach((nodeIdx, key) => {
        if (nodeIdx === 0) return;
        const v = solver.solution[nodeIdx - 1] || 0;
        map.set(key, colorForVoltage(v));
      });
    }
    this.nodeVoltages = map;
    this.draw();
  }

  currentNetlist() {
    const net = compileNetlist(this);
    this.pointToNode = net.pointToNode;
    return net;
  }
}
