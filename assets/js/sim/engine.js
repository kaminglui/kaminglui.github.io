import { MNASystem } from './MNASystem.js';
import {
  Resistor,
  Capacitor,
  Potentiometer,
  VoltageSource,
  FunctionGenerator,
  LED,
  Switch,
  MOSFET,
  IdealOpAmp
} from './components/index.js';

const DEFAULTS = {
  dt: 1e-7,
  baselineLeak: 1e-11,
  opAmpGain: 1e6,
  opAmpInputLeak: 1e-15,
  opAmpOutputLeak: 1e-12,
  opAmpHeadroom: 0.1,
  opAmpComparatorHysteresis: 0,
  funcGenRefRes: 1,
  funcGenSeriesRes: 1,
  maxOutputClamp: 100,
  maxDiodeIterations: 2
};

function parseUnit(str) {
  if (!str) return 0;
  const match = String(str).trim().match(/^(-?[\d.]+)\s*([a-zA-Z]*)$/);
  if (!match) return parseFloat(str) || 0;
  let value = parseFloat(match[1]);
  const suffix = match[2];
  switch (suffix) {
    case 'p': value *= 1e-12; break;
    case 'n': value *= 1e-9; break;
    case 'u': value *= 1e-6; break;
    case 'm': value *= 1e-3; break;
    case 'k': value *= 1e3; break;
    case 'M': value *= 1e6; break;
    case 'G': value *= 1e9; break;
    default: break;
  }
  return value;
}

function kindOf(component) {
  if (!component) return '';
  if (typeof component.kind === 'string') return component.kind.toLowerCase();
  if (typeof component.type === 'string') return component.type.toLowerCase();
  const name = component.constructor && component.constructor.name;
  return name ? name.toLowerCase() : '';
}

function makePinKey(component, pinIdx) {
  return `${component.id}_${pinIdx}`;
}

function pinConnected(wires, component, pinIdx) {
  return wires.some((w) =>
    (w.from && w.from.c === component && w.from.p === pinIdx) ||
    (w.to && w.to.c === component && w.to.p === pinIdx)
  );
}

