/**
 * Ideal DC current source: forces Idc amps to flow from nPlus out through the
 * external circuit and back into nMinus. Stamped as current injections only —
 * no branch equation, no branch variable — so it's cheap and never introduces
 * convergence trouble.
 *
 * Pin convention matches the schematic arrow: the arrow points toward nPlus,
 * which is the pin the current exits from (i.e. the "head" of the arrow).
 */
class CurrentSource {
    constructor(nPlus, nMinus, Idc) {
        this.nP = nPlus;
        this.nM = nMinus;
        this.I = Number.isFinite(Idc) ? Idc : 0;
    }

    stamp(stamps) {
        if (!this.I) return;
        // stampCurrent(n, +v) adds v to b[n], where b[n] is external current
        // injected INTO node n (Gv = b, KCL "current in = current out"). A DC
        // current source pushes I out of nPlus and absorbs it at nMinus — in
        // MNA terms that's +I injected at nPlus, -I at nMinus.
        stamps.stampCurrent(this.nP, this.I);
        stamps.stampCurrent(this.nM, -this.I);
    }
}

export { CurrentSource };
export default CurrentSource;
