/**
 * Ideal resistor for MNA stamping.
 * Conductance-only element: g = 1/R between nodes n1 and n2.
 */
class Resistor {
    constructor(n1, n2, resistance) {
        if (resistance <= 0) {
            throw new Error('Resistance must be positive');
        }
        this.n1 = n1;
        this.n2 = n2;
        this.g = 1 / resistance;
    }

    /**
     * Stamp the resistor into the conductance matrix.
     * G[n1][n1] += g; G[n1][n2] -= g; G[n2][n1] -= g; G[n2][n2] += g
     */
    stamp(system) {
        const { n1, n2, g } = this;
        system.addToG(n1, n1, g);
        system.addToG(n1, n2, -g);
        system.addToG(n2, n1, -g);
        system.addToG(n2, n2, g);
    }
}

module.exports = { Resistor };