function buildMapping({ components, wires }) {
  let autoId = 0;
  const pinMap = new Map();
  let rawCount = 0;

  components.forEach((c) => {
    if (!c.id) c.id = `cmp_${autoId += 1}`;
    if (!Array.isArray(c.pins)) c.pins = [];
    c.pins.forEach((_, idx) => {
      pinMap.set(makePinKey(c, idx), rawCount);
      rawCount += 1;
    });
  });
  if (rawCount === 0) {
    return { pinMap, rootToNode: new Map(), pinToNode: new Map(), nodeCount: 0, groundRoot: null };
  }

  const parent = new Array(rawCount);
  for (let i = 0; i < rawCount; i += 1) parent[i] = i;

  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  wires.forEach((w) => {
    const a = pinMap.get(makePinKey(w.from.c, w.from.p));
    const b = pinMap.get(makePinKey(w.to.c, w.to.p));
    if (a != null && b != null) union(a, b);
  });

  const groundRoots = [];
  components.forEach((c) => {
    if (kindOf(c) === 'ground') {
      const idx = pinMap.get(makePinKey(c, 0));
      if (idx != null) {
        groundRoots.push(find(idx));
      }
    }
  });

  const vsNegCandidates = [];
  components.forEach((c) => {
    const kind = kindOf(c);
    if (kind === 'voltagesource') {
      const idx = pinMap.get(makePinKey(c, 1));
      if (idx != null) vsNegCandidates.push(find(idx));
    } else if (kind === 'functiongenerator') {
      const idx = pinMap.get(makePinKey(c, 1));
      if (idx != null) vsNegCandidates.push(find(idx));
    }
  });
  const measurementKinds = new Set(['oscilloscope', 'junction']);
  const rootHasPhysics = new Map();
  components.forEach((c) => {
    const measurement = measurementKinds.has(kindOf(c));
    c.pins.forEach((_, i) => {
      const raw = pinMap.get(makePinKey(c, i));
      if (raw == null) return;
      const r = find(raw);
      const wired = pinConnected(wires, c, i);
      if (!measurement && wired) {
        rootHasPhysics.set(r, true);
      } else if (!rootHasPhysics.has(r)) {
        rootHasPhysics.set(r, false);
      }
    });
  });

  // Select a reference that is actually tied to a physical net
  let groundRoot = null;
  for (const gr of groundRoots) {
    if (rootHasPhysics.get(gr) === true) {
      groundRoot = gr;
      break;
    }
  }
  if (groundRoot == null) {
    for (const cand of vsNegCandidates) {
      if (rootHasPhysics.get(cand) === true) {
        groundRoot = cand;
        break;
      }
    }
  }

  const rootToNode = new Map();
  const pinToNode = new Map();
  if (groundRoot != null) rootToNode.set(groundRoot, -1);
  let nodeCount = 0;
  const seen = new Set();
  components.forEach((c) => {
    c.pins.forEach((_, i) => {
      const raw = pinMap.get(makePinKey(c, i));
      if (raw == null) return;
      const r = find(raw);
      if (r === groundRoot) return;
      if (seen.has(r)) return;
      seen.add(r);
      if (rootHasPhysics.get(r) === true) {
        rootToNode.set(r, nodeCount);
        nodeCount += 1;
      }
    });
  });

  components.forEach((c) => {
    c.pins.forEach((_, i) => {
      const raw = pinMap.get(makePinKey(c, i));
      if (raw == null) return;
      const r = find(raw);
      const n = rootToNode.get(r);
      pinToNode.set(makePinKey(c, i), (n == null ? -1 : n));
    });
  });

  return { pinMap, rootToNode, pinToNode, nodeCount, groundRoot };
}

function updateComponentState({ components, solution, getNodeIndex, parseUnit: parse }) {
  components.forEach((c) => {
    const kind = kindOf(c);
    if (kind === 'capacitor') {
      const n1 = getNodeIndex(c, 0);
      const n2 = getNodeIndex(c, 1);
      const v1 = (n1 === -1 ? 0 : solution[n1]);
      const v2 = (n2 === -1 ? 0 : solution[n2]);
      c._lastV = v1 - v2;
    } else if (kind === 'led') {
      const nA = getNodeIndex(c, 0);
      const nK = getNodeIndex(c, 1);
      const vA = (nA === -1 ? 0 : solution[nA]);
      const vK = (nK === -1 ? 0 : solution[nK]);
      const Vf = parse(c.props?.Vf || '3.3');
      const If = parse(c.props?.If || '10m') || 0.01;
      let R = Math.abs(Vf / If);
      if (!Number.isFinite(R) || R <= 0) R = 330;
      c._lastI = (vA - vK) / R;
      c._forwardOn = (vA - vK) > Vf * 0.8;
    } else if (kind === 'mosfet') {
      const nG = getNodeIndex(c, 0);
      const nD = getNodeIndex(c, 1);
      const nS = getNodeIndex(c, 2);
      const nB = getNodeIndex(c, 3);
      c._lastVg = (nG === -1 ? 0 : solution[nG]);
      c._lastVd = (nD === -1 ? 0 : solution[nD]);
      c._lastVs = (nS === -1 ? 0 : solution[nS]);
      c._lastVb = (nB === -1 ? c._lastVs : solution[nB]);
    }
  });
}

