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
                            { x: 30, y: 0 }  // B
                        ],
                        // Tall body gives the SPST lever room to swing up when
                        // opened without colliding with labels or nearby parts.
                        w: 80,
                        h: 64
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
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (filled) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
                ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
                ctx.fillStyle = '#ffffff';
            }

            const pos = (this.props.Position === 'B') ? 'B' : 'A';
            const isSpst = this.props.Type === 'SPST';

            // Draw one "pole" (common + two throws). For SPST we pass the same
            // pin as both throws and draw only one contact, but the lever still
            // rotates up off that contact when open — giving the same "lifts off"
            // affordance users expect from a schematic switch.
            const drawPole = (comIdx, aIdx, bIdx) => {
                const com = this.pins[comIdx];
                const a = this.pins[aIdx];
                const b = this.pins[bIdx];
                if (!com || !a || !b) return;
                const lead = (com.x < a.x || com.x < b.x) ? 10 : -10;
                const dir = Math.sign(lead) || 1;
                const pivot = { x: com.x + lead, y: com.y };
                const padA = { x: a.x - lead * 0.5, y: a.y };
                const padB = { x: b.x - lead * 0.5, y: b.y };

                // Contact stubs (short spurs from the outer pin toward the centre).
                ctx.strokeStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(padA.x, padA.y);
                if (!isSpst) {
                    ctx.moveTo(b.x, b.y);
                    ctx.lineTo(padB.x, padB.y);
                }
                // Common lead stub, pin → pivot.
                ctx.moveTo(com.x, com.y);
                ctx.lineTo(pivot.x, pivot.y);
                ctx.stroke();

                // Contact pads — filled dots so they clearly read as fixed terminals.
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(padA.x, padA.y, 3, 0, Math.PI * 2);
                ctx.fill();
                if (!isSpst) {
                    ctx.beginPath();
                    ctx.arc(padB.x, padB.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Pivot (ring around the common-end of the lever).
                ctx.beginPath();
                ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
                ctx.stroke();

                // Lever geometry. When closed, the lever lies flat against the
                // selected contact; when an SPST is open, it rotates ~32° up from
                // its closed angle (toward pin A) so the gap is visible.
                const closedTarget = (pos === 'A') ? padA : padB;
                const vx = closedTarget.x - pivot.x;
                const vy = closedTarget.y - pivot.y;
                const leverLen = Math.hypot(vx, vy) || 1;
                const closedAngle = Math.atan2(vy, vx);

                let tip;
                if (isSpst && pos === 'B') {
                    // Rotate the lever upward (CCW when reading left-to-right,
                    // CW when pivot is on the right-hand side).
                    const openAngle = closedAngle - (Math.PI * 32 / 180) * dir;
                    tip = {
                        x: pivot.x + leverLen * Math.cos(openAngle),
                        y: pivot.y + leverLen * Math.sin(openAngle)
                    };
                } else {
                    // Closed lever stops just short of the pad so the pad ring
                    // stays visible underneath.
                    tip = {
                        x: pivot.x + (leverLen - 3) * Math.cos(closedAngle),
                        y: pivot.y + (leverLen - 3) * Math.sin(closedAngle)
                    };
                }

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(pivot.x, pivot.y);
                ctx.lineTo(tip.x, tip.y);
                ctx.stroke();

                // Handle bead — filled for closed (connected), outlined for open.
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(tip.x, tip.y, 2.4, 0, Math.PI * 2);
                if (isSpst && pos === 'B') {
                    ctx.fillStyle = '#0f172a';
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                }
                ctx.lineWidth = 2;
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
            ctx.fillStyle = '#9ca3af';
            this.pinNames.forEach((name, idx) => {
                const dir = getPinDirection(this, idx) || { x: 0, y: 1 };
                const pos = offsetLabelFromPin(this, idx, LABEL_OUTSIDE_OFFSET, dir);
                ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name, pos.x, pos.y);
            });
            // Position the type label below the lever swing so SPST's open-state
            // lever never collides with it.
            const center = getPinCenter(this);
            ctx.font = LABEL_FONT_BOLD;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#9ca3af';
            const labelY = this.props.Type === 'SPST' ? center.y + 22 : center.y;
            ctx.fillText(this.props.Type, center.x, labelY);
            ctx.restore();
        }
    };
}
