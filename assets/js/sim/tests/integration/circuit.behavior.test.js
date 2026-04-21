// End-to-end "does it actually compute the right answer" tests. Each circuit is
// compared to a textbook closed-form expression so a regression in the solver
// shows up here before anyone notices in the UI.
import { describe, it, expect } from 'vitest';
import {
  buildCircuit,
  makeGround,
  makeVoltageSource,
  makeResistor,
  makeCapacitor,
  makeInductor,
  makeBjt,
  makeDiode,
  makeCurrentSource,
  makeLED,
  makeMosfet,
  makeOpAmp,
  makeFunctionGenerator,
  runDC,
  runTransient,
  simulateCircuit,
  resistorCurrent,
  parseUnit,
  sineAt
} from '../testHarness';

describe('Voltage divider', () => {
  it('matches Ohm\'s law ratio at the midpoint', () => {
    // 9 V across 10 k + 20 k: midpoint should be 9 * 20/30 = 6 V.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(9);
    const r1 = makeResistor(10e3);
    const r2 = makeResistor(20e3);
    circuit.add(gnd, src, r1, r2);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r1, 0);
    circuit.connect(r1, 1, r2, 0);
    circuit.connect(r2, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const vMid = voltage(r1, 1);
    expect(vMid).toBeCloseTo(6.0, 2);
    // Same current through both legs.
    expect(resistorCurrent(r1, voltage)).toBeCloseTo(3e-4, 6);
    expect(resistorCurrent(r2, voltage)).toBeCloseTo(3e-4, 6);
  });
});

describe('RC low-pass step response', () => {
  it('charges toward Vs with time constant tau = RC', () => {
    const R = 10e3;
    const C = 100e-9; // 1 ms time constant
    const Vs = 5;
    const tau = R * C;

    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(Vs);
    const r = makeResistor(R);
    const c = makeCapacitor(C);
    circuit.add(gnd, src, r, c);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, c, 0);
    circuit.connect(c, 1, gnd, 0);

    // Sample at t = tau (63.2%) and t = 3 tau (95.0%).
    const samplePoints = [tau, 3 * tau];
    const { samples } = runTransient(circuit, {
      duration: 3 * tau,
      dt: tau / 200,
      samplePoints,
      measure: ({ t, sim }) => ({ t, vc: sim.voltage(c, 0) - sim.voltage(c, 1) })
    });

    const atTau = samples.find((s) => Math.abs(s.t - tau) < 1e-9);
    const at3Tau = samples.find((s) => Math.abs(s.t - 3 * tau) < 1e-9);
    expect(atTau.vc / Vs).toBeCloseTo(1 - Math.exp(-1), 2);
    expect(at3Tau.vc / Vs).toBeCloseTo(1 - Math.exp(-3), 2);
  });
});

describe('Current-limited LED', () => {
  it('settles forward current close to (Vs - Vf) / R', () => {
    // 5 V through 330 Ω into a 2 V LED → expected ~9.1 mA
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(330);
    const led = makeLED({ Vf: '2', If: '15m' });
    circuit.add(gnd, src, r, led);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, led, 0);
    circuit.connect(led, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const iR = resistorCurrent(r, voltage);
    const expectedLow = (5 - 2) / 330 * 0.75; // some drop tolerance
    const expectedHigh = (5 - 2) / 330 * 1.25;
    expect(iR).toBeGreaterThan(expectedLow);
    expect(iR).toBeLessThan(expectedHigh);
  });
});

