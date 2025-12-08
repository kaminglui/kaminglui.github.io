import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeOpAmp,
  makeResistor,
  makeVoltageSource,
  runDC,
  runTransient,
  wire,
  importCircuit
} from '../testHarness';

const RAIL = 15;
const HEADROOM = 0.1; // matches engine op-amp headroom defaults

function powerOpAmp(op, gnd, components, wires, vPos = RAIL, vNeg = -RAIL) {
  const vccp = makeVoltageSource(vPos);
  const vccn = makeVoltageSource(vNeg);
  components.push(vccp, vccn);
  wires.push(wire(vccp, 0, op, 7), wire(vccp, 1, gnd, 0));
  wires.push(wire(vccn, 0, op, 3), wire(vccn, 1, gnd, 0));
}

function buildComparator({ invert = false } = {}) {
  const gnd = makeGround();
  const op = makeOpAmp();
  const vref = makeVoltageSource(2.5);
  const vin = makeVoltageSource(0);
  const load = makeResistor(10e3);
  const components = [gnd, op, vref, vin, load];
  const wires = [
    wire(vref, 1, gnd, 0),
    wire(vin, 1, gnd, 0),
    wire(op, 0, load, 0),
    wire(load, 1, gnd, 0)
  ];

  if (invert) {
    wires.push(wire(vin, 0, op, 1));
    wires.push(wire(vref, 0, op, 2));
  } else {
    wires.push(wire(vin, 0, op, 2));
    wires.push(wire(vref, 0, op, 1));
  }

  powerOpAmp(op, gnd, components, wires);
  return { components, wires, op, vin };
}

