/**
 * Ideal operational amplifier modeled as a Voltage-Controlled Voltage Source (VCVS).
 *
 * Core assumptions:
 * - Infinite input impedance (no input currents), zero output impedance.
 * - Large but finite open-loop gain A_OL to keep matrices well-conditioned.
 * - Stamped as a VCVS in Modified Nodal Analysis: (vOut - vRef) = A_OL (v+ - v-).
 *
 * Optional non-ideal behaviors (disabled by default):
 * - Supply rails + headroom for a simple post-solve saturation clamp.
 * - Hooks for finite bandwidth and slew-rate limiting for future extension.
 */
class IdealOpAmp {
    constructor(nodePos, nodeNeg, nodeOut, {
        nodeVplus = null,
        nodeVminus = null,
        nodeOutRef = 0,
        A_OL = 1e6,
        railHeadroom = 0,
        finiteBandwidth = false,
        unityGainFreq = null,
        finiteSlew = false,
        slewRate = null
    } = {}) {
        this.nodePos = nodePos;
        this.nodeNeg = nodeNeg;
        this.nodeOut = nodeOut;
        this.nodeOutRef = nodeOutRef;
        this.nodeVplus = nodeVplus;
        this.nodeVminus = nodeVminus;
        this.A_OL = A_OL;
        this.railHeadroom = railHeadroom;
        this.finiteBandwidth = finiteBandwidth;
        this.unityGainFreq = unityGainFreq;
        this.finiteSlew = finiteSlew;
        this.slewRate = slewRate;

        this.lastOutput = null;
    }

    /**
     * Stamp for DC analysis (linear, memoryless).
     */
    stampDC(system) {
        this.stampLinear(system);
    }

    /**
     * Stamp for AC analysis. Bandwidth hooks can later convert unityGainFreq
     * into a small-signal pole; currently this is purely ideal.
     */
    stampAC(system, _omega) {
        this.stampLinear(system);
    }

    /**
     * Common linear stamp: VCVS modeled with an auxiliary variable.
     *
     * Equation: (vOut - vRef) - A_OL * (vPos - vNeg) = 0
     */
    stampLinear(system) {
        const k = system.allocateAuxVariable();
        const nOut = this.nodeOut;
        const nRef = this.nodeOutRef;
        const { nodePos: nPos, nodeNeg: nNeg } = this;

        system.addToG(nOut, k, 1);
        system.addToG(nRef, k, -1);
        system.addToG(k, nOut, 1);
        system.addToG(k, nRef, -1);
        system.addToG(k, nPos, -this.A_OL);
        system.addToG(k, nNeg, this.A_OL);
    }

    /**
     * Compute the ideal open-loop output before any limiting.
     */
    computeIdealOutput(nodeVoltages) {
        const vp = nodeVoltages[this.nodePos] ?? 0;
        const vn = nodeVoltages[this.nodeNeg] ?? 0;
        return this.A_OL * (vp - vn);
    }

    /**
     * Calculate output rail limits from the current node voltages.
     */
    computeRailLimits(nodeVoltages) {
        const Vplus = this.nodeVplus != null ? nodeVoltages[this.nodeVplus] : Infinity;
        const Vminus = this.nodeVminus != null ? nodeVoltages[this.nodeVminus] : -Infinity;
        const Vmax = Vplus - this.railHeadroom;
        const Vmin = Vminus + this.railHeadroom;
        return { Vmin, Vmax };
    }

    /**
     * Clamp a candidate output against supply rails if they exist.
     */
    applyOutputRails(nodeVoltages, candidate) {
        const { Vmin, Vmax } = this.computeRailLimits(nodeVoltages);
        return Math.max(Vmin, Math.min(Vmax, candidate));
    }

    /**
     * After solving the linear system, approximate saturation by clamping the
     * ideal output without iterating the matrix again. This keeps the component
     * memoryless while still preventing unbounded outputs when rails exist.
     */
    applySaturation(nodeVoltages) {
        const ideal = this.computeIdealOutput(nodeVoltages);
        const clamped = this.applyOutputRails(nodeVoltages, ideal);
        nodeVoltages[this.nodeOut] = clamped;
        this.lastOutput = clamped;
        return clamped;
    }

    /**
     * Transient hook. Ideal behavior is memoryless, but when finite slew is
     * enabled we limit dv/dt relative to the previous output sample.
     */
    updateTransient(state, dt) {
        const nodeVoltages = state?.nodeVoltages || [];
        let target = this.computeIdealOutput(nodeVoltages);
        target = this.applyOutputRails(nodeVoltages, target);

        if (this.finiteSlew && this.slewRate != null && dt > 0 && Number.isFinite(this.slewRate)) {
            if (this.lastOutput == null) {
                this.lastOutput = target;
            }
            const dv = target - this.lastOutput;
            const maxDv = this.slewRate * dt;
            const limitedDv = Math.max(-maxDv, Math.min(maxDv, dv));
            target = this.lastOutput + limitedDv;
        }

        nodeVoltages[this.nodeOut] = target;
        this.lastOutput = target;
        return target;
    }
}

module.exports = { IdealOpAmp };
