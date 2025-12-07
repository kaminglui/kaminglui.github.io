export default function createLF412({
    Component,
    LABEL_FONT_BOLD,
    LABEL_FONT_SMALL,
    getPinCenter,
    getPinDirection,
    offsetLabelFromPin,
    LABEL_OUTSIDE_OFFSET
}) {
    return class LF412 extends Component {
        setup() {
            this.pinNames = ['1OUT', '1IN-', '1IN+', 'VCC-', '2IN+', '2IN-', '2OUT', 'VCC+'];
            this.pins = [
                { x: -40, y: -40 }, // 1OUT (pin 1)
                { x: -40, y: -20 }, // 1IN-
                { x: -40, y: 20 }, // 1IN+
                { x: -40, y: 40 }, // VCC-
                { x: 40, y: 40 }, // 2IN+
                { x: 40, y: 20 }, // 2IN-
                { x: 40, y: -20 }, // 2OUT
                { x: 40, y: -40 } // VCC+
            ];
            this.w = 80;
            this.h = 100;
            this.props = {};
        }

        drawPackage(ctx, filled = false, bodyFill = null) {
            const body = { x: -40, y: -50, w: 80, h: 100 };
            ctx.save();
            ctx.lineWidth = 2;
            ctx.fillStyle = bodyFill || (filled ? '#111827' : '#0b0f19');
            ctx.strokeStyle = '#ffffff';
            ctx.fillRect(body.x, body.y, body.w, body.h);
            ctx.strokeRect(body.x, body.y, body.w, body.h);

            const notchW = 28;
            const notchDepth = 8;
            const topY = body.y;
            ctx.fillStyle = filled ? '#0f172a' : '#020617';
            ctx.beginPath();
            ctx.moveTo(-notchW / 2, topY);
            ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
            ctx.lineTo(notchW / 2, topY - 2);
            ctx.lineTo(-notchW / 2, topY - 2);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(-notchW / 2, topY);
            ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#60a5fa';
            this.pins.forEach((p) => {
                const edgeX = p.x < 0 ? body.x : body.x + body.w;
                ctx.beginPath();
                ctx.moveTo(edgeX, p.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        drawSym(ctx) { this.drawPackage(ctx, false); }
        drawPhys(ctx) {
            const g = ctx.createLinearGradient(-40, 0, 40, 0);
            g.addColorStop(0, '#222222');
            g.addColorStop(1, '#000000');
            this.drawPackage(ctx, true, g);
        }

        drawLabels(ctx) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            const center = getPinCenter(this);
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_BOLD;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LF412', center.x, center.y);

            ctx.font = LABEL_FONT_SMALL;
            ctx.fillStyle = '#d1d5db';
            this.pinNames.forEach((label, idx) => {
                const dir = getPinDirection(this, idx) || { x: 0, y: 1 };
                const pos = offsetLabelFromPin(this, idx, LABEL_OUTSIDE_OFFSET, dir);
                ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
                ctx.fillText(label, pos.x, pos.y);
            });

            ctx.restore();
        }
    };
}
