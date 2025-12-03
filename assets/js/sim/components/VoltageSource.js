/**
 * Independent voltage source stamped as an MNA voltage source with an
 * auxiliary current variable.
 */
class VoltageSource {
    constructor(nPlus, nMinus, voltage) {
        this.nPlus = nPlus;
        this.nMinus = nMinus;
        this.voltage = voltage;
    }

    /**
     * Stamp the voltage source: introduces an auxiliary current variable k.
     *
     *  v(nPlus) - v(nMinus) = voltage
     *  Current through source is represented by the auxiliary variable.
     */
    stamp(system) {
        const k = system.allocateAuxVariable();
        system.addToG(this.nPlus, k, 1);
        system.addToG(this.nMinus, k, -1);
        system.addToG(k, this.nPlus, 1);
        system.addToG(k, this.nMinus, -1);
        system.addToB(k, this.voltage);
    }
}

module.exports = { VoltageSource };