function createStampHelpers(system, mapNode) {
  function stampConductance(n1, n2, g) {
    if (!g) return;
    const i1 = (n1 === -1 ? null : mapNode(n1));
    const i2 = (n2 === -1 ? null : mapNode(n2));
    if (i1 != null) system.addToG(i1, i1, g);
    if (i2 != null) system.addToG(i2, i2, g);
    if (i1 != null && i2 != null) {
      system.addToG(i1, i2, -g);
      system.addToG(i2, i1, -g);
    }
  }

  function stampCurrent(n, val) {
    if (!val || n === -1) return;
    const idx = mapNode(n);
    system.addToB(idx, val);
  }

  function stampVCVS(nOut, nRef, nPos, nNeg, gain) {
    const row = system.allocateAuxVariable();
    const iOut = (nOut === -1 ? null : mapNode(nOut));
    const iRef = (nRef === -1 ? null : mapNode(nRef));
    const iPos = (nPos === -1 ? null : mapNode(nPos));
    const iNeg = (nNeg === -1 ? null : mapNode(nNeg));
    if (iOut != null) {
      system.addToG(iOut, row, 1);
      system.addToG(row, iOut, 1);
    }
    if (iRef != null) {
      system.addToG(iRef, row, -1);
      system.addToG(row, iRef, -1);
    }
    if (iPos != null) system.addToG(row, iPos, -gain);
    if (iNeg != null) system.addToG(row, iNeg, gain);
    system.addToG(row, row, 1e-9);
    return row;
  }

  function stampVoltageSource(nPlus, nMinus, value) {
    if (nPlus === -1 && nMinus === -1) return null;
    const row = system.allocateAuxVariable();
    const iPlus = (nPlus === -1 ? null : mapNode(nPlus));
    const iMinus = (nMinus === -1 ? null : mapNode(nMinus));
    if (iPlus != null) {
      system.addToG(iPlus, row, 1);
      system.addToG(row, iPlus, 1);
    }
    if (iMinus != null) {
      system.addToG(iMinus, row, -1);
      system.addToG(row, iMinus, -1);
    }
    system.addToG(row, row, 1e-9);
    system.addToB(row, value);
    return row;
  }

  function nodeVoltageFromSolution(solution, node) {
    if (node == null || node === -1) return 0;
    const idx = mapNode(node);
    return solution?.[idx] ?? 0;
  }

  return {
    stampConductance,
    stampCurrent,
    stampVCVS,
    stampVoltageSource,
    nodeVoltageFromSolution,
    mapNode
  };
}

function solveWithRetry(system, { baselineLeak, nodeIndices }) {
  let { solution, singular } = system.solveWithStatus();
  if (singular) {
    nodeIndices.forEach((idx) => {
      system.addToG(idx, idx, baselineLeak * 10);
    });
    ({ solution, singular } = system.solveWithStatus());
  }
  return { solution, singular };
}

