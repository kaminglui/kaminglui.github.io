class LED {
    constructor(nAnode, nCathode, { Vf, If, forwardOn = false } = {}) {
        this.nA = nAnode;
        this.nK = nCathode;
        this.Vf = Math.max(0, Vf ?? 0);
        const IfVal = If ?? 0.01;
        let R = Math.abs(this.Vf / IfVal);
        if (!Number.isFinite(R) || R <= 0) R = 330;
        this.gOn = 1 / R;
        this.gOff = 1e-9;
        this.forwardOn = !!forwardOn;
    }

    stamp(stamps) {
        const g = this.forwardOn ? this.gOn : this.gOff;
        stamps.stampConductance(this.nA, this.nK, g);
        if (this.forwardOn) {
            stamps.stampCurrent(this.nA, this.gOn * this.Vf);
            stamps.stampCurrent(this.nK, -this.gOn * this.Vf);
        }
    }

    updateDiodeState(solution, voltageAtNode) {
        const vA = voltageAtNode(solution, this.nA);
        const vK = voltageAtNode(solution, this.nK);
        const vDiff = vA - vK;
        const onThresh = this.Vf * 0.9;
        const offThresh = this.Vf * 0.7;
        const next = this.forwardOn
            ? (vDiff > offThresh)
            : (vDiff > onThresh);
        const changed = next !== this.forwardOn;
        this.forwardOn = next;
        return changed;
    }
}

export { LED };
export default LED;
