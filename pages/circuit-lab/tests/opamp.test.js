import { describe, it, expect } from 'vitest';
import {
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  makeOpAmp,
  makeFunctionGenerator,
  makeSwitch,
  wire,
  simulateCircuit
} from './helpers';

function connectDualRails(op, gnd, vPos, vNeg, components, wires) {
  const vccp = makeVoltageSource(vPos);
  const vccn = makeVoltageSource(vNeg);
  components.push(vccp, vccn);
  wires.push(wire(vccp, 0, op, 7), wire(vccp, 1, gnd, 0));
  wires.push(wire(vccn, 0, op, 3), wire(vccn, 1, gnd, 0));
}

describe('Op-amp linear configurations', () => {
  it('implements an inverting amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.5);
    const rin = makeResistor(1e3);
    const rf = makeResistor(10e3);

    const components = [gnd, op, vin, rin, rf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, rin, 0),
      wire(rin, 1, op, 1), // inverting input
      wire(op, 2, gnd, 0), // non-inverting to ground
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-5, 3);
  });

  it('implements a non-inverting amplifier', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(0.25);
    const rg = makeResistor(1e3);
    const rf = makeResistor(9e3);

    const components = [gnd, op, vin, rg, rf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, op, 2), // non-inverting input
      wire(op, 1, rg, 0),
      wire(rg, 1, gnd, 0),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(2.5, 3);
  });

  it('acts as an inverting summer', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const v1 = makeVoltageSource(0.2);
    const v2 = makeVoltageSource(0.1);
    const r1 = makeResistor(10e3);
    const r2 = makeResistor(10e3);
    const rf = makeResistor(10e3);

    const components = [gnd, op, v1, v2, r1, r2, rf];
    const wires = [
      wire(v1, 1, gnd, 0),
      wire(v2, 1, gnd, 0),
      wire(v1, 0, r1, 0),
      wire(v2, 0, r2, 0),
      wire(r1, 1, op, 1),
      wire(r2, 1, op, 1),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1),
      wire(op, 2, gnd, 0)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const { voltage } = simulateCircuit({ components, wires });
    expect(voltage(op, 0)).toBeCloseTo(-0.3, 3);
  });
});

