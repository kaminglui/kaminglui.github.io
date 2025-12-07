/**
 * Headless circuit simulator core for Circuit Forge.
 * - Builds a Modified Nodal Analysis (MNA) matrix from component + wire lists.
 * - Supports tiny leak conductances to keep floating sub-circuits solvable.
 * - Provides an ideal op-amp model with rail saturation and a simple LED model
 *   with forward knee voltage and reverse leakage.
 *
 * The module is UI-free so it can be used from both the browser page and
 * Node-based unit tests. A small UMD wrapper exposes `CircuitSim` in the
 * browser and `module.exports` in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CircuitSim = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    dt: 1e-7,
    baselineLeak: 1e-11,
    opAmpGain: 1e6,
    opAmpInputLeak: 1e-15,
    opAmpOutputLeak: 1e-12,
    opAmpHeadroom: 0.1,
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

  class Matrix {
    constructor(n) {
      this.n = n;
      this.data = new Float64Array(n * n);
    }
    add(r, c, v) {
      if (r < 0 || c < 0 || r >= this.n || c >= this.n) return;
      this.data[r * this.n + c] += v;
    }
    solve(rhs) {
      const n = this.n;
      const a = this.data.slice();
      const b = rhs.slice();
      const x = new Float64Array(n);
      const EPS = 1e-12;
      let singular = false;

      for (let i = 0; i < n; i += 1) {
        let maxRow = i;
        let maxVal = Math.abs(a[i * n + i]);
        for (let r = i + 1; r < n; r += 1) {
          const val = Math.abs(a[r * n + i]);
          if (val > maxVal) { maxVal = val; maxRow = r; }
        }
        if (maxRow !== i) {
          for (let c = i; c < n; c += 1) {
            const idx1 = i * n + c;
            const idx2 = maxRow * n + c;
            const tmp = a[idx1];
            a[idx1] = a[idx2];
            a[idx2] = tmp;
          }
          const tb = b[i];
          b[i] = b[maxRow];
          b[maxRow] = tb;
        }

        const pivot = a[i * n + i];
        if (Math.abs(pivot) < EPS) {
          singular = true;
          break;
        }

        for (let r = i + 1; r < n; r += 1) {
          const factor = a[r * n + i] / pivot;
          if (!factor) continue;
          a[r * n + i] = 0;
          for (let c = i + 1; c < n; c += 1) {
            a[r * n + c] -= factor * a[i * n + c];
          }
          b[r] -= factor * b[i];
        }
      }

      if (singular) return { x, singular: true };

      for (let i = n - 1; i >= 0; i -= 1) {
        let sum = 0;
        for (let c = i + 1; c < n; c += 1) {
          sum += a[i * n + c] * x[c];
        }
        const pivot = a[i * n + i];
        x[i] = (Math.abs(pivot) < EPS) ? 0 : (b[i] - sum) / pivot;
        if (!Number.isFinite(x[i])) x[i] = 0;
      }

      return { x, singular: false };
    }
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

    let groundRoot = null;
    components.forEach((c) => {
      if (kindOf(c) === 'ground') {
        const idx = pinMap.get(makePinKey(c, 0));
        if (idx != null) {
          const r = find(idx);
          groundRoot = (groundRoot == null) ? r : groundRoot;
          union(groundRoot, r);
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
    if (groundRoot == null && vsNegCandidates.length) {
      groundRoot = vsNegCandidates[0];
    }

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
        error: 'No reference node found: add a Ground or tie a source COM/negative to the circuit.'
      };
    }

    const pinToNode = mapping.pinToNode;
    const getNodeIndex = (comp, pin) => {
      const key = makePinKey(comp, pin);
      const n = pinToNode.get(key);
      return (n == null ? -1 : n);
    };

    const vsEntries = [];
    const pendingGStamps = [];
    const opAmpEntries = [];

    components.forEach((c) => {
      const kind = kindOf(c);
      if (kind === 'voltagesource') {
        const nPlus = getNodeIndex(c, 0);
        const nMinus = getNodeIndex(c, 1);
        if (nPlus === -1 && nMinus === -1) return;
        vsEntries.push({
          comp: c,
          nPlus,
          nMinus,
          valueFn: () => parse(c.props?.Vdc || '0')
        });
      } else if (kind === 'functiongenerator') {
        const plusUsed = pinConnected(wires, c, 0);
        const comUsed = pinConnected(wires, c, 1);
        const negUsed = pinConnected(wires, c, 2);

        const nPlus = plusUsed ? getNodeIndex(c, 0) : -1;
        const nCom = (comUsed || plusUsed || negUsed) ? getNodeIndex(c, 1) : -1;
        const nNeg = negUsed ? getNodeIndex(c, 2) : -1;

        const waveValue = () => {
          const Vpp = parse(c.props?.Vpp || '0');
          const Freq = parse(c.props?.Freq || '0');
          const offset = parse(c.props?.Offset || '0');
          const phaseRad = ((parseFloat(c.props?.Phase) || 0) * Math.PI) / 180;
          const amp = Vpp / 2;
          const omega = 2 * Math.PI * Freq;
          const phase = omega * t + phaseRad;
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
          return { ac, offset };
        };

        const refG = funcGenRefRes > 0 ? 1 / funcGenRefRes : 0;
        const seriesG = funcGenSeriesRes > 0 ? 1 / funcGenSeriesRes : 0;
        if (nCom !== -1 && refG) {
          pendingGStamps.push([nCom, -1, refG]);
        }

        if (nPlus !== -1) {
          if (seriesG) pendingGStamps.push([nPlus, nCom, seriesG]);
          vsEntries.push({
            comp: c,
            nPlus,
            nMinus: nCom,
            valueFn: () => {
              const { ac, offset } = waveValue();
              return offset + ac;
            }
          });
        }
        if (nNeg !== -1) {
          if (seriesG) pendingGStamps.push([nNeg, nCom, seriesG]);
          vsEntries.push({
            comp: c,
            nPlus: nNeg,
            nMinus: nCom,
            valueFn: () => {
              const { ac, offset } = waveValue();
              return offset - ac;
            }
          });
        }
      } else if (kind === 'lf412') {
        const halves = [
          {
            nOut: getNodeIndex(c, 0),
            nInv: getNodeIndex(c, 1),
            nNon: getNodeIndex(c, 2),
            nVMinus: getNodeIndex(c, 3),
            nVPlus: getNodeIndex(c, 7),
            comp: c
          },
          {
            nOut: getNodeIndex(c, 6),
            nInv: getNodeIndex(c, 5),
            nNon: getNodeIndex(c, 4),
            nVMinus: getNodeIndex(c, 3),
            nVPlus: getNodeIndex(c, 7),
            comp: c
          }
        ];
        halves.forEach((h) => {
          if (h.nOut === -1 && h.nInv === -1 && h.nNon === -1) return;
          opAmpEntries.push(h);
        });
      }
    });

    const opAmpOffset = mapping.nodeCount + vsEntries.length;
    const N = opAmpOffset + opAmpEntries.length;

    const diodeStates = new Map();
    components.forEach((c) => {
      if (kindOf(c) === 'led') {
        diodeStates.set(c, !!c._forwardOn);
      }
    });

    function stampAndSolve() {
      const G = new Matrix(N);
      const I = new Float64Array(N);

      function stampG(n1, n2, g) {
        if (!g) return;
        if (n1 !== -1) G.add(n1, n1, g);
        if (n2 !== -1) G.add(n2, n2, g);
        if (n1 !== -1 && n2 !== -1) {
          G.add(n1, n2, -g);
          G.add(n2, n1, -g);
        }
      }
      function stampI(n, val) {
        if (!val || n === -1) return;
        I[n] += val;
      }
      function stampVCVS(nOut, nRef, nPos, nNeg, row) {
        if (nOut !== -1) G.add(nOut, row, 1);
        if (nRef !== -1) G.add(nRef, row, -1);
        if (nOut !== -1) G.add(row, nOut, 1);
        if (nRef !== -1) G.add(row, nRef, -1);
        if (nPos !== -1) G.add(row, nPos, -opAmpGain);
        if (nNeg !== -1) G.add(row, nNeg, opAmpGain);
        G.add(row, row, 1e-9);
      }

      pendingGStamps.forEach(([a, b, g]) => stampG(a, b, g));
      mapping.rootToNode.forEach((n) => {
        if (n !== -1) stampG(n, -1, baselineLeak);
      });

      components.forEach((c) => {
        const kind = kindOf(c);
        if (kind === 'resistor') {
          const n1 = getNodeIndex(c, 0);
          const n2 = getNodeIndex(c, 1);
          const R = parse(c.props?.R || '1');
          const g = (R > 0) ? 1 / R : 0;
          stampG(n1, n2, g);
        } else if (kind === 'potentiometer') {
          const n1 = getNodeIndex(c, 0);
          const nW = getNodeIndex(c, 1);
          const n3 = getNodeIndex(c, 2);
          const totalR = Math.max(parse(c.props?.R || '0'), 1e-3);
          const frac = (typeof c.getTurnFraction === 'function')
            ? c.getTurnFraction()
            : Math.min(1, Math.max(0, parseFloat(c.props?.Turn || '50') / 100));
          const minLeg = 1e-3;
          const R1 = Math.max(minLeg, totalR * frac);
          const R2 = Math.max(minLeg, totalR * (1 - frac));
          stampG(n1, nW, 1 / R1);
          stampG(nW, n3, 1 / R2);
        } else if (kind === 'capacitor') {
          const n1 = getNodeIndex(c, 0);
          const n2 = getNodeIndex(c, 1);
          const C = parse(c.props?.C || '0');
          if (C > 0 && dt > 0) {
            const g = C / dt;
            const vPrev = c._lastV || 0;
            stampG(n1, n2, g);
            stampI(n1, g * vPrev);
            stampI(n2, -g * vPrev);
          }
        } else if (kind === 'led') {
          const nA = getNodeIndex(c, 0);
          const nK = getNodeIndex(c, 1);
          const Vf = Math.max(0, parse(c.props?.Vf || '3.3'));
          const If = parse(c.props?.If || '10m') || 0.01;
          let R = Math.abs(Vf / If);
          if (!Number.isFinite(R) || R <= 0) R = 330;
          const gOn = 1 / R;
          const gOff = 1e-9;
          const forward = diodeStates.get(c) === true;
          const g = forward ? gOn : gOff;
          stampG(nA, nK, g);
          if (forward) {
            stampI(nA, gOn * Vf);
            stampI(nK, -gOn * Vf);
          }
        } else if (kind === 'switch') {
          const gOn = 1 / 1e-3;
          const gOff = 1e-9;
          const pairs = (typeof c.getActiveConnections === 'function')
            ? c.getActiveConnections()
            : [];
          if (!pairs.length && c.props?.Type === 'SPST') {
            const nA = getNodeIndex(c, 0);
            const nB = getNodeIndex(c, 1);
            stampG(nA, nB, gOff);
          }
          pairs.forEach(([aIdx, bIdx]) => {
            const nA = getNodeIndex(c, aIdx);
            const nB = getNodeIndex(c, bIdx);
            stampG(nA, nB, gOn);
          });
          if (c.props?.Type === 'SPDT') {
            const unused = (c.props.Position === 'A') ? 2 : 1;
            const nCom = getNodeIndex(c, 0);
            const nUnused = getNodeIndex(c, unused);
            stampG(nCom, nUnused, gOff);
          } else if (c.props?.Type === 'DPDT') {
            const upperUnused = (c.props.Position === 'A') ? 2 : 1;
            const lowerUnused = (c.props.Position === 'A') ? 5 : 4;
            const nCom1 = getNodeIndex(c, 0);
            const nCom2 = getNodeIndex(c, 3);
            stampG(nCom1, getNodeIndex(c, upperUnused), gOff);
            stampG(nCom2, getNodeIndex(c, lowerUnused), gOff);
          }
        } else if (kind === 'mosfet') {
          const nG = getNodeIndex(c, 0);
          const nD = getNodeIndex(c, 1);
          const nS = getNodeIndex(c, 2);
          const nB = getNodeIndex(c, 3);

          const vG = (nG === -1 ? 0 : (c._lastVg ?? 0));
          const vD = (nD === -1 ? 0 : (c._lastVd ?? 0));
          const vS = (nS === -1 ? 0 : (c._lastVs ?? 0));
          const vB = (nB === -1 ? vS : (c._lastVb ?? vS));

          const isP = (c.props?.Type === 'PMOS');
          const vt = Math.abs(parse(c.props?.Vth || '0.7'));
          const kp0 = parse(c.props?.Kp || '140u');
          const W = parse(c.props?.W || '1u');
          const L = parse(c.props?.L || '1u') || 1e-6;
          const k = kp0 * (W / L);
          const lambda = parse(c.props?.Lambda || '0.0');
          const gamma = Math.max(0, parse(c.props?.Gamma || '0'));
          const phi = Math.max(0, parse(c.props?.Phi || '0.9'));

          const VsbRaw = isP ? (vB - vS) : (vS - vB);
          const Vsb = Math.max(0, VsbRaw);
          const rootBase = Math.sqrt(Math.max(0, phi));
          const rootBias = Math.sqrt(Math.max(0, phi + Vsb));
          const vtEff = vt + gamma * (rootBias - rootBase);

          let vgs = isP ? (vS - vG) : (vG - vS);
          let vds = isP ? (vS - vD) : (vD - vS);
          let ids = 0;

          if (vgs > vtEff) {
            if (vds < vgs - vtEff) {
              ids = k * ((vgs - vtEff) * vds - 0.5 * vds * vds);
            } else {
              const vov = vgs - vtEff;
              ids = 0.5 * k * vov * vov * (1 + lambda * (vds - vov));
            }
          }
          if (isP) ids = -ids;

          if (nD !== -1) I[nD] -= ids;
          if (nS !== -1) I[nS] += ids;

          const gLeak = 1e-9;
          stampG(nD, nS, gLeak);
        }
      });

      opAmpEntries.forEach((entry, idx) => {
        const row = opAmpOffset + idx;
        const { nOut, nInv, nNon } = entry;
        if (nNon !== -1) stampG(nNon, -1, opAmpInputLeak);
        if (nInv !== -1) stampG(nInv, -1, opAmpInputLeak);
        if (nOut !== -1) stampG(nOut, -1, opAmpOutputLeak);
        stampVCVS(nOut, -1, nNon, nInv, row);
      });

      vsEntries.forEach((src, idx) => {
        const row = mapping.nodeCount + idx;
        const { nPlus, nMinus } = src;
        if (nPlus === -1 && nMinus === -1) return;
        if (nPlus !== -1) {
          G.add(nPlus, row, 1);
          G.add(row, nPlus, 1);
        }
        if (nMinus !== -1) {
          G.add(nMinus, row, -1);
          G.add(row, nMinus, -1);
        }
        G.add(row, row, 1e-9);
        const vSrc = src.valueFn ? src.valueFn() : 0;
        I[row] += vSrc;
      });

      let solved = G.solve(I);
      if (solved.singular) {
        for (let n = 0; n < mapping.nodeCount; n += 1) {
          G.add(n, n, baselineLeak * 10);
        }
        solved = G.solve(I);
      }
      return { solution: solved.x, singular: solved.singular };
    }

    let finalSolution = null;
    let singular = false;
    for (let attempt = 0; attempt < maxDiodeIterations; attempt += 1) {
      const { solution, singular: isSingular } = stampAndSolve();
      singular = isSingular;
      if (singular) break;

      const updateNeeded = (() => {
        let changed = false;
        components.forEach((c) => {
          if (kindOf(c) !== 'led') return;
          const nA = getNodeIndex(c, 0);
          const nK = getNodeIndex(c, 1);
          const vA = (nA === -1 ? 0 : solution[nA]);
          const vK = (nK === -1 ? 0 : solution[nK]);
          const vf = Math.max(0, parse(c.props?.Vf || '3.3'));
          const onThresh = vf * 0.9;
          const offThresh = vf * 0.7;
          const prev = diodeStates.get(c) === true;
          const vDiff = vA - vK;
          const next = prev
            ? (vDiff > offThresh)
            : (vDiff > onThresh);
          if (next !== prev) {
            diodeStates.set(c, next);
            changed = true;
          }
        });
        return changed;
      })();

      finalSolution = solution;
      if (!updateNeeded) break;
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

    const clampedSolution = finalSolution.slice();
    opAmpEntries.forEach((entry) => {
      const { nOut, nVPlus, nVMinus } = entry;
      if (nOut == null || nOut === -1) return;
      const railsHigh = (nVPlus == null) ? maxOutputClamp : (nVPlus === -1 ? 0 : clampedSolution[nVPlus]);
      const railsLow = (nVMinus == null) ? -maxOutputClamp : (nVMinus === -1 ? 0 : clampedSolution[nVMinus]);
      const railMax = Math.max(railsHigh, railsLow);
      const railMin = Math.min(railsHigh, railsLow);
      const vmax = Math.min(railMax - opAmpHeadroom, maxOutputClamp);
      const vmin = Math.max(railMin + opAmpHeadroom, -maxOutputClamp);
      const safeMin = Math.min(vmin, vmax);
      const safeMax = Math.max(vmin, vmax);
      const clamped = Math.max(safeMin, Math.min(safeMax, clampedSolution[nOut]));
      clampedSolution[nOut] = clamped;
    });

    if (opts.updateState !== false) {
      updateComponentState({
        components,
        solution: clampedSolution,
        getNodeIndex,
        parseUnit: parse
      });
    }

    return {
      solution: clampedSolution,
      pinToNode,
      getNodeIndex,
      nodeCount: mapping.nodeCount,
      groundRoot: mapping.groundRoot,
      singular: false,
      error: null
    };
  }

  return {
    runSimulation,
    parseUnit,
    Matrix,
    updateComponentState
  };
}));
