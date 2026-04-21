/**
 * Standard PN-junction diode with a two-state piecewise model.
 *
 * Below Vf: leakage only (reverse or sub-threshold forward).
 * At/past Vf: stiff conductance clamped to Vf — adding little extra drop even
 *             at many-times-rated current, mirroring real-diode I-V curves near
 *             the knee. This is LED.js minus the "dim knee glow" state the LED
 *             needs for visible brightness feedback.
 *
 * updateDiodeState() runs inside the engine's Newton-style iteration loop and
 * uses hysteresis to avoid oscillation around the knee.
 */
class Diode {
    constructor(nAnode, nCathode, { Vf, If, state = null, forwardOn = false } = {}) {
        this.nA = nAnode;
        this.nK = nCathode;
        this.Vf = Math.max(0, Vf ?? 0.7);
        const IfVal = Math.max(1e-6, If ?? 0.01);
        const baseG = IfVal / (this.Vf || 1);
        this.gOn = 100 * baseG;
        this.gOff = 1e-9;
        this.gReverse = 1e-10;

        if (state === 'off' || state === 'on' || state === 'reverse') {
            this.state = state;
        } else {
            this.state = forwardOn ? 'on' : 'off';
        }
    }

    get forwardOn() {
        return this.state === 'on';
    }

    stamp(stamps) {
        if (this.state === 'on') {
            stamps.stampConductance(this.nA, this.nK, this.gOn);
            stamps.stampCurrent(this.nA, this.gOn * this.Vf);
            stamps.stampCurrent(this.nK, -this.gOn * this.Vf);
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

        const onEnter = this.Vf * 0.95;
        const onExit = this.Vf * 0.85;

        let next = this.state;
        if (v < -0.1) {
            next = 'reverse';
        } else if (this.state === 'off') {
            if (v > onEnter) next = 'on';
        } else if (this.state === 'on') {
            if (v < onExit) next = 'off';
        } else if (this.state === 'reverse') {
            if (v > 0) next = 'off';
        }

        const changed = next !== this.state;
        this.state = next;
        return changed;
    }
}

export { Diode };
export default Diode;
