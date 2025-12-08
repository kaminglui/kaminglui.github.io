import engine from '../engine.js';
import {
  COMPONENT_ID_PREFIXES,
  defaultIdRegistry,
  reserveComponentId as reserveComponentIdWithRegistry,
  resetIdRegistry as resetIdRegistryState
} from '../utils/idGenerator.js';
import { peakToPeak, rms, singleToneAmplitude, toneProjection } from '../utils/waveform.js';

const { runSimulation, parseUnit } = engine;

// Mirrors engine defaults so tests can reason about internal impedances.
const FUNCGEN_REF_RES = 1;
const FUNCGEN_SERIES_RES = 1;

function reserveId(kind, providedId) {
  const prefix = COMPONENT_ID_PREFIXES[kind] || 'X';
  return reserveComponentIdWithRegistry(prefix, defaultIdRegistry, providedId);
}

function resetIdRegistry() {
  resetIdRegistryState(defaultIdRegistry);
}

// Component factories
function makeComponent(kind, pinCount, props = {}, id) {
  return {
    id: reserveId(kind, id),
    kind,
    pins: Array.from({ length: pinCount }, () => ({ x: 0, y: 0 })),
    props
  };
}

function makeSwitch(type = 'SPST', position = 'A', id) {
  const typeUpper = (type || 'SPST').toUpperCase();
  const counts = { SPST: 2, SPDT: 3, DPDT: 6 };
  const pinCount = counts[typeUpper] || 2;
  const comp = makeComponent('switch', pinCount, { Type: typeUpper, Position: position || 'A' }, id);
  comp.getActiveConnections = function getActiveConnections() {
    const pos = this.props.Position === 'B' ? 'B' : 'A';
    const t = this.props.Type || 'SPST';
    if (t === 'SPST') return (pos === 'A') ? [[0, 1]] : [];
    if (t === 'SPDT') {
      const idx = (pos === 'A') ? 1 : 2;
      return [[0, idx]];
    }
    if (t === 'DPDT') {
      const upper = (pos === 'A') ? 1 : 2;
      const lower = (pos === 'A') ? 4 : 5;
      return [
        [0, upper],
        [3, lower]
      ];
    }
    return [];
  };
  return comp;
}

function makeGround(id) {
  return makeComponent('ground', 1, {}, id);
}

function makeVoltageSource(value, id) {
  return makeComponent('voltagesource', 2, { Vdc: String(value) }, id);
}

function makeFunctionGenerator(props = {}, id) {
  return makeComponent('functiongenerator', 3, {
    Vpp: props.Vpp || '1',
    Freq: props.Freq || '1k',
    Offset: props.Offset || '0',
    Phase: props.Phase || '0',
    Wave: props.Wave || 'sine'
  }, id);
}

function makeResistor(value, id) {
  return makeComponent('resistor', 2, { R: String(value) }, id);
}

function makeCapacitor(value, id) {
  return makeComponent('capacitor', 2, { C: String(value) }, id);
}

function makePotentiometer(total, turn = 50, id) {
  return makeComponent('potentiometer', 3, { R: String(total), Turn: String(turn) }, id);
}

function makeLED(props = {}, id) {
  return makeComponent('led', 2, {
    Vf: props.Vf || '3.3',
    If: props.If || '10m',
    Color: props.Color || 'red'
  }, id);
}

function makeOpAmp(id) {
  return makeComponent('lf412', 8, {}, id);
}

function makeOscilloscope(props = {}, id) {
  return makeComponent('oscilloscope', 3, {
    TimeDiv: props.TimeDiv || '1m',
    VDiv1: props.VDiv1 || '1',
    VDiv2: props.VDiv2 || '1'
  }, id);
}

function makeMosfet(type = 'NMOS', props = {}, id) {
  return makeComponent('mosfet', 4, {
    Type: type || 'NMOS',
    W: props.W || '1u',
    L: props.L || '1u',
    Kp: props.Kp || '140u',
    Vth: props.Vth || '0.7',
    Lambda: props.Lambda || '0.1',
    Gamma: props.Gamma || '0.45',
    Phi: props.Phi || '0.9'
  }, id);
}

// Circuit assembly helpers
function wire(c1, p1, c2, p2) {
  return { from: { c: c1, p: p1 }, to: { c: c2, p: p2 } };
}

function buildCircuit() {
  const components = [];
  const wires = [];
  const add = (...cs) => {
    components.push(...cs);
    return cs;
  };
  const connect = (c1, p1, c2, p2) => {
    wires.push(wire(c1, p1, c2, p2));
    return wires[wires.length - 1];
  };
  return { components, wires, add, connect };
}

function makeVoltageReader(result) {
  const solution = Array.from(result.solution || []);
  return (component, pinIdx) => {
    const n = result.getNodeIndex ? result.getNodeIndex(component, pinIdx) : -1;
    return n === -1 ? 0 : solution[n];
  };
}

// Simulation runners
function simulateCircuit({ components, wires, time = 0, dt = 1e-7, updateState = true, ...rest }) {
  const res = runSimulation({
    components,
    wires,
    time,
    dt,
    updateState,
    parseUnit,
    ...rest
  });
  if (res.error) throw new Error(res.error);
  const voltage = makeVoltageReader(res);
  return { ...res, voltage };
}

function runDC(circuit, opts = {}) {
  return simulateCircuit({ components: circuit.components, wires: circuit.wires, ...opts });
}