function buildSimulationComponents({
  components,
  wires,
  getNodeIndex,
  parse,
  dt,
  time,
  funcGenRefRes,
  funcGenSeriesRes,
  opAmpGain,
  opAmpInputLeak,
  opAmpOutputLeak,
  opAmpHeadroom,
  opAmpComparatorHysteresis,
  maxOutputClamp,
  mapNode,
  registerSource = () => {}
}) {
  const simComponents = [];
  const diodeComponents = [];
  const opAmpComponents = [];

  components.forEach((c) => {
    const kind = kindOf(c);
    if (kind === 'resistor') {
      const n1 = getNodeIndex(c, 0);
      const n2 = getNodeIndex(c, 1);
      const R = parse(c.props?.R || '1');
      simComponents.push(new Resistor(n1, n2, R));
    } else if (kind === 'potentiometer') {
      const n1 = getNodeIndex(c, 0);
      const nW = getNodeIndex(c, 1);
      const n3 = getNodeIndex(c, 2);
      const totalR = Math.max(parse(c.props?.R || '0'), 1e-3);
      const frac = (typeof c.getTurnFraction === 'function')
        ? c.getTurnFraction()
        : Math.min(1, Math.max(0, parseFloat(c.props?.Turn || '50') / 100));
      simComponents.push(new Potentiometer(n1, nW, n3, totalR, frac));
    } else if (kind === 'capacitor') {
      const n1 = getNodeIndex(c, 0);
      const n2 = getNodeIndex(c, 1);
      const C = parse(c.props?.C || '0');
      simComponents.push(new Capacitor(n1, n2, C, dt, c._lastV || 0));
    } else if (kind === 'led') {
      const nA = getNodeIndex(c, 0);
      const nK = getNodeIndex(c, 1);
      const Vf = Math.max(0, parse(c.props?.Vf || '3.3'));
      const If = parse(c.props?.If || '10m') || 0.01;
      const led = new LED(nA, nK, { Vf, If, forwardOn: !!c._forwardOn });
      diodeComponents.push(led);
      simComponents.push(led);
    } else if (kind === 'switch') {
      const type = c.props?.Type || 'SPST';
      const position = c.props?.Position || 'A';
      const nodes = c.pins.map((_, idx) => getNodeIndex(c, idx));
      const getActiveConnections = (typeof c.getActiveConnections === 'function')
        ? () => c.getActiveConnections()
        : null;
      simComponents.push(new Switch(nodes, { type, position, getActiveConnections }));
    } else if (kind === 'mosfet') {
      const nodes = [
        getNodeIndex(c, 0),
        getNodeIndex(c, 1),
        getNodeIndex(c, 2),
        getNodeIndex(c, 3)
      ];
      simComponents.push(new MOSFET(nodes[0], nodes[1], nodes[2], nodes[3], {
        type: c.props?.Type || 'NMOS',
        vt: Math.abs(parse(c.props?.Vth || '0.7')),
        kp: parse(c.props?.Kp || '140u'),
        W: parse(c.props?.W || '1u'),
        L: parse(c.props?.L || '1u') || 1e-6,
        lambda: parse(c.props?.Lambda || '0.0'),
        gamma: Math.max(0, parse(c.props?.Gamma || '0')),
        phi: Math.max(0, parse(c.props?.Phi || '0.9')),
        lastVg: c._lastVg ?? 0,
        lastVd: c._lastVd ?? 0,
        lastVs: c._lastVs ?? 0,
        lastVb: c._lastVb ?? null
      }));
    } else if (kind === 'voltagesource') {
      const nPlus = getNodeIndex(c, 0);
      const nMinus = getNodeIndex(c, 1);
      const value = parse(c.props?.Vdc || '0');
      registerSource(nPlus, nMinus, value);
      simComponents.push(new VoltageSource(nPlus, nMinus, value));
    } else if (kind === 'functiongenerator') {
      const plusUsed = pinConnected(wires, c, 0);
      const comUsed = pinConnected(wires, c, 1);
      const negUsed = pinConnected(wires, c, 2);

      const nPlus = plusUsed ? getNodeIndex(c, 0) : -1;
      const nCom = (comUsed || plusUsed || negUsed) ? getNodeIndex(c, 1) : -1;
      const nNeg = negUsed ? getNodeIndex(c, 2) : -1;

      const Vpp = parse(c.props?.Vpp || '0');
      const Freq = parse(c.props?.Freq || '0');
      const offset = parse(c.props?.Offset || '0');
      const phaseRad = ((parseFloat(c.props?.Phase) || 0) * Math.PI) / 180;
      const amp = Vpp / 2;
      const omega = 2 * Math.PI * Freq;
      const phase = omega * time + phaseRad;
      const waveType = String(c.props?.Wave || 'sine').toLowerCase();
      let ac = 0;
      if (waveType === 'square') {
        ac = amp * (Math.sin(phase) >= 0 ? 1 : -1);
      } else if (waveType === 'triangle') {
        const cyc = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
        const tri = cyc < 0.5 ? (cyc * 4 - 1) : (3 - cyc * 4);
        ac = amp * tri;
      } else {
        ac = amp * Math.sin(phase);
      }

      const refG = funcGenRefRes > 0 ? 1 / funcGenRefRes : 0;
      const seriesG = funcGenSeriesRes > 0 ? 1 / funcGenSeriesRes : 0;
      if (seriesG === 0) {
        if (nPlus !== -1) registerSource(nPlus, nCom, offset + ac);
        if (nNeg !== -1) registerSource(nNeg, nCom, offset - ac);
      }
      simComponents.push(new FunctionGenerator(nPlus, nCom, nNeg, {
        refG,
        seriesG,
        valuePlus: offset + ac,
        valueNeg: offset - ac
      }));
    } else if (kind === 'lf412') {
      const halves = [
        {
          nOut: getNodeIndex(c, 0),
          nInv: getNodeIndex(c, 1),
          nNon: getNodeIndex(c, 2),
          nVMinus: getNodeIndex(c, 3),
          nVPlus: getNodeIndex(c, 7)
        },
        {
          nOut: getNodeIndex(c, 6),
          nInv: getNodeIndex(c, 5),
          nNon: getNodeIndex(c, 4),
          nVMinus: getNodeIndex(c, 3),
          nVPlus: getNodeIndex(c, 7)
        }
      ];
      halves.forEach((h) => {
        if (h.nOut === -1 && h.nInv === -1 && h.nNon === -1) return;
        const opAmp = new IdealOpAmp({
          ...h,
          gain: opAmpGain,
          inputLeak: opAmpInputLeak,
          outputLeak: opAmpOutputLeak,
          headroom: opAmpHeadroom,
          comparatorHysteresis: opAmpComparatorHysteresis,
          maxOutputClamp,
          mapNode
        });
        opAmpComponents.push(opAmp);
        simComponents.push(opAmp);
      });
    }
  });

  return { simComponents, diodeComponents, opAmpComponents };
}

