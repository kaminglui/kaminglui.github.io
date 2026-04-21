/**
 * Ideal operational amplifier modeled as a VCVS with optional rail clamping.
 */
class IdealOpAmp {
    constructor({
        nOut,
        nInv,
        nNon,
        nVPlus = null,
        nVMinus = null,
        gain = 1e6,
        inputLeak = 0,
        outputLeak = 0,
        headroom = 0,
        maxOutputClamp = 100,
        mapNode,
        state = null,
        stateKey = null,
        hysteresis = 0,
        saturationWindow = 0.02,
        slewRate = Infinity,
        inputOffset = 0,
        outputImpedance = 0
    }) {
        this.nOut = nOut;
        this.nInv = nInv;
        this.nNon = nNon;
        this.nVPlus = nVPlus;
        this.nVMinus = nVMinus;
        this.gain = gain;
        this.inputLeak = inputLeak;
        this.outputLeak = outputLeak;
        this.headroom = headroom;
        this.maxOutputClamp = maxOutputClamp;
        this.mapNode = mapNode;
        this.state = state;
        this.stateKey = stateKey;
        this.hysteresis = hysteresis;
        this.saturationWindow = saturationWindow;
        // Volts / second. Used to limit how far the output can swing in one step
        // (dt is supplied at clampOutput time, so the per-iteration limit scales
        // with the simulation's timestep and a sharp input produces a visible ramp).
        this.slewRate = Number.isFinite(slewRate) && slewRate > 0 ? slewRate : Infinity;
        // Input offset voltage: real op-amps have a small (sub-mV to a few mV) mismatch
        // between the input differential pair that biases the output even when the inputs
        // are perfectly matched. We add it to (vNon - vInv) inside clampOutput.
        this.inputOffset = Number.isFinite(inputOffset) ? inputOffset : 0;
        // Thevenin output impedance; finite value drops the output a bit into loads and
        // makes the op-amp behave like a real device when driving near the rails.
        this.outputImpedance = Number.isFinite(outputImpedance) && outputImpedance > 0
            ? outputImpedance : 0;
    }

    stamp(stamps) {
        if (this.nNon !== -1) stamps.stampConductance(this.nNon, -1, this.inputLeak);
        if (this.nInv !== -1) stamps.stampConductance(this.nInv, -1, this.inputLeak);
        if (this.nOut !== -1) stamps.stampConductance(this.nOut, -1, this.outputLeak);
        if (this.pinned && this.nOut !== -1) {
            // Second-pass stamp: after clampOutput() decides what the output
            // should actually be (rail / slew-limited / open loop), we re-stamp
            // the op-amp as an ideal voltage source pinning nOut to that value
            // and re-solve. Without this, downstream nodes — anything connected
            // to nOut through resistors or junctions — still see the first-pass
            // gain·differential output (which can easily hit ±1 MV for a
            // saturated comparator), and any current / voltage read from those
            // nodes is garbage even though clampOutput already fixed nOut
            // itself. The extra solve makes the whole solution self-consistent.
            stamps.stampVCVS(this.nOut, -1, -1, -1, 0, this.pinnedValue || 0);
            return;
        }
        // Input offset voltage adds gain·Vos to the VCVS branch constant so the
        // effective differential input is (Vnon − Vinv + Vos).
        stamps.stampVCVS(this.nOut, -1, this.nNon, this.nInv, this.gain, this.gain * this.inputOffset);
    }

    pinOutput(value) {
        this.pinnedValue = value;
        this.pinned = true;
    }

    clearPin() {
        this.pinned = false;
        this.pinnedValue = 0;
    }

    clampOutput(systemSolution, dt = 0) {
        if (this.nOut == null || this.nOut === -1) return;
        const nodeVoltage = (node) => {
            if (node == null || node === -1) return 0;
            const idx = this.mapNode(node);
            return systemSolution?.[idx] ?? 0;
        };

        const outIdx = this.mapNode(this.nOut);
        const railsHigh = (this.nVPlus == null)
            ? this.maxOutputClamp
            : (this.nVPlus === -1 ? 0 : nodeVoltage(this.nVPlus));
        const railsLow = (this.nVMinus == null)
            ? -this.maxOutputClamp
            : (this.nVMinus === -1 ? 0 : nodeVoltage(this.nVMinus));
        const railMax = Math.max(railsHigh, railsLow);
        const railMin = Math.min(railsHigh, railsLow);
        const vmax = Math.min(railMax - this.headroom, this.maxOutputClamp);
        const vmin = Math.max(railMin + this.headroom, -this.maxOutputClamp);
        const safeMin = Math.min(vmin, vmax);
        const safeMax = Math.max(vmin, vmax);
        const raw = systemSolution?.[outIdx] ?? 0;
        const clamped = Math.max(safeMin, Math.min(safeMax, raw));

        const bucket = (this.stateKey != null && this.state)
            ? (this.state[this.stateKey] || (this.state[this.stateKey] = {}))
            : null;
        const diff = nodeVoltage(this.nNon) - nodeVoltage(this.nInv);
        const hysteresis = Math.abs(this.hysteresis || 0);
        const prevSign = bucket?.lastSign || 0;
        const sign = (Math.abs(diff) <= hysteresis) ? (prevSign || 0) : (Math.sign(diff) || prevSign || 0);
        const railSpan = Math.max(Math.abs(safeMax), Math.abs(safeMin));
        const railWindow = railSpan * (Number.isFinite(this.saturationWindow) ? this.saturationWindow : 0.02);
        const nearHigh = clamped >= safeMax - railWindow;
        const nearLow  = clamped <= safeMin + railWindow;
        const nearRail = nearHigh || nearLow;

        let finalVal = clamped;
        if (bucket) {
            if (nearRail && sign !== 0) {
                finalVal = sign > 0 ? safeMax : safeMin;
            }
        }

        // Slew-rate limit: cap how much the output can move from its previous value
        // in this dt. Gives sharp input steps a visible ramp on the scope and matches
        // real op-amp transient behaviour.
        if (bucket && Number.isFinite(this.slewRate) && dt > 0 && bucket.lastOut != null) {
            const maxStep = this.slewRate * dt;
            const delta = finalVal - bucket.lastOut;
            if (Math.abs(delta) > maxStep) {
                finalVal = bucket.lastOut + Math.sign(delta) * maxStep;
            }
        }

        // Output impedance: Thevenin Rout drops the output voltage under load. We
        // approximate the load current from the node's current balance by looking at
        // how much our ideal output would need to source if its bare-VCVS result were
        // the target. The applied clamp already integrates the VCVS's node voltage;
        // we only need to back-compute an approximate droop.
        if (this.outputImpedance > 0 && bucket && bucket.lastOut != null) {
            const gainedDiff = this.gain * (nodeVoltage(this.nNon) - nodeVoltage(this.nInv) + this.inputOffset);
            const idealTarget = Math.max(safeMin, Math.min(safeMax, gainedDiff));
            // Estimate "how hard the output is being pulled" as the gap between the
            // ideal target and the solved node voltage; scale by Rout to droop the
            // reported output. Keeps the model stable for modest Rout.
            const droop = (idealTarget - raw) * Math.min(1, this.outputImpedance / (this.outputImpedance + 50));
            finalVal = Math.max(safeMin, Math.min(safeMax, finalVal - droop * 0.05));
        }

        if (bucket) {
            bucket.lastSign = sign || prevSign || 0;
            bucket.lastOut = finalVal;
        }
        systemSolution[outIdx] = finalVal;
    }
}

export { IdealOpAmp };
export default IdealOpAmp;
