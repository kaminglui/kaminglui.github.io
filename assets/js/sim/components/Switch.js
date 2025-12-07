class Switch {
    constructor(nodes, { type = 'SPST', position = 'A', getActiveConnections } = {}) {
        this.nodes = nodes;
        this.type = String(type || 'SPST').toUpperCase();
        this.position = position === 'B' ? 'B' : 'A';
        this.getActiveConnections = getActiveConnections;
        this.gOn = 1 / 1e-3;
        this.gOff = 1e-9;
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
        if (!pairs.length && this.type === 'SPST') {
            stamps.stampConductance(this.nodes[0], this.nodes[1], this.gOff);
        }
        pairs.forEach(([aIdx, bIdx]) => {
            stamps.stampConductance(this.nodes[aIdx], this.nodes[bIdx], this.gOn);
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