function runSimulation(opts = {}) {
  const components = opts.components || [];
  const wires = opts.wires || [];
  const t = opts.time || 0;
  const dt = opts.dt || DEFAULTS.dt;
  const parse = opts.parseUnit || parseUnit;
  const baselineLeak = opts.baselineLeak ?? DEFAULTS.baselineLeak;
  const opAmpGain = opts.opAmpGain ?? DEFAULTS.opAmpGain;
  const opAmpInputLeak = opts.opAmpInputLeak ?? DEFAULTS.opAmpInputLeak;
  const opAmpOutputLeak = opts.opAmpOutputLeak ?? DEFAULTS.opAmpOutputLeak;
  const opAmpHeadroom = opts.opAmpHeadroom ?? DEFAULTS.opAmpHeadroom;
  const opAmpComparatorHysteresis = opts.opAmpComparatorHysteresis ?? DEFAULTS.opAmpComparatorHysteresis;
  const funcGenRefRes = opts.funcGenRefRes ?? DEFAULTS.funcGenRefRes;
  const funcGenSeriesRes = opts.funcGenSeriesRes ?? DEFAULTS.funcGenSeriesRes;
  const maxOutputClamp = opts.maxOutputClamp ?? DEFAULTS.maxOutputClamp;
  const maxDiodeIterations = opts.maxDiodeIterations ?? DEFAULTS.maxDiodeIterations;

  if (!components.length) {
    const getNodeIndex = () => -1;
    return {
      solution: [],
      pinToNode: new Map(),
      getNodeIndex,
      nodeCount: 0,
      groundRoot: null,
      singular: false,
      error: null
    };
  }

  const mapping = buildMapping({ components, wires });
  if (mapping.groundRoot == null) {
    return {
      solution: [],
      pinToNode: mapping.pinToNode,
      getNodeIndex: () => -1,
      nodeCount: mapping.nodeCount,
      groundRoot: null,
      singular: false,
      error: 'No reference node found: connect a Ground or tie a source COM/negative to the circuit.'
    };
  }

  const pinToNode = mapping.pinToNode;
  const getNodeIndex = (comp, pin) => {
    const key = makePinKey(comp, pin);
    const n = pinToNode.get(key);
    return (n == null ? -1 : n);
  };

  const mapNode = (node) => (node == null || node === -1 ? 0 : node + 1);
  const physicalNodeIndices = [];
  mapping.rootToNode.forEach((n) => {
    if (n !== -1) physicalNodeIndices.push(mapNode(n));
  });

  let sourceConflict = false;
  const sourceMap = new Map();
  const registerSource = (nPlus, nMinus, value) => {
    if (nPlus === -1 && nMinus === -1) return;
    const a = nPlus;
    const b = nMinus;
    const key = (a <= b) ? `${a}|${b}` : `${b}|${a}`;
    const val = (a <= b) ? value : -value;
    const prev = sourceMap.get(key);
    if (prev != null && Math.abs(prev - val) > 1e-9) {
      sourceConflict = true;
    } else {
      sourceMap.set(key, val);
    }
  };

  const { simComponents, diodeComponents, opAmpComponents } = buildSimulationComponents({
    components,
    wires,
    getNodeIndex,
    parse,
    dt,
    time: t,
    funcGenRefRes,
    funcGenSeriesRes,
    opAmpGain,
    opAmpInputLeak,
    opAmpOutputLeak,
    opAmpHeadroom,
    opAmpComparatorHysteresis,
    maxOutputClamp,
    mapNode,
    registerSource
  });

  if (sourceConflict) {
    return {
      solution: [],
      pinToNode,
      getNodeIndex,
      nodeCount: mapping.nodeCount,
      groundRoot: mapping.groundRoot,
      singular: true,
      error: 'Conflicting ideal voltage sources detected'
    };
  }

  let finalSolution = null;
  let singular = false;

  for (let attempt = 0; attempt < maxDiodeIterations; attempt += 1) {
    const system = new MNASystem(mapping.nodeCount + 1);
    const stamps = createStampHelpers(system, mapNode);

    // baseline leak to reference for all physical nodes
    mapping.rootToNode.forEach((n) => {
      if (n !== -1) stamps.stampConductance(n, -1, baselineLeak);
    });

    simComponents.forEach((comp) => {
      if (typeof comp.stamp === 'function') comp.stamp(stamps);
    });

    const solved = solveWithRetry(system, { baselineLeak, nodeIndices: physicalNodeIndices });
    singular = solved.singular;
    finalSolution = solved.solution;
    if (singular) break;

    const diodeChanged = diodeComponents.some(
      (d) => typeof d.updateDiodeState === 'function'
        ? d.updateDiodeState(finalSolution, stamps.nodeVoltageFromSolution)
        : false
    );
    if (!diodeChanged) break;
  }

  if (singular) {
    return {
      solution: finalSolution || [],
      pinToNode,
      getNodeIndex,
      nodeCount: mapping.nodeCount,
      groundRoot: mapping.groundRoot,
      singular: true,
      error: 'Circuit is singular (check ground or shorted sources)'
    };
  }

  if (finalSolution && opAmpComponents.length) {
    opAmpComponents.forEach((op) => {
      if (typeof op.clampOutput === 'function') {
        op.clampOutput(finalSolution);
      }
    });
  }

  const nodeSolution = new Float64Array(mapping.nodeCount);
  for (let i = 0; i < mapping.nodeCount; i += 1) {
    const idx = mapNode(i);
    nodeSolution[i] = finalSolution?.[idx] ?? 0;
  }

  if (opts.updateState !== false) {
    updateComponentState({
      components,
      solution: nodeSolution,
      getNodeIndex,
      parseUnit: parse
    });
  }

  return {
    solution: nodeSolution,
    pinToNode,
    getNodeIndex,
    nodeCount: mapping.nodeCount,
    groundRoot: mapping.groundRoot,
    singular: false,
    error: null
  };
}

const api = {
  runSimulation,
  parseUnit,
  updateComponentState,
  MNASystem
};

if (typeof window !== 'undefined') {
  window.CircuitSim = api;
}

export {
  runSimulation,
  parseUnit,
  updateComponentState,
  MNASystem
};

export default api;
