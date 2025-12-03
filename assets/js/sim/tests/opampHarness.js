/*
 * Simple harness to exercise the IdealOpAmp component against basic circuits.
 * No DOM usage; logs results to stdout for inspection or CI-like checks.
 */
const { MNASystem } = require('../MNASystem');
const { Resistor } = require('../components/Resistor');
const { VoltageSource } = require('../components/VoltageSource');
const { IdealOpAmp } = require('../components/IdealOpAmp');

function solveCircuit(components, baseNodeCount) {
    const system = new MNASystem(baseNodeCount);
    components.forEach((c) => {
        if (typeof c.stampDC === 'function') {
            c.stampDC(system);
        } else if (typeof c.stamp === 'function') {
            c.stamp(system);
        } else {
            throw new Error('Component missing stamp method');
        }
    });
    const solution = system.solve();
    return { system, solution };
}

function sineFromVpp(Vpp, freq, t, phaseRad = 0) {
    const amp = Vpp / 2;
    return amp * Math.sin(2 * Math.PI * freq * t + phaseRad);
}

function sampleTimeSeries(times, componentBuilder, baseNodeCount, pickFn) {
    return times.map((t) => {
        const { solution } = solveCircuit(componentBuilder(t), baseNodeCount);
        return pickFn(solution);
    });
}

function report(name, expected, actual) {
    const error = actual - expected;
    console.log(`${name}: expected ${expected.toFixed(4)} V, got ${actual.toFixed(4)} V (error ${error.toExponential(2)} V)`);
}

function testInvertingAmplifier() {
    const nodes = { gnd: 0, vin: 1, vneg: 2, vout: 3 };
    const vinValue = 0.5; // 500 mV
    const R1 = 1e3; // input
    const R2 = 10e3; // feedback

    const opAmp = new IdealOpAmp(nodes.gnd, nodes.vneg, nodes.vout, { A_OL: 1e6 });
    const components = [
        new VoltageSource(nodes.vin, nodes.gnd, vinValue),
        new Resistor(nodes.vin, nodes.vneg, R1),
        new Resistor(nodes.vout, nodes.vneg, R2),
        opAmp
    ];

    const { solution } = solveCircuit(components, 4);
    const expected = -vinValue * (R2 / R1);
    const actual = solution[nodes.vout];
    report('Inverting amplifier gain', expected, actual);
}

function testNonInvertingAmplifier() {
    const nodes = { gnd: 0, vin: 1, vneg: 2, vout: 3 };
    const vinValue = 0.25; // 250 mV
    const Rg = 1e3; // to ground
    const Rf = 9e3; // feedback

    const opAmp = new IdealOpAmp(nodes.vin, nodes.vneg, nodes.vout, { A_OL: 1e6 });
    const components = [
        new VoltageSource(nodes.vin, nodes.gnd, vinValue),
        new Resistor(nodes.vout, nodes.vneg, Rf),
        new Resistor(nodes.vneg, nodes.gnd, Rg),
        opAmp
    ];

    const { solution } = solveCircuit(components, 4);
    const expected = vinValue * (1 + Rf / Rg);
    const actual = solution[nodes.vout];
    report('Non-inverting amplifier gain', expected, actual);
}

function testSaturation() {
    const nodes = { gnd: 0, vin: 1, vneg: 2, vout: 3, vplus: 4, vminus: 5 };
    const vinValue = 0.7; // would request > rail when closed-loop gain is 10
    const Rg = 1e3;
    const Rf = 9e3;
    const rail = 5.0;

    const opAmp = new IdealOpAmp(nodes.vin, nodes.vneg, nodes.vout, {
        nodeVplus: nodes.vplus,
        nodeVminus: nodes.vminus,
        railHeadroom: 0.0,
        A_OL: 1e6
    });

    const components = [
        new VoltageSource(nodes.vin, nodes.gnd, vinValue),
        new VoltageSource(nodes.vplus, nodes.gnd, rail),
        new VoltageSource(nodes.vminus, nodes.gnd, 0),
        new Resistor(nodes.vout, nodes.vneg, Rf),
        new Resistor(nodes.vneg, nodes.gnd, Rg),
        opAmp
    ];

    const { solution } = solveCircuit(components, 6);
    const unclamped = solution[nodes.vout];
    const clamped = opAmp.applySaturation(solution);
    const expected = rail; // with zero headroom, upper rail is 5 V
    report('Saturation clamp (requested gain 10)', expected, clamped);
    console.log(`Unclamped solver output was ${unclamped.toFixed(4)} V`);
}

