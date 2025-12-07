/**
 * Linear capacitor using a backward-Euler companion model for transient solves.
 * Adds an equivalent conductance G = C/dt in parallel with a history current
 * source that depends on the previous capacitor voltage.
 */
class Capacitor {
    constructor(n1, n2, capacitance, dt, lastVoltage = 0) {
        this.n1 = n1;
        this.n2 = n2;
        this.C = Math.max(0, capacitance || 0);
        this.dt = dt;
        this.lastV = lastVoltage || 0;
    }

    stamp(stamps) {
        if (!(this.C > 0) || !(this.dt > 0)) return;
        const g = this.C / this.dt;
        stamps.stampConductance(this.n1, this.n2, g);
        stamps.stampCurrent(this.n1, g * this.lastV);
        stamps.stampCurrent(this.n2, -g * this.lastV);
    }
}

export { Capacitor };
export default Capacitor;
