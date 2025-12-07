export default function createMOSFET({
    Component,
    PIN_HEAD_RADIUS,
    LABEL_FONT_SMALL,
    LABEL_GAP_SMALL,
    LABEL_OUTSIDE_OFFSET,
    LABEL_FONT_MOSFET_TYPE,
    parseUnit,
    formatUnit,
    getPinCenter
}) {
    return class MOSFET extends Component {
        setup() {
            // Gate, Drain (top), Source (bottom), Body
            this.pins = [
                { x: -20, y: 0 }, // 0: Gate
                { x: 20, y: -20 }, // 1: Drain (top right)
                { x: 20, y: 20 }, // 2: Source (bottom right)
                { x: 20, y: 0 } // 3: Body (right-center)
            ];
            this.w = 50;
            this.h = 70;

            this.props = {
                Type: 'NMOS',
                W: '1u',
                L: '1u',
                Kp: '140u', // µA/V^2
                Vth: '0.7',
                Lambda: '0.1',
                Gamma: '0.45',
                Phi: '0.9'
            };

            this._lastVg = this._lastVd = this._lastVs = this._lastVb = 0;
        }

        shouldSkipDefaultPins(mode) {
            return mode === 'physical';
        }

        drawSym(ctx) {
            const isP = (this.props.Type === 'PMOS');

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            const gateLeadX = -20;
            const gateX = -5;
            const channelX = 2;
            const tapX = 20;
            const dY = -20;
            const bY = 0;
            const sY = 20;

            ctx.beginPath();
            // gate lead + plate
            ctx.moveTo(gateLeadX, 0);
            ctx.lineTo(gateX, 0);
            ctx.moveTo(gateX, -21);
            ctx.lineTo(gateX, 21);

            // channel (vertical stack) centered between gate and pins
            ctx.moveTo(channelX, -21);
            ctx.lineTo(channelX, 21);

            // drain (top right, pin 1)
            ctx.moveTo(channelX, dY);
            ctx.lineTo(tapX, dY);
            ctx.lineTo(tapX, dY - 4);
            // body (right mid, pin 3)
            ctx.moveTo(channelX, bY);
            ctx.lineTo(tapX, bY);
            // source (bottom right, pin 2)
            ctx.moveTo(channelX, sY);
            ctx.lineTo(tapX, sY);
            ctx.lineTo(tapX, sY + 4);
            ctx.stroke();

            // PMOS gate bubble to distinguish from NMOS
            if (isP) {
                ctx.beginPath();
                ctx.lineWidth = 1.5;
                ctx.arc(gateX - 2, 0, 2.5, 0, Math.PI * 2);
                ctx.stroke();
            }

            // source arrow: head sits near the channel, direction flips for P/N
            ctx.beginPath();
            const arrowHeadX = channelX + 2;
            const arrowTailX = tapX - 2;
            const dir = isP ? -1 : 1; // +1: arrow points right (NMOS), -1: points left (PMOS)
            ctx.moveTo(arrowHeadX, sY);
            ctx.lineTo(arrowTailX, sY);
            ctx.stroke();

            const ah = 4;
            ctx.beginPath();
            ctx.moveTo(arrowHeadX, sY);
            ctx.lineTo(arrowHeadX - dir * ah, sY - 3);
            ctx.moveTo(arrowHeadX, sY);
            ctx.lineTo(arrowHeadX - dir * ah, sY + 3);
            ctx.stroke();
        }

        drawPhys(ctx) {
            // package body
            const bw = 40;
            const bh = 40;
            ctx.fillStyle = '#111827';
            ctx.strokeStyle = '#4b5563';
            ctx.lineWidth = 1.5;
            ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
            ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

            // legs (G left, D top-right, S bottom-right, B mid-right)
            const legs = [
                { x: -20, y: 0, label: 'G' },
                { x: 20, y: -20, label: 'D' },
                { x: 20, y: 20, label: 'S' },
                { x: 20, y: 0, label: 'B' }
            ];

            legs.forEach((leg) => {
                const len = 8;

                ctx.fillStyle = '#bbbbbb';
                if (Math.abs(leg.x) >= Math.abs(leg.y)) {
                    // horizontal leg (left / right)
                    const x0 = (leg.x > 0) ? (leg.x - len) : leg.x;
                    ctx.fillRect(x0, leg.y - 1.5, len, 3);
                } else {
                    // vertical leg (just in case we ever add one)
                    const y0 = (leg.y > 0) ? (leg.y - len) : leg.y;
                    ctx.fillRect(leg.x - 1.5, y0, 3, len);
                }

                // pin head at the hole position
                ctx.fillStyle = '#e5e7eb';
                ctx.beginPath();
                ctx.arc(leg.x, leg.y, PIN_HEAD_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        drawLabels(ctx, mode) {
            ctx.save();

            // pin tags (both views)
            const tags = ['G', 'D', 'S', 'B'];
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_SMALL;
            const center = getPinCenter(this);
            tags.forEach((label, i) => {
                const pos = this.getPinPos(i);
                const dx = pos.x - center.x;
                const dy = pos.y - center.y;
                const vertical = Math.abs(dy) >= Math.abs(dx);
                if (vertical) {
                    ctx.textAlign = 'center';
                    const yOff = dy > 0 ? LABEL_GAP_SMALL : -LABEL_GAP_SMALL;
                    ctx.fillText(label, pos.x, pos.y + yOff);
                } else {
                    const isLeft = dx < 0;
                    ctx.textAlign = isLeft ? 'right' : 'left';
                    const xOff = isLeft ? -LABEL_GAP_SMALL : LABEL_GAP_SMALL;
                    ctx.fillText(label, pos.x + xOff, pos.y + LABEL_GAP_SMALL * 0.5);
                }
            });

            const type = (this.props.Type === 'PMOS') ? 'P' : 'N';
            const box = this.getBoundingBox();
            const boxCenter = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
            const wlPosWorld = { x: boxCenter.x, y: box.y2 + LABEL_OUTSIDE_OFFSET };
            if (mode === 'physical') {
                const Wm = parseUnit(this.props.W || '1u');
                const Lm = parseUnit(this.props.L || '1u');

                const Wstr = formatUnit(Wm, 'm');
                const Lstr = formatUnit(Lm, 'm');

                const typePos = { x: boxCenter.x, y: boxCenter.y + 3 }; // tuck slightly below center

                ctx.fillStyle = '#e5e7eb';
                ctx.font = LABEL_FONT_MOSFET_TYPE;
                ctx.textAlign = 'center';
                ctx.fillText(type, typePos.x, typePos.y);
                ctx.textAlign = 'center';
                ctx.font = LABEL_FONT_SMALL;
                ctx.fillText(`W=${Wstr}  L=${Lstr}`, wlPosWorld.x, wlPosWorld.y);
            } else if (mode === 'schematic') {
                const Wm = parseUnit(this.props.W || '1u');
                const Lm = parseUnit(this.props.L || '1u');
                const Wstr = formatUnit(Wm, 'm');
                const Lstr = formatUnit(Lm, 'm');
                const labelPos = { x: boxCenter.x, y: box.y2 + LABEL_OUTSIDE_OFFSET };
                ctx.fillStyle = '#e5e7eb';
                ctx.font = LABEL_FONT_SMALL;
                ctx.textAlign = 'center';
                ctx.fillText(`W=${Wstr}  L=${Lstr}`, labelPos.x, labelPos.y);
            }

            ctx.restore();
        }
    };
}