describe('Function generator waveforms', () => {
  // Loading: funcGen drives R to ground. Measure vPlus (= funcGen + pin) directly.
  function scaffoldFuncGen(waveProps) {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const fg = makeFunctionGenerator({ Vpp: '10', Freq: '1k', ...waveProps });
    const r = makeResistor(1e6); // high-impedance load so FG's series R barely affects amplitude
    circuit.add(gnd, fg, r);
    circuit.connect(fg, 1, gnd, 0); // COM -> ground
    circuit.connect(fg, 0, r, 0);
    circuit.connect(r, 1, gnd, 0);
    return { circuit, fg, r, gnd };
  }

  it('produces a square wave that sits at +Vpp/2 for the first half cycle', () => {
    const { circuit, fg } = scaffoldFuncGen({ Wave: 'square' });
    // Freq = 1 kHz, period = 1 ms. Sample at t = 0.25 ms (positive phase) and 0.75 ms (negative).
    const dt = 1e-6;
    const { samples } = runTransient(circuit, {
      duration: 1e-3,
      dt,
      samplePoints: [0.25e-3, 0.75e-3],
      measure: ({ t, sim }) => ({ t, v: sim.voltage(fg, 0) })
    });
    const high = samples.find((s) => Math.abs(s.t - 0.25e-3) < 1e-9);
    const low = samples.find((s) => Math.abs(s.t - 0.75e-3) < 1e-9);
    expect(high.v).toBeCloseTo(5, 0);
    expect(low.v).toBeCloseTo(-5, 0);
  });

  it('produces a triangle wave that starts at the trough and peaks mid-cycle', () => {
    // This is the engine's convention: triangle sits at -amp at t=0, linearly ramps
    // to +amp at t=T/2, back to -amp at t=T. Same formula as the testHarness's
    // triangleAt helper so UI and sim agree on the wave shape.
    const { circuit, fg } = scaffoldFuncGen({ Wave: 'triangle' });
    const dt = 1e-6;
    const { samples } = runTransient(circuit, {
      duration: 1e-3,
      dt,
      samplePoints: [0.5e-3, 1.0e-3 - dt],
      measure: ({ t, sim }) => ({ t, v: sim.voltage(fg, 0) })
    });
    const peak = samples.find((s) => Math.abs(s.t - 0.5e-3) < 1e-9);
    const nearEnd = samples[samples.length - 1];
    expect(peak.v).toBeCloseTo(5, 0);
    // Just before the period rolls over: close to -5 V.
    expect(nearEnd.v).toBeLessThan(-4);
  });
});

describe('Op-amp non-inverting amplifier', () => {
  it('amplifies a small DC input by 1 + Rf/Rg', () => {
    // Gain = 1 + 10k/10k = 2.
    // Half of the LF412 uses pins: 1OUT=0, 1IN-=1, 1IN+=2, VCC-=3, VCC+=7.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vRail = makeVoltageSource(12);
    const vInSrc = makeVoltageSource(0.5);
    const op = makeOpAmp();
    const rf = makeResistor(10e3);
    const rg = makeResistor(10e3);
    circuit.add(gnd, vRail, vInSrc, op, rf, rg);
    circuit.connect(vRail, 1, gnd, 0);
    // Bipolar rails: +12 / -12 would need a second source; for simplicity use 12 V rails and 0 V negative.
    // LF412 negative rail sees ground and positive rail sees +12.
    circuit.connect(vRail, 0, op, 7); // VCC+
    circuit.connect(op, 3, gnd, 0);   // VCC- = 0
    // Input
    circuit.connect(vInSrc, 1, gnd, 0);
    circuit.connect(vInSrc, 0, op, 2); // IN+
    // Feedback: output -> Rf -> IN-, IN- -> Rg -> ground.
    circuit.connect(op, 0, rf, 0);     // OUT to Rf
    circuit.connect(rf, 1, op, 1);     // Rf to IN-
    circuit.connect(op, 1, rg, 0);     // IN- to Rg
    circuit.connect(rg, 1, gnd, 0);

    const { voltage } = runDC(circuit);
    const vOut = voltage(op, 0);
    expect(vOut).toBeCloseTo(1.0, 1);
  });
});

