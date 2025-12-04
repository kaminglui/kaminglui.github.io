/**
 * Linear capacitor using a backward-Euler companion model for transient solves.
 * Adds an equivalent conductance G = C/dt in parallel with a history current
 * source that depends on the previous capacitor voltage.
 */
class Capacitor {
    constructor(node1, node2, capacitance) {
        this.n1 = node1;
        this.n2 = node2;
        this.C = capacitance;
    }

    stampTransient(system, { dt, prevSolution }) {
        if (!dt || dt <= 0) return; // no contribution without a timestep
        const vPrev = (prevSolution?.[this.n1] || 0) - (prevSolution?.[this.n2] || 0);
        const G = this.C / dt;
        const Ieq = G * vPrev;

        system.addToG(this.n1, this.n1, G);
        system.addToG(this.n2, this.n2, G);
        system.addToG(this.n1, this.n2, -G);
        system.addToG(this.n2, this.n1, -G);

        system.addToB(this.n1, Ieq);
        system.addToB(this.n2, -Ieq);
    }
}

module.exports = { Capacitor };
