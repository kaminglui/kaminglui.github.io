// Deterministic pseudo-random for bounce so a given (position change time, now)
// pair always produces the same pattern -- tests stay reproducible.
function bounceNoise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

class Switch {
    constructor(nodes, {
        type = 'SPST',
        position = 'A',
        getActiveConnections,
        bounceEnabled = false,
        bounceChangeTime = null,
        bounceDuration = 3e-3, // ~3 ms, typical mechanical toggle switch
        now = 0
    } = {}) {
        this.nodes = nodes;
        this.type = String(type || 'SPST').toUpperCase();
        this.position = position === 'B' ? 'B' : 'A';
        this.getActiveConnections = getActiveConnections;
        this.gOn = 1 / 1e-3;
        this.gOff = 1e-9;
        // Bounce modeling: if enabled and the position just changed within the last
        // bounceDuration seconds, briefly flip between closed and open a few times
        // before settling. Keeps existing "quiet" simulations clean (opt-in prop).
        this.bounceEnabled = !!bounceEnabled;
        this.bounceChangeTime = Number.isFinite(bounceChangeTime) ? bounceChangeTime : null;
        this.bounceDuration = bounceDuration;
        this.now = now;
    }

    // Returns true if we're inside the post-toggle bounce window AND the current
    // bounce phase is "open" (disconnected). Controls whether we stamp gOn or gOff
    // for the would-be-closed pairs.
    inBounceOpenPhase() {
        if (!this.bounceEnabled || this.bounceChangeTime == null) return false;
        const elapsed = this.now - this.bounceChangeTime;
        if (elapsed < 0 || elapsed >= this.bounceDuration) return false;
        // 4 half-cycles of random dwell within the window; alternate open/closed,
        // so half the window is "open" but with chaotic timing that looks real.
        const slot = Math.floor(elapsed / (this.bounceDuration / 8));
        const rand = bounceNoise(Math.floor(this.bounceChangeTime * 1e6) + slot);
        return rand < 0.5;
    }

    activePairs() {
        if (typeof this.getActiveConnections === 'function') {
            return this.getActiveConnections() || [];
        }
        const pos = this.position === 'B' ? 'B' : 'A';
        if (this.type === 'SPST') return pos === 'A' ? [[0, 1]] : [];
        if (this.type === 'SPDT') {
            const idx = pos === 'A' ? 1 : 2;
            return [[0, idx]];
        }
        if (this.type === 'DPDT') {
            const upper = pos === 'A' ? 1 : 2;
            const lower = pos === 'A' ? 4 : 5;
            return [
                [0, upper],
                [3, lower]
            ];
        }
        return [];
    }

    stamp(stamps) {
        const pairs = this.activePairs();
        const bouncingOpen = this.inBounceOpenPhase();
        // During bounce's "open" phase, drop the normally-closed pairs to gOff.
        const closedG = bouncingOpen ? this.gOff : this.gOn;
        if (!pairs.length && this.type === 'SPST') {
            stamps.stampConductance(this.nodes[0], this.nodes[1], this.gOff);
        }
        pairs.forEach(([aIdx, bIdx]) => {
            stamps.stampConductance(this.nodes[aIdx], this.nodes[bIdx], closedG);
        });

        if (this.type === 'SPDT') {
            const unused = this.position === 'A' ? 2 : 1;
            stamps.stampConductance(this.nodes[0], this.nodes[unused], this.gOff);
        } else if (this.type === 'DPDT') {
            const upperUnused = this.position === 'A' ? 2 : 1;
            const lowerUnused = this.position === 'A' ? 5 : 4;
            stamps.stampConductance(this.nodes[0], this.nodes[upperUnused], this.gOff);
            stamps.stampConductance(this.nodes[3], this.nodes[lowerUnused], this.gOff);
        }
    }
}

export { Switch };
export default Switch;