describe('Op-amp slew-rate limiting', () => {
  it('takes finite time to swing the output after a large input step', () => {
    // Buffer (voltage follower): output tracks the non-inverting input, but can't
    // swing faster than the LF412's ~3 V/µs default slew rate.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vrail = makeVoltageSource(12);
    const vin = makeVoltageSource(0);
    const op = makeOpAmp();
    const load = makeResistor(10e3);
    circuit.add(gnd, vrail, vin, op, load);
    circuit.connect(vrail, 1, gnd, 0);
    circuit.connect(vrail, 0, op, 7);
    circuit.connect(op, 3, gnd, 0);
    circuit.connect(vin, 1, gnd, 0);
    circuit.connect(vin, 0, op, 2); // +in
    circuit.connect(op, 0, op, 1);  // unity-gain feedback
    circuit.connect(op, 0, load, 0);
    circuit.connect(load, 1, gnd, 0);

    // Warm up at 0 V for a few steps.
    for (let i = 0; i < 5; i++) simulateCircuit({ components: circuit.components, wires: circuit.wires, dt: 1e-6 });

    // Step input to 10 V, sample output after 1 µs (should be slew-limited to ~3 V).
    vin.props.Vdc = '10';
    const dt = 1e-7; // 0.1 µs per step
    const steps = 10; // 1 µs total
    let vOut = 0;
    for (let i = 0; i < steps; i++) {
      vOut = simulateCircuit({ components: circuit.components, wires: circuit.wires, dt }).voltage(op, 0);
    }
    // At 3 V/µs after 1 µs, output should be in the 2-4 V range (well below the 10 V target).
    expect(vOut).toBeGreaterThan(1.5);
    expect(vOut).toBeLessThan(5);
  });
});

describe('Capacitor leak', () => {
  function rcScaffold({ Rleak, R = 1e6 }) {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(R);
    const cap = makeCapacitor(1e-6);
    if (Rleak != null) cap.props.Rleak = Rleak;
    circuit.add(gnd, src, r, cap);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, cap, 0);
    circuit.connect(cap, 1, gnd, 0);
    return { circuit, cap };
  }

  it('leaks: a leaky cap settles below the source voltage via the R/Rleak divider', () => {
    // Source=5V, R=1MΩ, Rleak=10MΩ -> DC steady state ≈ 5·Rleak/(R+Rleak) ≈ 4.545V.
    const { circuit, cap } = rcScaffold({ Rleak: '10M', R: 1e6 });
    let vFinal = 0;
    runTransient(circuit, {
      duration: 30, // plenty of settling time (tau = (1M || 10M)·1uF ≈ 0.9 s)
      dt: 0.01,
      sampleInterval: 1,
      measure: ({ sim }) => { vFinal = sim.voltage(cap, 0) - sim.voltage(cap, 1); }
    });
    expect(vFinal).toBeGreaterThan(4.3);
    expect(vFinal).toBeLessThan(4.8);
  });

  it('holds: an ideal cap (no Rleak) settles to the full source voltage', () => {
    const { circuit, cap } = rcScaffold({ Rleak: null, R: 1e6 });
    let vFinal = 0;
    runTransient(circuit, {
      duration: 10,
      dt: 0.005,
      sampleInterval: 1,
      measure: ({ sim }) => { vFinal = sim.voltage(cap, 0) - sim.voltage(cap, 1); }
    });
    expect(vFinal).toBeGreaterThan(4.95);
    expect(vFinal).toBeLessThan(5.01);
  });
});

