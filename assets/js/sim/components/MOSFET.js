class MOSFET {
    constructor(nG, nD, nS, nB, {
        type = 'NMOS',
        vt = 0.7,
        kp = 140e-6,
        W = 1e-6,
        L = 1e-6,
        lambda = 0,
        gamma = 0,
        phi = 0.9,
        lastVg = 0,
        lastVd = 0,
        lastVs = 0,
        lastVb = null
    } = {}) {
        this.nG = nG;
        this.nD = nD;
        this.nS = nS;
        this.nB = nB;
        this.isP = String(type || 'NMOS').toUpperCase() === 'PMOS';
        this.vt = Math.abs(vt || 0);
        this.kp = kp || 0;
        this.W = W || 0;
        this.L = L || 1e-6;
        this.lambda = lambda || 0;
        this.gamma = Math.max(0, gamma || 0);
        this.phi = Math.max(0, phi || 0.9);
        this.k = this.kp * (this.W / this.L || 1);
        this.lastVg = lastVg || 0;
        this.lastVd = lastVd || 0;
        this.lastVs = lastVs || 0;
        this.lastVb = lastVb == null ? this.lastVs : lastVb;
        this.gLeak = 1e-9;
    }

    stamp(stamps) {
        const vG = this.nG === -1 ? 0 : this.lastVg;
        const vD = this.nD === -1 ? 0 : this.lastVd;
        const vS = this.nS === -1 ? 0 : this.lastVs;
        const vB = this.nB === -1 ? vS : this.lastVb;

        const VsbRaw = this.isP ? (vB - vS) : (vS - vB);
        const Vsb = Math.max(0, VsbRaw);
        const rootBase = Math.sqrt(Math.max(0, this.phi));
        const rootBias = Math.sqrt(Math.max(0, this.phi + Vsb));
        const vtEff = this.vt + this.gamma * (rootBias - rootBase);

        let vgs = this.isP ? (vS - vG) : (vG - vS);
        let vds = this.isP ? (vS - vD) : (vD - vS);
        let ids = 0;

        if (vgs > vtEff) {
            if (vds < vgs - vtEff) {
                ids = this.k * ((vgs - vtEff) * vds - 0.5 * vds * vds);
            } else {
                const vov = vgs - vtEff;
                ids = 0.5 * this.k * vov * vov * (1 + this.lambda * (vds - vov));
            }
        }
        if (this.isP) ids = -ids;

        if (this.nD !== -1) stamps.stampCurrent(this.nD, -ids);
        if (this.nS !== -1) stamps.stampCurrent(this.nS, ids);
        stamps.stampConductance(this.nD, this.nS, this.gLeak);
    }
}

export { MOSFET };
export default MOSFET;
