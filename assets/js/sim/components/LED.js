// LED modeled as a 4-state piecewise device:
//   'off'      — below the soft knee: tight leakage, no forward current
//   'knee'     — soft-turn-on region (0.75 Vf → 0.95 Vf): reduced conductance and
//                a lower effective Vf drop, so the LED produces a small but
//                nonzero current. This maps to a visible "dim glow" in the UI.
//   'on'       — deep forward: full conductance, full Vf drop
//   'reverse'  — V < -0.1 V: reverse leakage (tighter than forward-off leakage)
//
// State transitions use hysteresis so the Newton-style outer loop in engine.js
// converges without oscillating between states.
class LED {
    constructor(nAnode, nCathode, { Vf, If, state = null, forwardOn = false } = {}) {
        this.nA = nAnode;
        this.nK = nCathode;
        this.Vf = Math.max(0, Vf ?? 0);
        const IfVal = If ?? 0.01;
        let R = Math.abs(this.Vf / IfVal);
        if (!Number.isFinite(R) || R <= 0) R = 330;
        this.gOn = 1 / R;
        // The knee state conducts with a fraction of the on-state conductance and a
        // lower effective forward drop, producing a smooth toe in the I-V curve.
        this.gKnee = this.gOn * 0.12;
        this.VfKnee = this.Vf * 0.8;
        this.gOff = 1e-9;
        this.gReverse = 1e-10;

        if (state === 'off' || state === 'knee' || state === 'on' || state === 'reverse') {
            this.state = state;
        } else {
            this.state = forwardOn ? 'on' : 'off';
        }
    }

    // Backward-compatible read: "conducting forward?" covers both knee and on.
    get forwardOn() {
        return this.state === 'on' || this.state === 'knee';
    }

    stamp(stamps) {
        if (this.state === 'on') {
            stamps.stampConductance(this.nA, this.nK, this.gOn);
            stamps.stampCurrent(this.nA, this.gOn * this.Vf);
            stamps.stampCurrent(this.nK, -this.gOn * this.Vf);
        } else if (this.state === 'knee') {
            stamps.stampConductance(this.nA, this.nK, this.gKnee);
            stamps.stampCurrent(this.nA, this.gKnee * this.VfKnee);
            stamps.stampCurrent(this.nK, -this.gKnee * this.VfKnee);
        } else if (this.state === 'reverse') {
            stamps.stampConductance(this.nA, this.nK, this.gReverse);
        } else {
            stamps.stampConductance(this.nA, this.nK, this.gOff);
        }
    }

    updateDiodeState(solution, voltageAtNode) {
        const vA = voltageAtNode(solution, this.nA);
        const vK = voltageAtNode(solution, this.nK);
        const v = vA - vK;

        const knee = 0.75 * this.Vf;
        const kneeExit = 0.65 * this.Vf; // knee -> off
        const onEnter = 0.95 * this.Vf;  // knee -> on
        const onExit = 0.85 * this.Vf;   // on -> knee

        let next = this.state;
        if (v < -0.1) {
            next = 'reverse';
        } else if (this.state === 'off') {
            // Allow a direct off -> on transition when the voltage is clearly past the
            // full-on threshold; otherwise step through the knee. This keeps the solver
            // converging in two iterations for the common strongly-biased case.
            if (v > onEnter) next = 'on';
            else if (v > knee) next = 'knee';
        } else if (this.state === 'knee') {
            if (v > onEnter) next = 'on';
            else if (v < kneeExit) next = 'off';
        } else if (this.state === 'on') {
            if (v < onExit) next = 'knee';
        } else if (this.state === 'reverse') {
            if (v > 0) next = 'off';
        }

        const changed = next !== this.state;
        this.state = next;
        return changed;
    }
}

export { LED };
export default LED;