describe('Op-amp input offset', () => {
  it('adds ~(1 + Rf/Rg) · Vos of output bias when inputOffset is set', () => {
    // Symmetric rails ±12 V so the output isn't squashed by the ground-rail saturation
    // window, and a 3 mV offset produces a clean ~6 mV output (closed-loop gain 2).
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vpos = makeVoltageSource(12);
    const vneg = makeVoltageSource(12); // wired backwards below to give −12 V
    const op = makeOpAmp();
    const rf = makeResistor(10e3);
    const rg = makeResistor(10e3);
    circuit.add(gnd, vpos, vneg, op, rf, rg);
    circuit.connect(vpos, 1, gnd, 0);
    circuit.connect(vpos, 0, op, 7); // VCC+ = +12
    circuit.connect(vneg, 0, gnd, 0);
    circuit.connect(vneg, 1, op, 3); // VCC− = −12
    circuit.connect(op, 2, gnd, 0);  // IN+ grounded
    circuit.connect(op, 0, rf, 0);   // OUT → Rf
    circuit.connect(rf, 1, op, 1);   // Rf → IN−
    circuit.connect(op, 1, rg, 0);   // IN− → Rg
    circuit.connect(rg, 1, gnd, 0);

    const settle = () => {
      let v = 0;
      for (let i = 0; i < 40; i += 1) {
        v = simulateCircuit({
          components: circuit.components,
          wires: circuit.wires,
          dt: 1e-5,
          opAmpInputOffset: 3e-3
        }).voltage(op, 0);
      }
      return v;
    };
    const vOut = settle();
    // Expect ~6 mV; accept [2, 20] mV to absorb the small inputLeak / outputLeak terms.
    expect(Math.abs(vOut)).toBeGreaterThan(2e-3);
    expect(Math.abs(vOut)).toBeLessThan(0.02);
  });
});

describe('Inductor transient', () => {
  it('resists sudden current change: an RL step ramps toward Vs/R with tau = L/R', () => {
    // 5 V through 100 Ω in series with a 10 mH inductor. tau = L/R = 100 µs.
    // After 5·tau the current should be within a few percent of 50 mA.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(100);
    const ind = makeInductor(10e-3);
    circuit.add(gnd, src, r, ind);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, ind, 0);
    circuit.connect(ind, 1, gnd, 0);

    let iFinal = 0;
    runTransient(circuit, {
      duration: 1e-3, // 10·tau
      dt: 5e-7,
      sampleInterval: 1e-4,
      measure: ({ sim }) => { iFinal = resistorCurrent(r, sim.voltage); }
    });
    expect(iFinal).toBeGreaterThan(0.045); // within 10% of 50 mA steady state
    expect(iFinal).toBeLessThan(0.055);
  });
});

describe('BJT (NPN) common-emitter amplifier', () => {
  it('puts the transistor into the active region and mirrors Ic ≈ β·Ib', () => {
    // Base drive via a resistor sets Ib; collector load drops Ic·Rc. For a
    // base voltage of 1.2 V, Vbe_on = 0.7, Rbe = 1k → Ib = 0.5 mA and
    // Ic = 100·0.5 mA = 50 mA ideally. With Rc = 100 Ω and Vcc = 5 V, Ic is
    // collector-load limited to ~50 mA → Vce ≈ 0.2 V (saturation edge).
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vcc = makeVoltageSource(5);
    const vbb = makeVoltageSource(1.2);
    const rc = makeResistor(100);
    const q = makeBjt('NPN', { Beta: '100', VbeOn: '0.7', VceSat: '0.2', Rbe: '1k' });
    circuit.add(gnd, vcc, vbb, rc, q);
    circuit.connect(vcc, 1, gnd, 0);
    circuit.connect(vbb, 1, gnd, 0);
    circuit.connect(vbb, 0, q, 0);     // base
    circuit.connect(vcc, 0, rc, 0);
    circuit.connect(rc, 1, q, 1);      // collector via Rc
    circuit.connect(q, 2, gnd, 0);     // emitter

    let iC = 0;
    let vCE = 0;
    runTransient(circuit, {
      duration: 1e-3,
      dt: 1e-5,
      sampleInterval: 1e-4,
      measure: ({ sim }) => {
        iC = resistorCurrent(rc, sim.voltage);
        vCE = sim.voltage(q, 1) - sim.voltage(q, 2);
      }
    });
    // Significant collector current (well above leakage) and Vce down near saturation.
    expect(iC).toBeGreaterThan(5e-3);
    expect(vCE).toBeLessThan(4); // some drop; active region or near saturation
  });
});

