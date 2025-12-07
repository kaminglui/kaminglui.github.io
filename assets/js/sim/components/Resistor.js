/**
 * Ideal resistor for MNA stamping.
 * Conductance-only element: g = 1/R between nodes n1 and n2.
 */
class Resistor {
    constructor(n1, n2, resistance) {
        this.n1 = n1;
        this.n2 = n2;
        const R = Number(resistance);
        this.g = (R > 0 && Number.isFinite(R)) ? 1 / R : 0;
    }

    /**
     * Stamp the resistor into the conductance matrix.
     */
    stamp(stamps) {
        if (!this.g) return;
        stamps.stampConductance(this.n1, this.n2, this.g);
    }
}

export { Resistor };
export default Resistor;
