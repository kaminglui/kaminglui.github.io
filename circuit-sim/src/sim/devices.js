/**
 * Device models and stamping helpers for the MNA solver.
 * Each device implements a simple interface for DC and transient analysis.
 */
import { MOS_MODEL_DEFAULTS } from './mosDefaults.js';

function nIndex(node) {
  return node > 0 ? node - 1 : null;
}

export class Device {
  constructor() {
    this.extraVars = 0;
    this.branchIndex = null;
  }

  assignExtra(startIndex) {
    if (this.extraVars === 0) return startIndex;
    this.branchIndex = startIndex;
    return startIndex + this.extraVars;
  }

  getNodeIndices() {
    return [];
  }
}

export class Resistor extends Device {
  constructor(n1, n2, R) {
    super();
    this.n1 = n1;
    this.n2 = n2;
    this.R = Math.max(1e-12, R);
  }

  stampDC(G) {
    const g = 1 / this.R;
    const a = nIndex(this.n1);
    const b = nIndex(this.n2);
    if (a !== null) G[a][a] += g;
    if (b !== null) G[b][b] += g;
    if (a !== null && b !== null) {
      G[a][b] -= g;
      G[b][a] -= g;
    }
  }

  stampTransient(G) {
    this.stampDC(G);
  }

  updateState() {}

  getNodeIndices() {
    return [this.n1, this.n2];
  }
}

export class Capacitor extends Device {
  constructor(n1, n2, C) {
    super();
    this.n1 = n1;
    this.n2 = n2;
    this.C = Math.max(1e-15, C);
    this.vPrev = 0;
  }

  stampDC() {
    // Open in DC
  }

  stampTransient(G, I, solution, dt) {
    const a = nIndex(this.n1);
    const b = nIndex(this.n2);
    const gEq = this.C / dt;
    const v1 = a !== null ? solution[a] : 0;
    const v2 = b !== null ? solution[b] : 0;
    const vCap = v1 - v2;
    const iEq = gEq * this.vPrev;
    if (a !== null) {
      G[a][a] += gEq;
      I[a] += iEq;
    }
    if (b !== null) {
      G[b][b] += gEq;
      I[b] -= iEq;
    }
    if (a !== null && b !== null) {
      G[a][b] -= gEq;
      G[b][a] -= gEq;
    }
  }

  updateState(solution) {
    const a = nIndex(this.n1);
    const b = nIndex(this.n2);
    const v1 = a !== null ? solution[a] : 0;
    const v2 = b !== null ? solution[b] : 0;
    this.vPrev = v1 - v2;
  }

  getNodeIndices() {
    return [this.n1, this.n2];
  }
}

export class Inductor extends Device {
  constructor(n1, n2, L) {
    super();
    this.n1 = n1;
    this.n2 = n2;
    this.L = Math.max(1e-12, L);
    this.extraVars = 1; // branch current
    this.iPrev = 0;
  }

  stampDC(G, I) {
    // Treat as short with branch current variable
    const a = nIndex(this.n1);
    const b = nIndex(this.n2);
    const k = this.branchIndex;
    if (a !== null) {
      G[a][k] += 1;
      G[k][a] += 1;
    }
    if (b !== null) {
      G[b][k] -= 1;
      G[k][b] -= 1;
    }
  }

  stampTransient(G, I, solution, dt) {
    const a = nIndex(this.n1);
    const b = nIndex(this.n2);
    const k = this.branchIndex;
    const rEq = this.L / dt;
    if (a !== null) {
      G[a][k] += 1;
      G[k][a] += 1;
    }
    if (b !== null) {
      G[b][k] -= 1;
      G[k][b] -= 1;
    }
    G[k][k] -= rEq;
    I[k] -= -rEq * this.iPrev;
  }

  updateState(solution, dt) {
    if (this.branchIndex === null) return;
    this.iPrev = solution[this.branchIndex];
  }

  getNodeIndices() {
    return [this.n1, this.n2];
  }
}

export class DCVoltageSource extends Device {
  constructor(nPlus, nMinus, voltage) {
    super();
    this.nPlus = nPlus;
    this.nMinus = nMinus;
    this.voltage = voltage;
    this.extraVars = 1;
  }

  stampDC(G, I) {
    this.stampVoltage(G, I, this.voltage);
  }

  stampTransient(G, I) {
    this.stampVoltage(G, I, this.voltage);
  }