describe('Op-amp nonlinear/temporal uses', () => {
  it('saturates as a comparator', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vpos = makeVoltageSource(5);
    const vinp = makeVoltageSource(3);
    const vinm = makeVoltageSource(2);
    const load = makeResistor(10e3);

    const components = [gnd, op, vpos, vinp, vinm, load];
    const wires = [
      wire(vpos, 0, op, 7), wire(vpos, 1, gnd, 0),
      wire(op, 3, gnd, 0),
      wire(vinp, 1, gnd, 0), wire(vinp, 0, op, 2),
      wire(vinm, 1, gnd, 0), wire(vinm, 0, op, 1),
      wire(op, 0, load, 0), wire(load, 1, gnd, 0)
    ];

    const high = simulateCircuit({ components, wires }).voltage(op, 0);
    expect(high).toBeCloseTo(4.9, 2);

    vinp.props.Vdc = '1';
    vinm.props.Vdc = '2.5';
    const low = simulateCircuit({ components, wires }).voltage(op, 0);
    expect(low).toBeCloseTo(0.1, 2);
  });

  it('integrates a constant input', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const vin = makeVoltageSource(1);
    const rin = makeResistor(1e3);
    const cf = makeCapacitor(1e-6);

    const components = [gnd, op, vin, rin, cf];
    const wires = [
      wire(vin, 1, gnd, 0),
      wire(vin, 0, rin, 0),
      wire(rin, 1, op, 1),
      wire(op, 2, gnd, 0),
      wire(op, 0, cf, 0),
      wire(cf, 1, op, 1)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const dt = 1e-5;
    let t = 0;
    const targetT = 0.0005;
    while (t <= targetT) {
      simulateCircuit({ components, wires, time: t, dt });
      t += dt;
    }
    const { voltage } = simulateCircuit({ components, wires, time: t, dt });
    expect(voltage(op, 0)).toBeCloseTo(-0.5, 1);
  });

  it('differentiates a sine input', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const fg = makeVoltageSource(0); // placeholder, sine injected via Function Generator analogue
    const cap = makeCapacitor(1e-6);
    const rf = makeResistor(1e3);

    // Use function generator values manually for expected derivatives
    const freq = 500;
    const Vpp = 1;

    const components = [gnd, op, fg, cap, rf];
    const wires = [
      wire(fg, 1, gnd, 0),
      wire(fg, 0, cap, 0),
      wire(cap, 1, op, 1),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1),
      wire(op, 2, gnd, 0)
    ];
    connectDualRails(op, gnd, 15, -15, components, wires);

    const dt = 1e-5;
    let t = 0;
    const samples = [];
    const omega = 2 * Math.PI * freq;

    // drive the placeholder source by updating its Vdc each step to emulate a sine
    while (t <= 0.006) {
      const vin = (Vpp / 2) * Math.sin(omega * t);
      fg.props.Vdc = String(vin);
      const { voltage } = simulateCircuit({ components, wires, time: t, dt });
      if (t >= 0.004) { // after a few cycles
        samples.push({ t, out: voltage(op, 0), vin });
      }
      t += dt;
    }

    // Compare amplitude to ideal differentiator gain: |Vout| = |Vin| * omega * R * C
    const gain = omega * 1e3 * 1e-6;
    const peakVin = Vpp / 2;
    const expectedPeak = peakVin * gain;
    const measuredPeak = Math.max(...samples.map((s) => Math.abs(s.out)));
    expect(measuredPeak).toBeCloseTo(expectedPeak, 1);
  });

  it('mixes multiple AC sources like the karaoke template', () => {
    const gnd = makeGround();
    const op = makeOpAmp();
    const railsPos = makeVoltageSource(15);
    const railsNeg = makeVoltageSource(-15);

    const freqs = [880, 110, 3520, 880];
    const gens = freqs.map((f) => makeFunctionGenerator({ Vpp: '0.25', Freq: String(f), Offset: '0', Phase: '0', Wave: 'sine' }));
    const resistors = gens.map(() => makeResistor(7.5e3));
    const rf = makeResistor(7.5e3);
    const load = makeResistor(10e3);

    const components = [gnd, op, railsPos, railsNeg, rf, load, ...gens, ...resistors];
    const wires = [
      wire(railsPos, 0, op, 7), wire(railsPos, 1, gnd, 0),
      wire(railsNeg, 0, op, 3), wire(railsNeg, 1, gnd, 0),
      wire(op, 2, gnd, 0),
      wire(op, 0, rf, 0),
      wire(rf, 1, op, 1),
      wire(op, 0, load, 0),
      wire(load, 1, gnd, 0)
    ];

    gens.forEach((fg, idx) => {
      const r = resistors[idx];
      wires.push(
        wire(fg, 1, gnd, 0), // COM to ground
        wire(fg, 0, r, 0),   // + to series resistor
        wire(r, 1, op, 1)    // resistor into inverting node
      );
    });

    const times = [0, 0.00025, 0.0005, 0.00075, 0.001];
    times.forEach((t) => {
      const { voltage } = simulateCircuit({ components, wires, time: t, dt: 1e-5 });
      const expected = -gens.reduce((acc, fg, i) => {
        const amp = 0.25 / 2;
        return acc + amp * Math.sin(2 * Math.PI * freqs[i] * t);
      }, 0);
      expect(voltage(op, 0)).toBeCloseTo(expected, 2);
    });
  });

  it('switches between summing and mixed-mode via SPDT', () => {
    const buildCircuit = (position) => {
      const gnd = makeGround();
      const op = makeOpAmp();
      const railsPos = makeVoltageSource(15);
      const railsNeg = makeVoltageSource(-15);
      const sw = makeSwitch('SPDT', position);

      const v1 = makeFunctionGenerator({ Vpp: '0', Offset: '0.5', Freq: '0' });
      const v2 = makeFunctionGenerator({ Vpp: '0', Offset: '0.25', Freq: '0' });
      const v3 = makeFunctionGenerator({ Vpp: '0', Offset: '1.0', Freq: '0' });

      const r1 = makeResistor(7.5e3);
      const r2 = makeResistor(7.5e3);
      const r3 = makeResistor(7.5e3);
      const rf = makeResistor(7.5e3);
      const rBias = makeResistor(7.5e3);
      const load = makeResistor(10e3);

      const components = [gnd, op, railsPos, railsNeg, sw, v1, v2, v3, r1, r2, r3, rf, rBias, load];
      const wires = [
        wire(railsPos, 0, op, 7), wire(railsPos, 1, gnd, 0),
        wire(railsNeg, 0, op, 3), wire(railsNeg, 1, gnd, 0),
        wire(op, 0, rf, 0), wire(rf, 1, op, 1),
        wire(op, 0, load, 0), wire(load, 1, gnd, 0),
        wire(v1, 1, gnd, 0), wire(v1, 0, r1, 0), wire(r1, 1, op, 1),
        wire(v2, 1, gnd, 0), wire(v2, 0, r2, 0), wire(r2, 1, op, 1),
        wire(v3, 1, gnd, 0), wire(v3, 0, r3, 0), wire(r3, 1, sw, 0),
        wire(sw, 1, op, 1), // position A path to inverting node
        wire(op, 2, rBias, 0), wire(rBias, 1, gnd, 0),
        wire(sw, 2, op, 2) // position B path to non-inverting node
      ];

      return { components, wires, op };
    };

    const evalCircuit = (position) => {
      const { components, wires, op } = buildCircuit(position);
      const { voltage } = simulateCircuit({ components, wires, time: 0, dt: 1e-6 });
      return voltage(op, 0);
    };

    const outA = evalCircuit('A'); // All three inputs into inverting summing node
    const outB = evalCircuit('B'); // Third input into non-inverting node via bias network

    const v1 = 0.5, v2 = 0.25, v3 = 1.0;
    const expectedA = -(v1 + v2 + v3); // -1.75 V
    const expectedB = 1.5 * v3 - v1 - v2; // 0.75 V

    expect(outA).toBeCloseTo(expectedA, 2);
    expect(outB).toBeCloseTo(expectedB, 2);
  });
});