describe('Diode', () => {
  it('clamps forward voltage near Vf under heavy bias', () => {
    // 5 V source through 100 Ω then diode to ground. Expect Vdiode ≈ 0.7 V
    // and I ≈ (5 - 0.7) / 100 = 43 mA.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(100);
    const d = makeDiode({ Vf: '0.7', If: '10m' });
    circuit.add(gnd, src, r, d);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, d, 0); // anode
    circuit.connect(d, 1, gnd, 0); // cathode

    let vD = 0;
    let iR = 0;
    runTransient(circuit, {
      duration: 1e-4,
      dt: 1e-6,
      measure: ({ sim }) => {
        vD = sim.voltage(d, 0) - sim.voltage(d, 1);
        iR = resistorCurrent(r, sim.voltage);
      }
    });
    expect(vD).toBeGreaterThan(0.65);
    expect(vD).toBeLessThan(0.85);
    expect(iR).toBeGreaterThan(30e-3);
    expect(iR).toBeLessThan(55e-3);
  });

  it('blocks reverse current', () => {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const src = makeVoltageSource(5);
    const r = makeResistor(1e3);
    const d = makeDiode({ Vf: '0.7' });
    circuit.add(gnd, src, r, d);
    circuit.connect(src, 1, gnd, 0);
    circuit.connect(src, 0, r, 0);
    circuit.connect(r, 1, d, 1); // cathode — reverse-biased
    circuit.connect(d, 0, gnd, 0); // anode to ground

    const { voltage } = simulateCircuit({
      components: circuit.components,
      wires: circuit.wires
    });
    const iR = resistorCurrent(r, voltage);
    expect(Math.abs(iR)).toBeLessThan(1e-6);
  });
});

describe('Ideal current source', () => {
  it('forces Idc through a load resistor regardless of R', () => {
    // 1 mA into a 1 kΩ resistor → 1 V across it.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const isrc = makeCurrentSource('1m');
    const r = makeResistor(1e3);
    circuit.add(gnd, isrc, r);
    circuit.connect(isrc, 1, gnd, 0); // tail to ground
    circuit.connect(isrc, 0, r, 0);   // head drives R
    circuit.connect(r, 1, gnd, 0);

    const { voltage } = simulateCircuit({
      components: circuit.components,
      wires: circuit.wires
    });
    const vR = voltage(r, 0) - voltage(r, 1);
    expect(vR).toBeCloseTo(1.0, 2);
  });
});

