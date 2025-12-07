import engine from '../../../assets/js/sim/engine.js';

const { runSimulation, parseUnit } = engine;

// Mirrors engine defaults so tests can reason about internal impedances.
const FUNCGEN_REF_RES = 1;
const FUNCGEN_SERIES_RES = 1;

function makeComponent(kind, pinCount, props = {}) {
  return {
    id: `${kind}-${Math.random().toString(16).slice(2)}`,
    kind,
    pins: Array.from({ length: pinCount }, () => ({ x: 0, y: 0 })),
    props
  };
}

function makeSwitch(type = 'SPST', position = 'A') {
  const typeUpper = (type || 'SPST').toUpperCase();
  const counts = { SPST: 2, SPDT: 3, DPDT: 6 };
  const pinCount = counts[typeUpper] || 2;
  const comp = makeComponent('switch', pinCount, { Type: typeUpper, Position: position || 'A' });
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

function makeGround() {
  return makeComponent('ground', 1);
}

function makeVoltageSource(value) {
  return makeComponent('voltagesource', 2, { Vdc: String(value) });
}

function makeFunctionGenerator(props = {}) {
  return makeComponent('functiongenerator', 3, {
    Vpp: props.Vpp || '1',
    Freq: props.Freq || '1k',
    Offset: props.Offset || '0',
    Phase: props.Phase || '0',
    Wave: props.Wave || 'sine'
  });
}

function makeResistor(value) {
  return makeComponent('resistor', 2, { R: String(value) });
}

function makeCapacitor(value) {
  return makeComponent('capacitor', 2, { C: String(value) });
}

function makePotentiometer(total, turn = 50) {
  return makeComponent('potentiometer', 3, { R: String(total), Turn: String(turn) });
}

function makeLED(props = {}) {
  return makeComponent('led', 2, {
    Vf: props.Vf || '3.3',
    If: props.If || '10m',
    Color: props.Color || 'red'
  });
}

function makeOpAmp() {
  return makeComponent('lf412', 8, {});
}

function makeOscilloscope(props = {}) {
  return makeComponent('oscilloscope', 3, {
    TimeDiv: props.TimeDiv || '1m',
    VDiv1: props.VDiv1 || '1',
    VDiv2: props.VDiv2 || '1'
  });
}

function makeMosfet(type = 'NMOS', props = {}) {
  return makeComponent('mosfet', 4, {
    Type: type || 'NMOS',
    W: props.W || '1u',
    L: props.L || '1u',
    Kp: props.Kp || '140u',
    Vth: props.Vth || '0.7',
    Lambda: props.Lambda || '0.1',
    Gamma: props.Gamma || '0.45',
    Phi: props.Phi || '0.9'
  });
}

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

function resistorCurrent(resistor, voltage) {
  const R = parseUnit(resistor.props?.R || '1');
  if (R === 0) return 0;
  return (voltage(resistor, 0) - voltage(resistor, 1)) / R;
}

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
  FUNCGEN_SERIES_RES
};
