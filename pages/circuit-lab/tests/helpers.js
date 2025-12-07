import engine from '../../../assets/js/sim/engine.js';
const { runSimulation, parseUnit } = engine;

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

function makePotentiometer(total, turn) {
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

function makeOscilloscope() {
  return makeComponent('oscilloscope', 3, { TimeDiv: '1m', VDiv1: '1', VDiv2: '1' });
}

function wire(c1, p1, c2, p2) {
  return { from: { c: c1, p: p1 }, to: { c: c2, p: p2 } };
}

function simulateCircuit({ components, wires, time = 0, dt = 1e-7, updateState = true }) {
  const result = runSimulation({
    components,
    wires,
    time,
    dt,
    updateState,
    parseUnit
  });
  if (result.error) {
    throw new Error(result.error);
  }
  const voltage = (component, pinIdx) => {
    const n = result.getNodeIndex ? result.getNodeIndex(component, pinIdx) : -1;
    return n === -1 ? 0 : result.solution[n];
  };
  return { result, voltage };
}

export {
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
  wire,
  simulateCircuit,
  runSimulation,
  parseUnit
};