  stampVoltage(G, I, value) {
    const a = nIndex(this.nPlus);
    const b = nIndex(this.nMinus);
    const k = this.branchIndex;
    if (a !== null) {
      G[a][k] += 1;
      G[k][a] += 1;
    }
    if (b !== null) {
      G[b][k] -= 1;
      G[k][b] -= 1;
    }
    I[k] += value;
  }

  updateState() {}

  getNodeIndices() {
    return [this.nPlus, this.nMinus];
  }
}

export class ACVoltageSource extends Device {
  constructor(nPlus, nMinus, params) {
    super();
    this.nPlus = nPlus;
    this.nMinus = nMinus;
    this.params = params;
    this.extraVars = 1;
  }

  valueAt(time) {
    const { vPeak = 1, freq = 1, phase = 0, offset = 0 } = this.params;
    return offset + vPeak * Math.sin(2 * Math.PI * freq * time + phase);
  }

  stampDC(G, I) {
    this.stampVoltage(G, I, this.params.offset || 0);
  }

  stampTransient(G, I, _solution, _dt, time) {
    this.stampVoltage(G, I, this.valueAt(time));
  }

  stampVoltage(G, I, value) {
    const a = nIndex(this.nPlus);
    const b = nIndex(this.nMinus);
    const k = this.branchIndex;
    if (a !== null) {
      G[a][k] += 1;
      G[k][a] += 1;
    }
    if (b !== null) {
      G[b][k] -= 1;
      G[k][b] -= 1;
    }
    I[k] += value;
  }

  updateState() {}

  getNodeIndices() {
    return [this.nPlus, this.nMinus];
  }
}

function squareLawCurrent(model, Vgs, Vds) {
  const { VTO, LAMBDA, kPrime } = model;
  const Vth = VTO;
  if (Vgs <= Vth) return { ids: 0, gm: 0, gds: 0 };
  const Vgt = Vgs - Vth;
  if (Vds < Vgt) {
    const ids = kPrime * (Vgt * Vds - (Vds * Vds) / 2) * (1 + LAMBDA * Vds);
    const gm = kPrime * Vds * (1 + LAMBDA * Vds);
    const gds = kPrime * (Vgt - Vds) * (1 + 2 * LAMBDA * Vds) / 2 + ids * LAMBDA;
    return { ids, gm, gds };
  }
  const idsSat = 0.5 * kPrime * Vgt * Vgt * (1 + LAMBDA * Vds);
  const gm = kPrime * Vgt * (1 + LAMBDA * Vds);
  const gds = idsSat * LAMBDA;
  return { ids: idsSat, gm, gds };
}

export class MOSFET extends Device {
  constructor(type, nd, ng, ns, params = {}) {
    super();
    this.type = type; // "NMOS" or "PMOS"
    this.nd = nd;
    this.ng = ng;
    this.ns = ns;
    const defaults = MOS_MODEL_DEFAULTS[type] || MOS_MODEL_DEFAULTS.NMOS;
    this.params = { ...defaults, ...params };
    this.params.K = this.params.kPrime * ((this.params.W || defaults.defaultW) / (this.params.L || defaults.defaultL));
  }

  stampDC(G, I, solution) {
    this.stampSmallSignal(G, I, solution, false);
  }

  stampTransient(G, I, solution) {
    this.stampSmallSignal(G, I, solution, true);
  }

  stampSmallSignal(G, I, solution, transient) {
    const nd = nIndex(this.nd);
    const ng = nIndex(this.ng);
    const ns = nIndex(this.ns);
    const vD = nd !== null ? solution[nd] : 0;
    const vG = ng !== null ? solution[ng] : 0;
    const vS = ns !== null ? solution[ns] : 0;
    const sign = this.type === 'PMOS' ? -1 : 1;
    const Vgs = sign * (vG - vS);
    const Vds = sign * (vD - vS);
    const model = { ...this.params, kPrime: this.params.K };
    const { ids, gm, gds } = squareLawCurrent(model, Vgs, Vds);
    const idsSigned = sign * ids;

    // Stamp transconductance: current from drain to source depends on Vg and Vd
    if (nd !== null) {
      if (ng !== null) G[nd][ng] += gm * sign;
      if (ns !== null) G[nd][ns] -= gm * sign + gds;
      G[nd][nd] += gds;
      I[nd] -= idsSigned;
    }
    if (ns !== null) {
      if (ng !== null) G[ns][ng] -= gm * sign;
      if (nd !== null) G[ns][nd] -= gds;
      G[ns][ns] += gm * sign + gds;
      I[ns] += idsSigned;
    }
  }

  updateState() {}

  getNodeIndices() {
    return [this.nd, this.ng, this.ns];
  }
}