function runTransient(circuit, {
  duration = 0,
  dt = 1e-5,
  sampleInterval = null,
  samplePoints = null,
  onStep,
  measure,
  updateState = true,
  ...rest
} = {}) {
  const samples = [];
  const sampleSet = Array.isArray(samplePoints) && samplePoints.length
    ? new Set(samplePoints.map((t) => Number(t.toFixed(12))))
    : null;
  let nextSample = 0;
  let t = 0;
  while (t <= duration + 1e-15) {
    if (typeof onStep === 'function') onStep({ t, components: circuit.components, wires: circuit.wires });
    const sim = simulateCircuit({
      components: circuit.components,
      wires: circuit.wires,
      time: t,
      dt,
      updateState,
      ...rest
    });
    const shouldSample = sampleSet
      ? sampleSet.has(Number(t.toFixed(12)))
      : (sampleInterval == null || t + 1e-15 >= nextSample);
    if (shouldSample) {
      const payload = typeof measure === 'function'
        ? measure({ t, sim })
        : { t, sim };
      samples.push(payload);
      if (sampleInterval != null) nextSample += sampleInterval;
    }
    t += dt;
  }
  return { samples };
}

// Circuit import/export helpers
function normalizeKind(entry) {
  const raw = (entry.kind || entry.type || '').toLowerCase();
  if (raw === 'funcgen') return 'functiongenerator';
  if (raw === 'voltagesource') return 'voltagesource';
  if (raw === 'voltageSource'.toLowerCase()) return 'voltagesource';
  return raw;
}

function exportCircuit(components, wires) {
  return {
    components: components.map((c) => ({
      id: c.id,
      kind: c.kind,
      props: { ...c.props }
    })),
    wires: wires.map((w) => ({
      from: { id: w.from.c.id, p: w.from.p },
      to: { id: w.to.c.id, p: w.to.p }
    }))
  };
}

function importCircuit(data, { resetIds: shouldReset = true } = {}) {
  if (shouldReset) resetIdRegistry();
  const factories = {
    ground: (entry) => makeGround(entry.id),
    voltagesource: (entry) => makeVoltageSource(entry.props?.Vdc || 0, entry.id),
    functiongenerator: (entry) => makeFunctionGenerator(entry.props || {}, entry.id),
    resistor: (entry) => makeResistor(entry.props?.R || 0, entry.id),
    capacitor: (entry) => makeCapacitor(entry.props?.C || 0, entry.id),
    potentiometer: (entry) => makePotentiometer(entry.props?.R || 0, entry.props?.Turn || 0, entry.id),
    led: (entry) => makeLED(entry.props || {}, entry.id),
    mosfet: (entry) => makeMosfet(entry.props?.Type || 'NMOS', entry.props || {}, entry.id),
    lf412: (entry) => makeOpAmp(entry.id),
    switch: (entry) => makeSwitch(entry.props?.Type || 'SPST', entry.props?.Position || 'A', entry.id),
    oscilloscope: (entry) => makeOscilloscope(entry.props || {}, entry.id),
    junction: (entry) => makeComponent('junction', 1, entry.props || {}, entry.id)
  };

  const components = (data.components || []).map((entry) => {
    const kind = normalizeKind(entry);
    const factory = factories[kind];
    return factory
      ? factory(entry)
      : makeComponent(kind || 'x', (entry.pins || []).length || 2, entry.props || {}, entry.id);
  });
  const compMap = new Map(components.map((c) => [c.id, c]));
  const wires = (data.wires || []).map((w) => wire(
    compMap.get(w.from?.id),
    w.from?.p ?? 0,
    compMap.get(w.to?.id),
    w.to?.p ?? 0
  )).filter((w) => w.from.c && w.to.c);
  return { components, wires };
}

function resistorCurrent(resistor, voltage) {
  const R = parseUnit(resistor.props?.R || '1');
  if (R === 0) return 0;
  return (voltage(resistor, 0) - voltage(resistor, 1)) / R;
}

// Waveform primitives used across tests
function sineAt(Vpp, freq, t, offset = 0, phaseDeg = 0) {
  const amp = Vpp / 2;
  const phase = 2 * Math.PI * freq * t + (phaseDeg * Math.PI) / 180;
  return offset + amp * Math.sin(phase);
}

function triangleAt(Vpp, freq, t, offset = 0) {
  const amp = Vpp / 2;
  const cyc = ((t * freq) % 1 + 1) % 1;
  const tri = cyc < 0.5 ? (cyc * 4 - 1) : (3 - cyc * 4);
  return offset + amp * tri;
}

export {
  buildCircuit,
  runDC,
  runTransient,
  makeComponent,
  makeSwitch,
  makeGround,
  makeVoltageSource,
  makeFunctionGenerator,
  makeResistor,
  makeCapacitor,
  makePotentiometer,
  makeLED,
  makeOpAmp,
  makeOscilloscope,
  makeMosfet,
  wire,
  simulateCircuit,
  runSimulation,
  parseUnit,
  resistorCurrent,
  sineAt,
  triangleAt,
  FUNCGEN_REF_RES,
  FUNCGEN_SERIES_RES,
  peakToPeak,
  rms,
  singleToneAmplitude,
  toneProjection,
  exportCircuit,
  importCircuit,
  resetIdRegistry
};
