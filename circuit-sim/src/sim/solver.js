/**
 * MNA solver implementing DC operating point and transient analysis with Newton-Raphson.
 */
import { Resistor, Capacitor, Inductor, DCVoltageSource, ACVoltageSource, MOSFET } from './devices.js';

function zeros(n, m) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = new Array(m).fill(0);
  return a;
}

function cloneVector(v) {
  return v.slice();
}

function norm(v) {
  return Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
}

function gaussianSolve(A, b) {
  // Dense Gaussian elimination with partial pivoting.
  const n = b.length;
  const M = zeros(n, n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = A[i][j];
    M[i][n] = b[i];
  }
  for (let k = 0; k < n; k++) {
    // Pivot
    let pivot = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
    }
    if (Math.abs(M[pivot][k]) < 1e-15) throw new Error('Matrix singular');
    [M[k], M[pivot]] = [M[pivot], M[k]];
    const pivotVal = M[k][k];
    for (let j = k; j <= n; j++) M[k][j] /= pivotVal;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = M[i][k];
      for (let j = k; j <= n; j++) M[i][j] -= factor * M[k][j];
    }
  }
  return M.map((row) => row[n]);
}

export class Solver {
  constructor() {
    this.nodes = [{ id: 0, name: 'GND' }];
    this.devices = [];
    this.numUnknowns = 0;
    this.time = 0;
    this.dt = 1e-6;
    this.dtMin = 1e-9;
    this.dtMax = 1e-3;
    this.maxNewtonIters = 20;
    this.vTol = 1e-6;
    this.iTol = 1e-9;
    this.solution = [];
  }

  addNode(name) {
    const id = this.nodes.length;
    this.nodes.push({ id, name });
    return id;
  }

  addDevice(device) {
    this.devices.push(device);
  }

  finalize() {
    const numVoltage = this.nodes.length - 1; // excluding ground
    let extra = 0;
    this.devices.forEach((d) => {
      extra = d.assignExtra(numVoltage + extra);
    });
    this.numUnknowns = numVoltage + extra;
    this.solution = new Array(this.numUnknowns).fill(0);
  }

  buildSystem(stampFn, time) {
    const N = this.numUnknowns;
    const G = zeros(N, N);
    const I = new Array(N).fill(0);
    for (const device of this.devices) {
      stampFn(device, G, I, time);
    }
    return { G, I };
  }

  stampDevice(device, G, I, mode, time) {
    if (mode === 'dc') {
      device.stampDC(G, I, this.solution, this.dt, this.time);
    } else {
      device.stampTransient(G, I, this.solution, this.dt, time);
    }
  }

  solveLinear(G, I) {
    return gaussianSolve(G, I);
  }

  solveNewton(mode, time = 0) {
    let x = cloneVector(this.solution);
    for (let iter = 0; iter < this.maxNewtonIters; iter++) {
      const { G, I } = this.buildSystem((d, Gm, Im) => this.stampDevice(d, Gm, Im, mode, time), time);
      // Build residual: G*x - I = 0
      const res = new Array(this.numUnknowns).fill(0);
      for (let i = 0; i < this.numUnknowns; i++) {
        let sum = 0;
        for (let j = 0; j < this.numUnknowns; j++) sum += G[i][j] * x[j];
        res[i] = sum - I[i];
      }
      if (norm(res) < this.vTol) {
        this.solution = x;
        return { converged: true, iterations: iter + 1 };
      }
      // Solve for delta
      const dx = this.solveLinear(G, I);
      x = x.map((val, idx) => dx[idx]);
    }
    this.solution = x;
    return { converged: false, iterations: this.maxNewtonIters };
  }

  runDC() {
    const result = this.solveNewton('dc');
    this.devices.forEach((d) => d.updateState(this.solution, this.dt));
    return result;
  }

  stepTransient(time) {
    const { converged } = this.solveNewton('tran', time);
    this.devices.forEach((d) => d.updateState(this.solution, this.dt));
    this.time += this.dt;
    return converged;
  }
}

// Factory used by the netlist compiler
export function createDeviceInstance(def) {
  const { type, nodes, params } = def;
  switch (type) {
    case 'R':
      return new Resistor(nodes[0], nodes[1], params.R || 1e3);
    case 'C':
      return new Capacitor(nodes[0], nodes[1], params.C || 1e-6);
    case 'L':
      return new Inductor(nodes[0], nodes[1], params.L || 1e-3);
    case 'VDC':
      return new DCVoltageSource(nodes[0], nodes[1], params.V || 0);
    case 'VAC':
      return new ACVoltageSource(nodes[0], nodes[1], params);
    case 'MOS':
      return new MOSFET(params.type || 'NMOS', nodes[0], nodes[1], nodes[2], params);
    default:
      throw new Error(`Unknown device type ${type}`);
  }
}
