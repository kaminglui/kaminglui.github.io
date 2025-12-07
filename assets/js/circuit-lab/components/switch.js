export default function createSwitch({
    Component,
    SWITCH_TYPES,
    DEFAULT_SWITCH_TYPE,
    getCurrentSwitchType,
    getWires,
    setWires,
    LABEL_FONT_SMALL,
    LABEL_FONT_BOLD,
    LABEL_OUTSIDE_OFFSET,
    offsetLabelFromPin,
    getPinDirection,
    getPinCenter
}) {
    return class Switch extends Component {
        setup() {
            const initial = (SWITCH_TYPES.includes(getCurrentSwitchType())) ? getCurrentSwitchType() : DEFAULT_SWITCH_TYPE;
            this.props = { Type: initial, Position: 'A' };
            this.pinNames = [];
            this.applyType(initial, true);
        }

        getTypeConfig(type) {
            switch (type) {
                case 'SPDT':
                    return {
                        names: ['COM', 'A', 'B'],
                        pins: [
                            { x: -30, y: 0 }, // COM
                            { x: 30, y: -16 }, // A (upper)
                            { x: 30, y: 16 } // B (lower)
                        ],
                        w: 80,
                        h: 60
                    };
                case 'DPDT':
                    return {
                        names: ['COM1', 'A1', 'B1', 'COM2', 'A2', 'B2'],
                        pins: [
                            { x: -32, y: -22 }, // COM1
                            { x: 32, y: -32 }, // A1
                            { x: 32, y: -12 }, // B1
                            { x: -32, y: 22 }, // COM2
                            { x: 32, y: 12 }, // A2
                            { x: 32, y: 32 } // B2
                        ],
                        w: 90,
                        h: 90
                    };
                default:
                    return {
                        names: ['A', 'B'],
                        pins: [
                            { x: -30, y: 0 }, // A
                            { x: 30, y: 0 } // B
                        ],
                        w: 80,
                        h: 40
                    };
            }
        }

        applyType(type, skipWireCleanup = false) {
            const clamped = SWITCH_TYPES.includes(type) ? type : DEFAULT_SWITCH_TYPE;
            const cfg = this.getTypeConfig(clamped);
            const prevNames = this.pinNames ? [...this.pinNames] : [];
            const nameFromIdx = new Map(prevNames.map((n, i) => [i, n]));

            this.props.Type = clamped;
            if (this.props.Position !== 'A' && this.props.Position !== 'B') {
                this.props.Position = 'A';
            }
            this.pinNames = [...cfg.names];
            this.pins = cfg.pins.map((p) => ({ ...p }));
            this.w = cfg.w;
            this.h = cfg.h;

            if (!skipWireCleanup) {
                const nextIdxByName = new Map(this.pinNames.map((n, i) => [n, i]));
                const currentWires = getWires();
                const nextWires = currentWires.filter((w) => {
                    let keep = true;
                    if (w.from.c === this) {
                        const name = nameFromIdx.get(w.from.p);
                        const mapped = nextIdxByName.get(name);
                        if (mapped == null) keep = false;
                        else w.from.p = mapped;
                    }
                    if (w.to.c === this) {
                        const name = nameFromIdx.get(w.to.p);
                        const mapped = nextIdxByName.get(name);
                        if (mapped == null) keep = false;
                        else w.to.p = mapped;
                    }
                    return keep;
                });
                setWires(nextWires);
            }
        }

        toggle() {
            this.props.Position = (this.props.Position === 'A') ? 'B' : 'A';
        }

        getActiveConnections() {
            const pos = this.props.Position === 'B' ? 'B' : 'A';
            if (this.props.Type === 'SPST') {
                return (pos === 'A') ? [[0, 1]] : [];
            }
            if (this.props.Type === 'SPDT') {
                const idx = (pos === 'A') ? 1 : 2;
                return [[0, idx]];
            }
            if (this.props.Type === 'DPDT') {
                const upper = (pos === 'A') ? 1 : 2;
                const lower = (pos === 'A') ? 4 : 5;
                return [
                    [0, upper],
                    [3, lower]
                ];
            }
            return [];
        }

        drawSwitch(ctx, filled = false) {
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#e5e7eb';
            if (filled) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
                ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
            }

            const drawPole = (comIdx, aIdx, bIdx) => {
                const com = this.pins[comIdx];
                const a = this.pins[aIdx];
                const b = this.pins[bIdx];
                if (!com || !a || !b) return;
                const lead = (com.x < a.x || com.x < b.x) ? 10 : -10;

                // fixed contacts
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(a.x - lead * 0.5, a.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(b.x, b.y);
                ctx.lineTo(b.x - lead * 0.5, b.y);
                ctx.stroke();

                // pads
                ctx.beginPath();
                ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
                ctx.stroke();

                // common stub
                ctx.beginPath();
                ctx.moveTo(com.x, com.y);
                ctx.lineTo(com.x + lead, com.y);
                ctx.stroke();

                const pos = (this.props.Position === 'B') ? 'B' : 'A';
                const target = (this.props.Type === 'SPST' && pos === 'B')
                    ? { x: com.x + lead + 8, y: com.y - 14 }
                    : (pos === 'A' ? a : b);

                ctx.beginPath();
                ctx.moveTo(com.x + lead, com.y);
                ctx.lineTo(target.x - (lead * 0.3), target.y + (pos === 'B' && this.props.Type === 'SPST' ? 0 : 0));
                ctx.stroke();
            };

            if (this.props.Type === 'DPDT') {
                drawPole(0, 1, 2);
                drawPole(3, 4, 5);
            } else if (this.props.Type === 'SPDT') {
                drawPole(0, 1, 2);
            } else {
                drawPole(0, 1, 1);
            }

            ctx.restore();
        }

        drawSym(ctx) { this.drawSwitch(ctx, false); }
        drawPhys(ctx) { this.drawSwitch(ctx, true); }

        drawLabels(ctx) {
            ctx.save();
            ctx.font = LABEL_FONT_SMALL;
            ctx.fillStyle = '#d1d5db';
            this.pinNames.forEach((name, idx) => {
                const dir = getPinDirection(this, idx) || { x: 0, y: 1 };
                const pos = offsetLabelFromPin(this, idx, LABEL_OUTSIDE_OFFSET, dir);
                ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name, pos.x, pos.y);
            });
            const center = getPinCenter(this);
            ctx.font = LABEL_FONT_BOLD;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(this.props.Type, center.x, center.y);
            ctx.restore();
        }
    };
}
