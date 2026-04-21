class Potentiometer {
    constructor(n1, nWiper, n3, totalResistance, turnFraction, minLeg = 1e-3) {
        const total = Math.max(minLeg, Math.abs(totalResistance || 0));
        const frac = Math.max(0, Math.min(1, turnFraction ?? 0.5));
        const R1 = Math.max(minLeg, total * frac);
        const R2 = Math.max(minLeg, total * (1 - frac));
        this.n1 = n1;
        this.nWiper = nWiper;
        this.n3 = n3;
        this.g1 = 1 / R1;
        this.g2 = 1 / R2;
    }

    stamp(stamps) {
        stamps.stampConductance(this.n1, this.nWiper, this.g1);
        stamps.stampConductance(this.nWiper, this.n3, this.g2);
    }
}

export { Potentiometer };
export default Potentiometer;
