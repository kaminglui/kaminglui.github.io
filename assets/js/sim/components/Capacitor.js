/**
 * Linear capacitor using a backward-Euler companion model for transient solves.
 * Adds an equivalent conductance G = C/dt in parallel with a history current
 * source that depends on the previous capacitor voltage.
 *
 * Real capacitors also have a finite parallel leak resistance Rleak (mostly
 * dielectric absorption + finite bulk resistivity). Typical values: 100 MΩ for
 * ceramic, 10 MΩ for aluminum electrolytic. Modelled here as an extra shunt
 * conductance 1/Rleak between n1 and n2 so a charged cap slowly decays toward
 * 0 V when disconnected instead of holding forever.
 */
class Capacitor {
    constructor(n1, n2, capacitance, dt, lastVoltage = 0, rLeak = Infinity) {
        this.n1 = n1;
        this.n2 = n2;
        this.C = Math.max(0, capacitance || 0);
        this.dt = dt;
        this.lastV = lastVoltage || 0;
        // Guard against zero / negative / NaN. Infinity (default) means no leak.
        this.rLeak = Number.isFinite(rLeak) && rLeak > 0 ? rLeak : Infinity;
    }

    stamp(stamps) {
        if (!(this.C > 0) || !(this.dt > 0)) return;
        const g = this.C / this.dt;
        stamps.stampConductance(this.n1, this.n2, g);
        stamps.stampCurrent(this.n1, g * this.lastV);
        stamps.stampCurrent(this.n2, -g * this.lastV);
        if (Number.isFinite(this.rLeak)) {
            stamps.stampConductance(this.n1, this.n2, 1 / this.rLeak);
        }
    }
}

export { Capacitor };
export default Capacitor;
