/**
 * Modified Nodal Analysis (MNA) matrix container and linear solver.
 *
 * Responsibility:
 * - Maintain a conductance matrix G and RHS vector b.
 * - Allow dynamic growth for auxiliary variables (e.g., voltage sources, VCVS).
 * - Provide a simple Gaussian elimination solver for small educational circuits.
 *
 * This module is intentionally UI-free and can be reused by any simulation host.
 */
class MNASystem {
    constructor(baseNodeCount = 1) {
        this.size = Math.max(1, baseNodeCount);
        this.G = Array.from({ length: this.size }, () => Array(this.size).fill(0));
        this.b = Array(this.size).fill(0);
        // Anchor the reference node (index 0) at 0 V to avoid singular systems.
        this.G[0][0] = 1;
    }

    /**
     * Ensure the matrix is at least `targetSize` square by appending rows/cols.
     */
    ensureSize(targetSize) {
        if (targetSize <= this.size) return;
        const oldSize = this.size;
        this.size = targetSize;
        for (let i = 0; i < oldSize; i += 1) {
            const row = this.G[i];
            for (let j = oldSize; j < this.size; j += 1) {
                row.push(0);
            }
        }
        for (let i = oldSize; i < this.size; i += 1) {
            this.G.push(Array(this.size).fill(0));
            this.b.push(0);
        }
    }

    /**
     * Reserve a new auxiliary variable (e.g., current through a voltage source)
     * and return its index.
     */
    allocateAuxVariable() {
        const index = this.size;
        this.ensureSize(this.size + 1);
        return index;
    }

    /**
     * Add a contribution to the conductance matrix at (i, j).
     */
    addToG(i, j, value) {
        if (i == null || j == null) return;
        this.ensureSize(Math.max(i, j) + 1);
        this.G[i][j] += value;
    }

    /**
     * Add a contribution to the RHS vector.
     */
    addToB(i, value) {
        if (i == null) return;
        this.ensureSize(i + 1);
        this.b[i] += value;
    }

    /**
     * Solve the linear system G * x = b using partial pivoting.
     * This is sufficient for the small matrices used in the demo harness.
     */
    solve() {
        const n = this.size;
        const A = this.G.map((row) => row.slice());
        const rhs = this.b.slice();

        for (let k = 0; k < n; k += 1) {
            let pivot = k;
            for (let i = k + 1; i < n; i += 1) {
                if (Math.abs(A[i][k]) > Math.abs(A[pivot][k])) pivot = i;
            }
            if (Math.abs(A[pivot][k]) < 1e-18) {
                throw new Error(`Singular matrix encountered at pivot ${k}`);
            }
            if (pivot !== k) {
                [A[k], A[pivot]] = [A[pivot], A[k]];
                [rhs[k], rhs[pivot]] = [rhs[pivot], rhs[k]];
            }

            const pivotVal = A[k][k];
            for (let j = k; j < n; j += 1) {
                A[k][j] /= pivotVal;
            }
            rhs[k] /= pivotVal;

            for (let i = k + 1; i < n; i += 1) {
                const factor = A[i][k];
                if (factor === 0) continue;
                for (let j = k; j < n; j += 1) {
                    A[i][j] -= factor * A[k][j];
                }
                rhs[i] -= factor * rhs[k];
            }
        }

        const x = Array(n).fill(0);
        for (let i = n - 1; i >= 0; i -= 1) {
            let sum = rhs[i];
            for (let j = i + 1; j < n; j += 1) {
                sum -= A[i][j] * x[j];
            }
            x[i] = sum;
        }
        return x;
    }
}

module.exports = { MNASystem };