function testInvertingSummerMultiSine() {
    const freqs = [110, 800, 800, 3520];
    const Vpp = 0.25;
    const R = 7.5e3;

    const nodes = {
        gnd: 0,
        sum: 1,
        vout: 2,
        vin1: 3,
        vin2: 4,
        vin3: 5,
        vin4: 6
    };

    const times = [];
    const maxFreq = Math.max(...freqs);
    const totalTime = 3 / Math.min(...freqs);
    const dt = 1 / (maxFreq * 128);
    for (let t = 0; t < totalTime; t += dt) times.push(t);

    const builder = (t) => {
        const vin = freqs.map((f) => sineFromVpp(Vpp, f, t));
        const opAmp = new IdealOpAmp(nodes.gnd, nodes.sum, nodes.vout, { A_OL: 1e6 });
        return [
            new VoltageSource(nodes.vin1, nodes.gnd, vin[0]),
            new VoltageSource(nodes.vin2, nodes.gnd, vin[1]),
            new VoltageSource(nodes.vin3, nodes.gnd, vin[2]),
            new VoltageSource(nodes.vin4, nodes.gnd, vin[3]),
            new Resistor(nodes.vin1, nodes.sum, R),
            new Resistor(nodes.vin2, nodes.sum, R),
            new Resistor(nodes.vin3, nodes.sum, R),
            new Resistor(nodes.vin4, nodes.sum, R),
            new Resistor(nodes.vout, nodes.sum, R),
            opAmp
        ];
    };

    const pickVout = (solution) => solution[nodes.vout];
    const outputs = sampleTimeSeries(times, builder, 7, pickVout);
    const expected = times.map((t) => -freqs.reduce((acc, f) => acc + sineFromVpp(Vpp, f, t), 0));

    let maxErr = 0;
    for (let i = 0; i < outputs.length; i += 1) {
        maxErr = Math.max(maxErr, Math.abs(outputs[i] - expected[i]));
    }
    const vMax = Math.max(...outputs);
    const vMin = Math.min(...outputs);
    const vpp = vMax - vMin;

    console.log('Inverting summer Vpp ≈', vpp.toFixed(4), 'V');
    console.log('Max absolute error vs ideal sum:', maxErr.toExponential(3), 'V');
}

function testDifferenceAmpMultiSine() {
    const Vpp = 0.25;
    const freqsPlus = [110, 800];
    const freqsMinus = [800, 3520];
    const R1 = 10e3;
    const R2 = 10e3;
    const R3 = 10e3;
    const R4 = 10e3;

    const nodes = { gnd: 0, vinp: 1, vinm: 2, vpos: 3, inv: 4, vout: 5 };
    const times = [];
    const maxFreq = Math.max(...freqsPlus, ...freqsMinus);
    const totalTime = 3 / Math.min(...freqsPlus, ...freqsMinus);
    const dt = 1 / (maxFreq * 128);
    for (let t = 0; t < totalTime; t += dt) times.push(t);

    const vinPlus = (t) => freqsPlus.reduce((acc, f) => acc + sineFromVpp(Vpp, f, t), 0);
    const vinMinus = (t) => freqsMinus.reduce((acc, f) => acc + sineFromVpp(Vpp, f, t), 0);

    const builder = (t) => {
        const vp = vinPlus(t);
        const vm = vinMinus(t);
        const opAmp = new IdealOpAmp(nodes.vpos, nodes.inv, nodes.vout, { A_OL: 1e6 });
        return [
            new VoltageSource(nodes.vinp, nodes.gnd, vp),
            new VoltageSource(nodes.vinm, nodes.gnd, vm),
            new Resistor(nodes.vinm, nodes.inv, R1),
            new Resistor(nodes.vout, nodes.inv, R2),
            new Resistor(nodes.vinp, nodes.vpos, R3),
            new Resistor(nodes.vpos, nodes.gnd, R4),
            opAmp
        ];
    };

    const pickVout = (solution) => solution[nodes.vout];
    const outputs = sampleTimeSeries(times, builder, 6, pickVout);
    const expected = times.map((t) => vinPlus(t) - vinMinus(t));

    let maxErr = 0;
    for (let i = 0; i < outputs.length; i += 1) {
        maxErr = Math.max(maxErr, Math.abs(outputs[i] - expected[i]));
    }
    const vMax = Math.max(...outputs);
    const vMin = Math.min(...outputs);
    const vpp = vMax - vMin;

    console.log('Difference amp Vpp ≈', vpp.toFixed(4), 'V');
    console.log('Max absolute error vs ideal difference:', maxErr.toExponential(3), 'V');
}

function main() {
    console.log('--- IdealOpAmp Harness ---');
    testInvertingAmplifier();
    testNonInvertingAmplifier();
    testSaturation();
    testInvertingSummerMultiSine();
    testDifferenceAmpMultiSine();
}

if (require.main === module) {
    main();
}

module.exports = {
    testInvertingAmplifier,
    testNonInvertingAmplifier,
    testSaturation,
    testInvertingSummerMultiSine,
    testDifferenceAmpMultiSine,
    solveCircuit
};