describe('Bar-graph voltage indicator', () => {
  // Replicates the voltage-led-display template: four LF412 comparators
  // driven by a 54 : 2 : 2 : 1 : 1 divider on the 15 V rail, producing
  // thresholds at 1.5 / 1.0 / 0.5 / 0.25 V. The circuit is a bar graph —
  // as the input voltage rises through each threshold one more LED lights.
  // We measure the actual LED current through its 1170 Ω series resistor;
  // the engine's pinned-output re-solve keeps downstream nodes consistent
  // with the clamped op-amp output so the current reads cleanly at ~10 mA
  // when lit and near zero when off.
  function buildBarGraph(inputV) {
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vPos = makeVoltageSource(15);
    const vNeg = makeVoltageSource(15);
    const vin = makeVoltageSource(inputV);

    const r19 = makeResistor(54e3);
    const r20 = makeResistor(2e3);
    const r21 = makeResistor(2e3);
    const r22 = makeResistor(1e3);
    const r23 = makeResistor(1e3);

    // Each LF412 has two op-amp halves, so two chips cover the four comparators.
    const u2 = makeOpAmp();
    const u3 = makeOpAmp();

    const r14 = makeResistor(1170);
    const r15 = makeResistor(1170);
    const r16 = makeResistor(1170);
    const r17 = makeResistor(1170);
    const led1 = makeLED({ Vf: '3.3', If: '10m' });
    const led2 = makeLED({ Vf: '3.3', If: '10m' });
    const led3 = makeLED({ Vf: '3.3', If: '10m' });
    const led4 = makeLED({ Vf: '3.3', If: '10m' });

    circuit.add(
      gnd, vPos, vNeg, vin,
      r19, r20, r21, r22, r23,
      u2, u3,
      r14, r15, r16, r17,
      led1, led2, led3, led4
    );

    // Power rails — vPos pin 0 = +15 V, vNeg pin 1 = -15 V (pin 0 is grounded).
    circuit.connect(vPos, 1, gnd, 0);
    circuit.connect(vNeg, 0, gnd, 0);
    circuit.connect(vPos, 0, r19, 0);
    circuit.connect(vPos, 0, u2, 7);
    circuit.connect(vPos, 0, u3, 7);
    circuit.connect(vNeg, 1, u2, 3);
    circuit.connect(vNeg, 1, u3, 3);

    // Divider chain.
    circuit.connect(r19, 1, r20, 0);
    circuit.connect(r20, 1, r21, 0);
    circuit.connect(r21, 1, r22, 0);
    circuit.connect(r22, 1, r23, 0);
    circuit.connect(r23, 1, gnd, 0);

    // Tap voltages feed each comparator's inverting input.
    circuit.connect(r19, 1, u2, 1); // 1.5 V → U2 1IN-
    circuit.connect(r20, 1, u2, 5); // 1.0 V → U2 2IN-
    circuit.connect(r21, 1, u3, 1); // 0.5 V → U3 1IN-
    circuit.connect(r22, 1, u3, 5); // 0.25 V → U3 2IN-

    // Input signal goes to every non-inverting input.
    circuit.connect(vin, 1, gnd, 0);
    circuit.connect(vin, 0, u2, 2);
    circuit.connect(vin, 0, u2, 4);
    circuit.connect(vin, 0, u3, 2);
    circuit.connect(vin, 0, u3, 4);

    // Output drivers: op-amp OUT → R → LED → GND.
    circuit.connect(u2, 0, r14, 0);
    circuit.connect(r14, 1, led1, 0);
    circuit.connect(led1, 1, gnd, 0);

    circuit.connect(u2, 6, r15, 0);
    circuit.connect(r15, 1, led2, 0);
    circuit.connect(led2, 1, gnd, 0);

    circuit.connect(u3, 0, r16, 0);
    circuit.connect(r16, 1, led3, 0);
    circuit.connect(led3, 1, gnd, 0);

    circuit.connect(u3, 6, r17, 0);
    circuit.connect(r17, 1, led4, 0);
    circuit.connect(led4, 1, gnd, 0);

    return { circuit, r14, r15, r16, r17 };
  }

  // A lit LED conducts ~(15 - 3.3)/1170 ≈ 10 mA. Off LEDs are reverse-biased
  // by the rail-low output so the series resistor only carries leakage.
  function readLeds(inputV) {
    const { circuit, r14, r15, r16, r17 } = buildBarGraph(inputV);
    const { samples } = runTransient(circuit, {
      duration: 500e-6,
      dt: 1e-6,
      samplePoints: [499e-6],
      measure: ({ sim }) => ({
        i1: resistorCurrent(r14, sim.voltage),
        i2: resistorCurrent(r15, sim.voltage),
        i3: resistorCurrent(r16, sim.voltage),
        i4: resistorCurrent(r17, sim.voltage)
      })
    });
    const last = samples[samples.length - 1];
    const lit = (i) => i > 5e-3;
    return {
      led1: lit(last.i1),
      led2: lit(last.i2),
      led3: lit(last.i3),
      led4: lit(last.i4)
    };
  }

  it('lights no LEDs when the input sits below the lowest threshold', () => {
    expect(readLeds(0.1)).toEqual({ led1: false, led2: false, led3: false, led4: false });
  });

  it('lights only LED4 between 0.25 V and 0.5 V', () => {
    expect(readLeds(0.35)).toEqual({ led1: false, led2: false, led3: false, led4: true });
  });

  it('lights LED3 and LED4 between 0.5 V and 1.0 V', () => {
    expect(readLeds(0.75)).toEqual({ led1: false, led2: false, led3: true, led4: true });
  });

  it('lights LED2, LED3, LED4 between 1.0 V and 1.5 V', () => {
    expect(readLeds(1.2)).toEqual({ led1: false, led2: true, led3: true, led4: true });
  });

  it('lights all four LEDs when the input exceeds the highest threshold', () => {
    expect(readLeds(2.0)).toEqual({ led1: true, led2: true, led3: true, led4: true });
  });
});

