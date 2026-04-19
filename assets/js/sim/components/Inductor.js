/**
 * Linear inductor using a backward-Euler companion model -- dual of the capacitor.
 *
 * Element equation: V_L = L · dI/dt
 * Backward-Euler discretisation: V_L ≈ L · (I_now - I_prev) / dt
 * Norton equivalent per step: I_now = (dt/L) · V_L + I_prev
 *   -> conductance g = dt/L between the two nodes
 *   -> independent current source pushing I_prev from n2 into n1
 *
 * An optional series DC resistance (dcr) models the winding's finite resistance
 * the way real inductors behave at DC. When dcr > 0, we add a series resistor
 * equivalent by reducing the effective conductance:
 *   Z_total = R + jωL  ->  at DC, looks like a resistor; at high f, looks like L.
 * For simplicity we stamp a parallel 1/dcr that approximates the DC path while the
 * Norton term still drives transient behaviour.
 */
class Inductor {
    constructor(n1, n2, L, dt, lastCurrent = 0, dcr = 0) {
        this.n1 = n1;
        this.n2 = n2;
        this.L = Math.max(0, L || 0);
        this.dt = dt;
        this.lastI = lastCurrent || 0;
        this.dcr = Number.isFinite(dcr) && dcr > 0 ? dcr : 0;
    }

    stamp(stamps) {
        if (!(this.L > 0) || !(this.dt > 0)) return;
        const g = this.dt / this.L;
        stamps.stampConductance(this.n1, this.n2, g);
        // Norton companion source. The prior n1→n2 current contributes EXTRA current
        // leaving n1 through the element, so in KCL "external injection into n1"
        // terms the sign is negative at n1 and positive at n2 (opposite of cap's
        // companion, which adds current arriving at n1).
        stamps.stampCurrent(this.n1, -this.lastI);
        stamps.stampCurrent(this.n2, this.lastI);
        if (this.dcr > 0) {
            // Parallel DC path so static bias finds a sensible operating point even
            // though the Norton companion is only valid transiently.
            stamps.stampConductance(this.n1, this.n2, 1 / this.dcr);
        }
    }
}

export { Inductor };
export default Inductor;
