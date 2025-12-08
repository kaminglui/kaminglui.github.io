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
        saturationWindow = 0.02
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
    }

    stamp(stamps) {
        if (this.nNon !== -1) stamps.stampConductance(this.nNon, -1, this.inputLeak);
        if (this.nInv !== -1) stamps.stampConductance(this.nInv, -1, this.inputLeak);
        if (this.nOut !== -1) stamps.stampConductance(this.nOut, -1, this.outputLeak);
        stamps.stampVCVS(this.nOut, -1, this.nNon, this.nInv, this.gain);
    }

    clampOutput(systemSolution) {
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
            bucket.lastSign = sign || prevSign || 0;
            bucket.lastOut = finalVal;
        }
        systemSolution[outIdx] = finalVal;
    }
}

export { IdealOpAmp };
export default IdealOpAmp;