describe('MOSFET subthreshold leakage', () => {
  it('leaks far more than a fully-off transistor but far less than when biased above Vth', () => {
    // Vgs = 0.4 V (below Vth = 0.7 V). Expect current << saturation but >> off.
    // With our model, subthreshold at Vgs = 0.4, Vth = 0.7, n Vt = 33.6 mV:
    //   I_sub ~= 0.5 * k * 0.01 * exp(-0.3 / 0.0336) ~= a few pA to tens of nA.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vgs = makeVoltageSource(0.4);
    const vds = makeVoltageSource(5);
    const nmos = makeMosfet('NMOS', { W: '1u', L: '1u', Kp: '140u', Vth: '0.7', Lambda: '0', Gamma: '0' });
    const rLoad = makeResistor(10e3);
    circuit.add(gnd, vgs, vds, nmos, rLoad);
    circuit.connect(nmos, 2, gnd, 0);
    circuit.connect(nmos, 3, gnd, 0);
    circuit.connect(vgs, 1, gnd, 0);
    circuit.connect(vgs, 0, nmos, 0);
    circuit.connect(vds, 1, gnd, 0);
    circuit.connect(vds, 0, rLoad, 0);
    circuit.connect(rLoad, 1, nmos, 1);

    let iSub = 0;
    runTransient(circuit, {
      duration: 2e-4,
      dt: 1e-5,
      sampleInterval: 5e-5,
      measure: ({ sim }) => { iSub = Math.abs(resistorCurrent(rLoad, sim.voltage)); }
    });
    // Should be much greater than the pure-cutoff gLeak (1e-9 A) but much less than
    // saturation Ids at Vgs = 2 (118 µA).
    expect(iSub).toBeGreaterThan(1e-10);
    expect(iSub).toBeLessThan(1e-5);
  });
});

describe('MOSFET saturation current', () => {
  it('matches the square-law Ids for an NMOS biased in saturation', () => {
    // MOSFET operating point is caught up across time steps (no internal Newton
    // iteration in DC), so we run a brief transient to let Vds and Ids settle.
    // With W/L=1, Kp=140 µA/V^2, Vth=0.7: at Vgs=2 V, Vov=1.3 V and
    // Ids_ideal = 0.5·140u·1.69 ≈ 118 µA, attenuated by the R_load drop.
    const circuit = buildCircuit();
    const gnd = makeGround();
    const vgs = makeVoltageSource(2);
    const vds = makeVoltageSource(5);
    const nmos = makeMosfet('NMOS', {
      W: '1u', L: '1u', Kp: '140u', Vth: '0.7', Lambda: '0', Gamma: '0'
    });
    const rLoad = makeResistor(1000);
    circuit.add(gnd, vgs, vds, nmos, rLoad);
    circuit.connect(nmos, 2, gnd, 0);
    circuit.connect(nmos, 3, gnd, 0);
    circuit.connect(vgs, 1, gnd, 0);
    circuit.connect(vgs, 0, nmos, 0);
    circuit.connect(vds, 1, gnd, 0);
    circuit.connect(vds, 0, rLoad, 0);
    circuit.connect(rLoad, 1, nmos, 1);

    let iD = 0;
    runTransient(circuit, {
      duration: 5e-4,
      dt: 1e-5,
      sampleInterval: 5e-5,
      measure: ({ sim }) => { iD = resistorCurrent(rLoad, sim.voltage); }
    });
    // Accept a generous band around the closed-form 118 µA to absorb transient
    // warm-up and the load-drop reduction of Vds.
    expect(iD).toBeGreaterThan(60e-6);
    expect(iD).toBeLessThan(150e-6);
  });
});
