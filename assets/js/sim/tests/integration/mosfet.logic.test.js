// Exercises MOSFET switching/logic behaviours using measured voltages and
// currents; assertions rely on qualitative transistor behaviour (on/off,
// monotonic gain) rather than solver state.
import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeMosfet,
  runTransient,
  runDC,
  wire
} from '../testHarness';

describe('MOSFET switching', () => {
  it('drives an NMOS low-side switch', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vdd = makeVoltageSource(5);
    const gate = makeVoltageSource(0);
    const load = makeResistor(1e3);
    const nmos = makeMosfet('NMOS', { Kp: '200u', W: '2u', Lambda: '0' });
    circuit.add(gnd, vdd, gate, load, nmos);
    circuit.connect(vdd, 1, gnd, 0);
    circuit.connect(vdd, 0, load, 0);
    circuit.connect(load, 1, nmos, 1);
    circuit.connect(nmos, 2, gnd, 0);
    circuit.connect(nmos, 0, gate, 0);
    circuit.connect(gate, 1, gnd, 0);
    circuit.connect(nmos, 3, nmos, 2);

    const measure = (vin) => {
      gate.props.Vdc = String(vin);
      let vDrain = 0;
      runTransient(circuit, {
        duration: 2e-3,
        dt: 1e-5,
        sampleInterval: 2e-4,
        measure: ({ sim }) => { vDrain = sim.voltage(load, 1); }
      });
      const current = (5 - vDrain) / 1e3;
      return { vDrain, current };
    };

    const off = measure(0);
    const on = measure(5);
    expect(on.vDrain).toBeLessThan(off.vDrain - 0.5);
    expect(on.current).toBeGreaterThan(off.current * 5 + 1e-5);
  });

  it('drives a PMOS high-side switch', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vdd = makeVoltageSource(5);
    const gate = makeVoltageSource(5);
    const pmos = makeMosfet('PMOS', { Kp: '50u', W: '1u', Lambda: '0' });
    const load = makeResistor(10e3);
    circuit.add(gnd, vdd, gate, pmos, load);
    circuit.connect(vdd, 1, gnd, 0);
    circuit.connect(vdd, 0, pmos, 2);
    circuit.connect(pmos, 1, load, 0);
    circuit.connect(load, 1, gnd, 0);
    circuit.connect(pmos, 0, gate, 0);
    circuit.connect(gate, 1, gnd, 0);
    circuit.connect(pmos, 3, pmos, 2);

    const measure = (vin) => {
      gate.props.Vdc = String(vin);
      let vOut = 0;
      runTransient(circuit, {
        duration: 2e-3,
        dt: 1e-5,
        sampleInterval: 2e-4,
        measure: ({ sim }) => { vOut = sim.voltage(load, 0); }
      });
      return vOut;
    };

    const off = measure(5);
    const on = measure(0);
    expect(Number.isFinite(on)).toBe(true);
    expect(Number.isFinite(off)).toBe(true);
    expect(Math.abs(on - off)).toBeGreaterThan(0.1);
  });

  it('implements a CMOS inverter', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vdd = makeVoltageSource(5);
    const vin = makeVoltageSource(0);
    const pmos = makeMosfet('PMOS', { Kp: '50u', W: '1u' });
    const nmos = makeMosfet('NMOS', { Kp: '50u', W: '1u' });
    const load = makeResistor(500e3);
    circuit.add(gnd, vdd, vin, pmos, nmos, load);
    circuit.connect(vdd, 1, gnd, 0);
    circuit.connect(vdd, 0, pmos, 2);
    circuit.connect(pmos, 3, pmos, 2);
    circuit.connect(nmos, 3, nmos, 2);
    circuit.connect(nmos, 2, gnd, 0);
    circuit.connect(pmos, 1, nmos, 1);
    circuit.connect(load, 0, pmos, 1);
    circuit.connect(load, 1, gnd, 0);
    circuit.connect(vin, 1, gnd, 0);
    circuit.connect(vin, 0, pmos, 0);
    circuit.connect(vin, 0, nmos, 0);

    const measure = (vinLevel) => {
      vin.props.Vdc = String(vinLevel);
      let vOut = 0;
      runTransient(circuit, {
        duration: 2e-3,
        dt: 1e-5,
        sampleInterval: 2e-4,
        measure: ({ sim }) => { vOut = sim.voltage(pmos, 1); }
      });
      return vOut;
    };

    const lowIn = measure(0);
    const highIn = measure(5);
    expect(Number.isFinite(lowIn)).toBe(true);
    expect(Number.isFinite(highIn)).toBe(true);
    expect(lowIn).toBeGreaterThan(highIn);
  });

  it('creates a two-input NAND gate', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vdd = makeVoltageSource(5);
    const va = makeVoltageSource(0);
    const vb = makeVoltageSource(0);
    const p1 = makeMosfet('PMOS', { W: '1u', Kp: '50u' });
    const p2 = makeMosfet('PMOS', { W: '1u', Kp: '50u' });
    const n1 = makeMosfet('NMOS', { W: '1u', Kp: '50u' });
    const n2 = makeMosfet('NMOS', { W: '1u', Kp: '50u' });
    const load = makeResistor(1e6);
    circuit.add(gnd, vdd, va, vb, p1, p2, n1, n2, load);
    circuit.connect(vdd, 1, gnd, 0);
    circuit.connect(vdd, 0, p1, 2); circuit.connect(vdd, 0, p2, 2);
    circuit.connect(p1, 3, p1, 2); circuit.connect(p2, 3, p2, 2);
    circuit.connect(n1, 3, n1, 2); circuit.connect(n2, 3, n2, 2);
    circuit.connect(n2, 2, gnd, 0);
    circuit.connect(p1, 1, p2, 1);
    circuit.connect(p2, 1, n1, 1);
    circuit.connect(n1, 2, n2, 1);
    circuit.connect(load, 0, p1, 1);
    circuit.connect(load, 1, gnd, 0);
    circuit.connect(va, 1, gnd, 0); circuit.connect(vb, 1, gnd, 0);
    circuit.connect(va, 0, p1, 0); circuit.connect(va, 0, n1, 0);
    circuit.connect(vb, 0, p2, 0); circuit.connect(vb, 0, n2, 0);

    const evalNand = (a, b) => {
      va.props.Vdc = String(a);
      vb.props.Vdc = String(b);
      let vOut = 0;
      runTransient(circuit, {
        duration: 2e-3,
        dt: 1e-5,
        sampleInterval: 2e-4,
        measure: ({ sim }) => { vOut = sim.voltage(p1, 1); }
      });
      return vOut;
    };

    const outputs = [
      evalNand(0, 0),
      evalNand(0, 5),
      evalNand(5, 0),
      evalNand(5, 5)
    ];
    outputs.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    const unique = new Set(outputs.map((v) => Math.round(v * 1e3)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('behaves monotonically as a common-source amplifier', () => {
    const gnd = makeGround();
    const vdd = makeVoltageSource(5);
    const vin = makeVoltageSource(1);
    const nmos = makeMosfet('NMOS', { W: '12u', Kp: '3m', Lambda: '0.05' });
    const rd = makeResistor(5e3);
    const components = [gnd, vdd, vin, nmos, rd];
    const wires = [
      wire(vdd, 1, gnd, 0),
      wire(vdd, 0, rd, 0),
      wire(rd, 1, nmos, 1),
      wire(nmos, 2, gnd, 0),
      wire(nmos, 0, vin, 0),
      wire(vin, 1, gnd, 0),
      wire(nmos, 3, nmos, 2)
    ];

    const out1 = runDC({ components, wires }).voltage(nmos, 1);
    vin.props.Vdc = '2';
    const out2 = runDC({ components, wires }).voltage(nmos, 1);
    expect(out2).toBeLessThan(out1);
  });
});
