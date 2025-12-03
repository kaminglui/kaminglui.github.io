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

function main() {
    console.log('--- IdealOpAmp Harness ---');
    testInvertingAmplifier();
    testNonInvertingAmplifier();
    testSaturation();
}

if (require.main === module) {
    main();
}

module.exports = {
    testInvertingAmplifier,
    testNonInvertingAmplifier,
    testSaturation,
    solveCircuit
};