const COMPARATOR_TEMPLATE = {"components":[{"type":"led","x":100,"y":440,"rotation":2,"mirrorX":false,"props":{"Vf":"3.3","If":"10m","Color":"red"}},{"type":"led","x":100,"y":380,"rotation":2,"mirrorX":false,"props":{"Vf":"3.3","If":"10m","Color":"red"}},{"type":"led","x":100,"y":320,"rotation":2,"mirrorX":false,"props":{"Vf":"3.3","If":"10m","Color":"red"}},{"type":"led","x":100,"y":260,"rotation":2,"mirrorX":false,"props":{"Vf":"3.3","If":"10m","Color":"red"}},{"type":"resistor","x":820,"y":240,"rotation":1,"mirrorX":false,"props":{"R":"54k","Tolerance":"5"}},{"type":"resistor","x":820,"y":360,"rotation":1,"mirrorX":false,"props":{"R":"2k","Tolerance":"5"}},{"type":"resistor","x":820,"y":480,"rotation":1,"mirrorX":false,"props":{"R":"2k","Tolerance":"5"}},{"type":"resistor","x":820,"y":720,"rotation":1,"mirrorX":false,"props":{"R":"1k","Tolerance":"5"}},{"type":"resistor","x":820,"y":600,"rotation":1,"mirrorX":false,"props":{"R":"1k","Tolerance":"5"}},{"type":"voltageSource","x":480,"y":80,"rotation":0,"mirrorX":false,"props":{"Vdc":"15"}},{"type":"ground","x":820,"y":820,"rotation":0,"mirrorX":false,"props":{}},{"type":"lf412","x":560,"y":200,"rotation":0,"mirrorX":false,"props":{}},{"type":"lf412","x":560,"y":500,"rotation":0,"mirrorX":false,"props":{}},{"type":"voltageSource","x":640,"y":80,"rotation":2,"mirrorX":false,"props":{"Vdc":"15"}},{"type":"ground","x":640,"y":0,"rotation":2,"mirrorX":false,"props":{}},{"type":"junction","x":640,"y":160,"rotation":0,"mirrorX":false,"props":{}},{"type":"resistor","x":220,"y":260,"rotation":0,"mirrorX":false,"props":{"R":"1170","Tolerance":"5"}},{"type":"resistor","x":220,"y":320,"rotation":0,"mirrorX":false,"props":{"R":"1170","Tolerance":"5"}},{"type":"resistor","x":220,"y":380,"rotation":0,"mirrorX":false,"props":{"R":"1170","Tolerance":"5"}},{"type":"resistor","x":220,"y":440,"rotation":0,"mirrorX":false,"props":{"R":"1170","Tolerance":"5"}},{"type":"ground","x":0,"y":260,"rotation":1,"mirrorX":false,"props":{}},{"type":"ground","x":0,"y":320,"rotation":1,"mirrorX":false,"props":{}},{"type":"ground","x":0,"y":380,"rotation":1,"mirrorX":false,"props":{}},{"type":"ground","x":0,"y":440,"rotation":1,"mirrorX":false,"props":{}},{"type":"ground","x":480,"y":0,"rotation":2,"mirrorX":false,"props":{}},{"type":"junction","x":480,"y":240,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":820,"y":300,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":820,"y":420,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":820,"y":540,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":820,"y":660,"rotation":0,"mirrorX":false,"props":{}},{"type":"voltageSource","x":900,"y":180,"rotation":0,"mirrorX":false,"props":{"Vdc":"2"}},{"type":"ground","x":900,"y":260,"rotation":0,"mirrorX":false,"props":{}},{"type":"potentiometer","x":880,"y":80,"rotation":3,"mirrorX":false,"props":{"R":"100k","Turn":"21"}},{"type":"ground","x":900,"y":0,"rotation":2,"mirrorX":false,"props":{}},{"type":"junction","x":720,"y":440,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":720,"y":260,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":720,"y":240,"rotation":0,"mirrorX":false,"props":{}},{"type":"junction","x":900,"y":80,"rotation":0,"mirrorX":false,"props":{}}],"wires":[{"from":{"index":10,"pin":0},"to":{"index":7,"pin":1},"vertices":[]},{"from":{"index":14,"pin":0},"to":{"index":13,"pin":1},"vertices":[]},{"from":{"index":13,"pin":0},"to":{"index":15,"pin":0},"vertices":[]},{"from":{"index":15,"pin":0},"to":{"index":11,"pin":7},"vertices":[]},{"from":{"index":4,"pin":0},"to":{"index":15,"pin":0},"vertices":[{"x":830,"y":170}]},{"from":{"index":0,"pin":0},"to":{"index":19,"pin":0},"vertices":[]},{"from":{"index":1,"pin":0},"to":{"index":18,"pin":0},"vertices":[]},{"from":{"index":2,"pin":0},"to":{"index":17,"pin":0},"vertices":[]},{"from":{"index":3,"pin":0},"to":{"index":16,"pin":0},"vertices":[]},{"from":{"index":16,"pin":1},"to":{"index":11,"pin":0},"vertices":[{"x":370,"y":270},{"x":370,"y":170}]},{"from":{"index":18,"pin":1},"to":{"index":12,"pin":0},"vertices":[{"x":410,"y":390},{"x":410,"y":470}]},{"from":{"index":20,"pin":0},"to":{"index":3,"pin":1},"vertices":[]},{"from":{"index":21,"pin":0},"to":{"index":2,"pin":1},"vertices":[]},{"from":{"index":22,"pin":0},"to":{"index":1,"pin":1},"vertices":[]},{"from":{"index":23,"pin":0},"to":{"index":0,"pin":1},"vertices":[]},{"from":{"index":24,"pin":0},"to":{"index":9,"pin":0},"vertices":[]},{"from":{"index":9,"pin":1},"to":{"index":25,"pin":0},"vertices":[{"x":490,"y":150},{"x":490,"y":250}]},{"from":{"index":25,"pin":0},"to":{"index":11,"pin":3},"vertices":[{"x":550,"y":250}]},{"from":{"index":12,"pin":6},"to":{"index":19,"pin":1},"vertices":[{"x":690,"y":490},{"x":690,"y":590},{"x":370,"y":590},{"x":370,"y":450}]},{"from":{"index":4,"pin":1},"to":{"index":26,"pin":0},"vertices":[]},{"from":{"index":26,"pin":0},"to":{"index":5,"pin":0},"vertices":[]},{"from":{"index":11,"pin":1},"to":{"index":26,"pin":0},"vertices":[{"x":510,"y":190},{"x":510,"y":310}]},{"from":{"index":6,"pin":0},"to":{"index":27,"pin":0},"vertices":[]},{"from":{"index":27,"pin":0},"to":{"index":5,"pin":1},"vertices":[]},{"from":{"index":11,"pin":5},"to":{"index":27,"pin":0},"vertices":[{"x":630,"y":230},{"x":790,"y":230},{"x":790,"y":430}]},{"from":{"index":8,"pin":0},"to":{"index":28,"pin":0},"vertices":[]},{"from":{"index":28,"pin":0},"to":{"index":6,"pin":1},"vertices":[]},{"from":{"index":12,"pin":1},"to":{"index":28,"pin":0},"vertices":[{"x":510,"y":490},{"x":510,"y":610},{"x":790,"y":610},{"x":790,"y":550}]},{"from":{"index":12,"pin":3},"to":{"index":25,"pin":0},"vertices":[{"x":510,"y":550},{"x":490,"y":550}]},{"from":{"index":7,"pin":0},"to":{"index":29,"pin":0},"vertices":[]},{"from":{"index":29,"pin":0},"to":{"index":8,"pin":1},"vertices":[]},{"from":{"index":12,"pin":5},"to":{"index":29,"pin":0},"vertices":[{"x":650,"y":530},{"x":650,"y":670}]},{"from":{"index":31,"pin":0},"to":{"index":30,"pin":1},"vertices":[]},{"from":{"index":32,"pin":0},"to":{"index":30,"pin":0},"vertices":[]},{"from":{"index":33,"pin":0},"to":{"index":32,"pin":2},"vertices":[]},{"from":{"index":34,"pin":0},"to":{"index":12,"pin":4},"vertices":[{"x":730,"y":550}]},{"from":{"index":12,"pin":2},"to":{"index":34,"pin":0},"vertices":[{"x":470,"y":530},{"x":470,"y":450}]},{"from":{"index":35,"pin":0},"to":{"index":34,"pin":0},"vertices":[]},{"from":{"index":11,"pin":2},"to":{"index":35,"pin":0},"vertices":[{"x":510,"y":230},{"x":470,"y":230},{"x":470,"y":270}]},{"from":{"index":12,"pin":7},"to":{"index":15,"pin":0},"vertices":[{"x":630,"y":470},{"x":650,"y":470}]},{"from":{"index":36,"pin":0},"to":{"index":35,"pin":0},"vertices":[]},{"from":{"index":11,"pin":4},"to":{"index":36,"pin":0},"vertices":[]},{"from":{"index":17,"pin":1},"to":{"index":11,"pin":6},"vertices":[{"x":290,"y":330},{"x":690,"y":330},{"x":690,"y":190}]},{"from":{"index":32,"pin":1},"to":{"index":37,"pin":0},"vertices":[{"x":930,"y":90}]},{"from":{"index":37,"pin":0},"to":{"index":36,"pin":0},"vertices":[{"x":730,"y":90}]},{"from":{"index":32,"pin":1},"to":{"index":37,"pin":0},"vertices":[]}]};
describe('op-amp comparator mode', () => {
  it('saturates toward the positive rail when V+ exceeds V−', () => {
    const circuit = buildComparator();
    circuit.vin.props.Vdc = 5;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeGreaterThan(RAIL - HEADROOM - 0.5);
  });

  it('saturates toward the negative rail when V+ is below V−', () => {
    const circuit = buildComparator();
    circuit.vin.props.Vdc = 0;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeLessThan(-RAIL + HEADROOM + 0.5);
  });

  it('avoids chatter on a slow threshold crossing', () => {
    const circuit = buildComparator();
    const duration = 0.005;
    const sweep = (t) => 5 * (t / duration);

    const { samples } = runTransient(circuit, {
      duration,
      dt: 1e-4,
      onStep: ({ t }) => { circuit.vin.props.Vdc = sweep(t); },
      measure: ({ sim }) => ({ vout: sim.voltage(circuit.op, 0) })
    });

    const outputs = samples.map((s) => s.vout);
    const transitions = outputs.reduce((count, v, idx, arr) => {
      if (idx === 0) return 0;
      const prev = arr[idx - 1];
      return (Math.sign(prev) !== Math.sign(v)) ? count + 1 : count;
    }, 0);

    expect(outputs[0]).toBeLessThan(-RAIL + 1);
    expect(outputs[outputs.length - 1]).toBeGreaterThan(RAIL - 1);
    expect(transitions).toBeLessThanOrEqual(1);
  });

  it('holds its state when inputs sit exactly at the threshold', () => {
    const circuit = buildComparator();
    circuit.vin.props.Vdc = 3; // drive high first
    runTransient(circuit, { duration: 0.001, dt: 1e-4 });

    circuit.vin.props.Vdc = 2.5; // equal to Vref
    const { samples } = runTransient(circuit, {
      duration: 0.002,
      dt: 1e-4,
      measure: ({ sim }) => sim.voltage(circuit.op, 0)
    });

    const swings = Math.max(...samples) - Math.min(...samples);
    const transitions = samples.reduce((count, v, idx, arr) => {
      if (idx === 0) return 0;
      const prev = arr[idx - 1];
      return (Math.sign(prev) !== Math.sign(v)) ? count + 1 : count;
    }, 0);

    expect(transitions).toBeLessThanOrEqual(1);
    expect(swings).toBeLessThan(RAIL * 0.25);
  });

  it('switches cleanly for a slow sine input around the threshold', () => {
    const circuit = buildComparator();
    const freq = 200;
    const duration = 0.01;
    const amplitude = 0.6;
    const offset = 2.5;

    const { samples } = runTransient(circuit, {
      duration,
      dt: 1e-4,
      onStep: ({ t }) => {
        circuit.vin.props.Vdc = offset + amplitude * Math.sin(2 * Math.PI * freq * t);
      },
      measure: ({ sim }) => sim.voltage(circuit.op, 0)
    });

    const transitions = samples.reduce((count, v, idx, arr) => {
      if (idx === 0) return 0;
      const prev = arr[idx - 1];
      return (Math.sign(prev) !== Math.sign(v)) ? count + 1 : count;
    }, 0);

    // Two transitions per cycle (one rising, one falling) with a little tolerance.
    const expectedTransitions = Math.round(duration * freq * 2);
    expect(transitions).toBeLessThanOrEqual(expectedTransitions + 1);
    expect(transitions).toBeGreaterThanOrEqual(expectedTransitions - 1);
  });

  it('flips polarity when wired as an inverting comparator', () => {
    const circuit = buildComparator({ invert: true });
    circuit.vin.props.Vdc = 5;
    const { voltage } = runDC(circuit);
    expect(voltage(circuit.op, 0)).toBeLessThan(-RAIL + HEADROOM + 0.5);
  });

  it('simulates the provided comparator template and keeps op-amp outputs within rails', () => {
    const { components, wires } = importCircuit(COMPARATOR_TEMPLATE, { resetIds: true });
    const helperGround = makeGround();
    components.push(helperGround);
    // Ensure every supply source has a defined reference
    components
      .filter((c) => c.kind === 'voltagesource')
      .forEach((src) => wires.push(wire(helperGround, 0, src, 1)));

    const result = runDC({ components, wires });
    expect(result.error).toBeNull();

    const voltage = result.voltage;
    const opAmps = components.filter((c) => c.kind === 'lf412');
    expect(opAmps.length).toBeGreaterThan(0);
    opAmps.forEach((op) => {
      [0, 6].forEach((pin) => {
        const v = voltage(op, pin);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeLessThanOrEqual(RAIL + 0.5);
        expect(v).toBeGreaterThanOrEqual(-RAIL - 0.5);
      });
    });
  });
});
