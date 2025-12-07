export default function createPotentiometer({
    Component,
    LABEL_FONT_MEDIUM,
    LABEL_FONT_SMALL,
    LABEL_GAP_MEDIUM,
    PIN_LABEL_DISTANCE,
    offsetLabelFromPin,
    getPinCenter
}) {
    return class Potentiometer extends Component {
        setup() {
            this.pins = [
                { x: -40, y: 20 },
                { x: 0, y: 20 }, // wiper
                { x: 40, y: 20 } // moved one step left
            ];
            this.w = 130;
            this.h = 110;
            this.props = { R: '100k', Turn: '50' }; // Turn = percent of rotation toward pin 3
        }

        getTurnFraction() {
            const raw = parseFloat(this.props.Turn || '50');
            if (!isFinite(raw)) return 0.5;
            return Math.min(1, Math.max(0, raw / 100));
        }

        drawSym(ctx) {
            const t = this.getTurnFraction();
            const yOff = 20;

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            // resistor body
            ctx.beginPath();
            ctx.moveTo(-50, yOff);
            ctx.lineTo(-30, yOff);
            [-22, -14, -6, 2, 10, 18, 26].forEach((x, i) => {
                ctx.lineTo(x, yOff + (i % 2 ? -8 : 8));
            });
            ctx.lineTo(34, yOff);
            ctx.lineTo(50, yOff);
            ctx.stroke();

            // straight horizontal legs to pins
            ctx.beginPath();
            ctx.moveTo(this.pins[0].x, this.pins[0].y);
            ctx.lineTo(-30, yOff);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.pins[2].x, this.pins[2].y);
            ctx.lineTo(34, yOff);
            ctx.stroke();

            // wiper arrow (position follows Turn)
            const trackStart = -22;
            const trackEnd = 26;
            const wx = trackStart + (trackEnd - trackStart) * t;
            const start = { x: wx + 16, y: yOff - 18 };
            const end = { x: wx, y: yOff + 10 };
            const ang = Math.atan2(end.y - start.y, end.x - start.x);

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            // rotated triangle arrowhead
            const headLen = 7;
            const baseHalf = 4;
            const tipX = end.x + Math.cos(ang) * headLen;
            const tipY = end.y + Math.sin(ang) * headLen;
            const bx1 = end.x + Math.cos(ang + Math.PI / 2) * baseHalf;
            const by1 = end.y + Math.sin(ang + Math.PI / 2) * baseHalf;
            const bx2 = end.x + Math.cos(ang - Math.PI / 2) * baseHalf;
            const by2 = end.y + Math.sin(ang - Math.PI / 2) * baseHalf;

            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(bx1, by1);
            ctx.lineTo(bx2, by2);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }

        drawPhys(ctx) {
            const t = this.getTurnFraction();
            const arcStart = Math.PI * 0.8;
            const arcEnd = arcStart + Math.PI * 1.4;
            const a = arcStart + (arcEnd - arcStart) * t;
            const yOff = 10;

            // outer base
            const outer = ctx.createRadialGradient(0, -6, 6, 0, 0, 34);
            outer.addColorStop(0, '#3b4254');
            outer.addColorStop(1, '#0b1220');
            ctx.fillStyle = outer;
            ctx.beginPath();
            ctx.arc(0, yOff, 32, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, yOff, 28, 0, Math.PI * 2);
            ctx.stroke();

            // resistive track
            ctx.strokeStyle = '#4b5563';
            ctx.lineWidth = 9;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, yOff, 18, arcStart, arcEnd);
            ctx.stroke();

            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, yOff, 18, arcStart, a + 0.001);
            ctx.stroke();

            // lead extensions to pins 1 and 3
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            const legY = this.pins[0].y;
            const leadAnchors = [
                { from: this.pins[0], to: { x: -22, y: legY } },
                { from: this.pins[2], to: { x: 22, y: legY } }
            ];
            leadAnchors.forEach((seg) => {
                ctx.beginPath();
                ctx.moveTo(seg.from.x, seg.from.y);
                ctx.lineTo(seg.to.x, seg.to.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(seg.to.x, seg.to.y, 2.6, 0, Math.PI * 2);
                ctx.fillStyle = '#e5e7eb';
                ctx.fill();
            });

            // wiper arm
            const innerR = 8;
            const tipR = 18;
            const sx = Math.cos(a) * innerR;
            const sy = Math.sin(a) * innerR + yOff;
            const tx = Math.cos(a) * tipR;
            const ty = Math.sin(a) * tipR + yOff;

            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
            ctx.stroke();

            ctx.fillStyle = '#e5e7eb';
            ctx.beginPath();
            ctx.arc(tx, ty, 4, 0, Math.PI * 2);
            ctx.fill();

            // center cap
            const cap = ctx.createLinearGradient(-8, -8, 12, 12);
            cap.addColorStop(0, '#1f2937');
            cap.addColorStop(1, '#111827');
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(0, yOff, 10, 0, Math.PI * 2);
            ctx.fill();
        }

        drawLabels(ctx, mode) {
            ctx.save();
            ctx.fillStyle = '#9ca3af';
            if (mode === 'schematic') {
                ctx.font = LABEL_FONT_MEDIUM;
                const center = getPinCenter(this);
                const labelY = center.y + LABEL_GAP_MEDIUM;
                const rPos = { x: center.x - 20, y: labelY };
                const pPos = { x: center.x + 20, y: labelY };
                ctx.textAlign = 'left';
                ctx.fillText(this.props.R, rPos.x, rPos.y);

                const pct = Math.round(this.getTurnFraction() * 100);
                ctx.textAlign = 'right';
                ctx.fillText(`${pct}%`, pPos.x, pPos.y);
            } else if (mode === 'physical') {
                ctx.font = LABEL_FONT_SMALL;
                ctx.textAlign = 'center';
                const labels = [
                    { idx: 0, text: '1' },
                    { idx: 1, text: '2' },
                    { idx: 2, text: '3' }
                ];
                labels.forEach((l) => {
                    const pos = offsetLabelFromPin(this, l.idx, PIN_LABEL_DISTANCE, { x: 0, y: 1 });
                    ctx.fillText(l.text, pos.x, pos.y);
                });
            }
            ctx.restore();
        }
    };
}
