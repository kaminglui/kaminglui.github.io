/**
 * Independent voltage source stamped as an MNA voltage source with an
 * auxiliary current variable.
 */
class VoltageSource {
    constructor(nPlus, nMinus, voltage) {
        this.nPlus = nPlus;
        this.nMinus = nMinus;
        this.voltage = Number.isFinite(voltage) ? voltage : 0;
    }

    /**
     * Stamp the voltage source: introduces an auxiliary current variable k.
     */
    stamp(stamps) {
        stamps.stampVoltageSource(this.nPlus, this.nMinus, this.voltage);
    }
}

export { VoltageSource };
export default VoltageSource;
