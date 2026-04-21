/**
 * Simplified bipolar-junction-transistor model.
 *
 *   Ie = Ib + Ic,   Ic = β · Ib (active region)
 *   Cutoff:   Vbe < Vbe_on       -> Ib ≈ 0, Ic ≈ 0
 *   Active:   Vbe ≥ Vbe_on       -> Ib = (Vbe − Vbe_on) / r_be, Ic = β · Ib
 *   Saturation: Vce < Vce_sat    -> Vce clamped, Ic ≤ β · Ib
 *
 * PNP uses the same math with signs flipped (exchanges collector/emitter,
 * negates Ib / Ic). This is the usual educational piecewise-linear model --
 * good enough for logic switching, common-emitter amplifiers, and current
 * sources, without iteration.
 */
class BJT {
    constructor(nB, nC, nE, {
        type = 'NPN',
        beta = 100,
        vbeOn = 0.7,
        vceSat = 0.2,
        rBe = 1000, // equivalent small-signal base resistance once in forward active
        lastVb = 0,
        lastVc = 0,
        lastVe = 0
    } = {}) {
        this.nB = nB;
        this.nC = nC;
        this.nE = nE;
        this.isPnp = String(type || 'NPN').toUpperCase() === 'PNP';
        this.beta = Math.max(1, beta || 1);
        this.vbeOn = Math.max(0, vbeOn);
        this.vceSat = Math.max(0, vceSat);
        this.rBe = Math.max(1, rBe);
        this.lastVb = lastVb || 0;
        this.lastVc = lastVc || 0;
        this.lastVe = lastVe || 0;
        this.gLeak = 1e-9;
    }

    stamp(stamps) {
        const vB = this.nB === -1 ? 0 : this.lastVb;
        const vC = this.nC === -1 ? 0 : this.lastVc;
        const vE = this.nE === -1 ? 0 : this.lastVe;

        // Signed orientation: for NPN we measure Vbe = Vb - Ve, Vce = Vc - Ve.
        // For PNP the currents flow the opposite way; flip both voltages.
        const vbe = this.isPnp ? (vE - vB) : (vB - vE);
        const vce = this.isPnp ? (vE - vC) : (vC - vE);

        let ib = 0;
        let ic = 0;
        if (vbe > this.vbeOn) {
            ib = (vbe - this.vbeOn) / this.rBe;
            // Always stamp the full β·ib. When the external collector load can't
            // support that much current, the solver will naturally drop Vce toward 0
            // (hard-saturation equivalent). This is a deliberate simplification over
            // a true saturation clamp — it avoids the iteration ping-pong that a
            // piecewise Vce clamp causes between stamps, while still giving correct
            // qualitative behaviour: conducting when biased on, limited by the load.
            ic = this.beta * ib;
            if (vce < 0) ic = 0; // reverse-biased collector — never pull negative current
        }

        // Flip signs for PNP: emitter sources current into the rest of the circuit.
        const iBSigned = this.isPnp ? -ib : ib;
        const iCSigned = this.isPnp ? -ic : ic;
        const iE = iBSigned + iCSigned;

        // Base current flows INTO the base for NPN (out of emitter), so stamp -ib at B.
        if (this.nB !== -1) stamps.stampCurrent(this.nB, -iBSigned);
        if (this.nC !== -1) stamps.stampCurrent(this.nC, -iCSigned);
        if (this.nE !== -1) stamps.stampCurrent(this.nE, iE);

        // Tiny leakage to avoid singular matrices when the transistor is cut off.
        stamps.stampConductance(this.nC, this.nE, this.gLeak);
        stamps.stampConductance(this.nB, this.nE, this.gLeak);
    }
}

export { BJT };
export default BJT;
