export default function createCapacitor({
    Component,
    getPinCenter,
    LABEL_GAP_MEDIUM,
    LABEL_FONT_MEDIUM
}) {
    return class Capacitor extends Component {
        setup() {
            this.pins = [{ x: -20, y: 0 }, { x: 20, y: 0 }];
            this.w = 40;
            this.h = 20;
            this.props = { C: '33n', Rleak: '100M' };
            this._lastV = 0; // voltage across C from previous step
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-4, 0);
            ctx.moveTo(4, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-4, -12, 2, 24);
            ctx.fillRect(2, -12, 2, 24);
        }

        drawPhys(ctx) {
            ctx.save();

            // Leads (silver metal).
            ctx.strokeStyle = '#d0d5dc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-12, 0);
            ctx.moveTo(12, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();

            // Ceramic disc — teal-blue body with a lighter highlight so it reads
            // as a rounded, slightly glossy dielectric.
            const discGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, 13);
            discGrad.addColorStop(0, '#3f6fb6');
            discGrad.addColorStop(0.6, '#1f3e7a');
            discGrad.addColorStop(1, '#0e2145');
            ctx.fillStyle = discGrad;
            ctx.strokeStyle = '#0a1a34';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Printed value in the middle of the disc.
            ctx.fillStyle = '#e5edfa';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(this.props.C || ''), 0, 0);

            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            const pos = { x: center.x, y: center.y - LABEL_GAP_MEDIUM };
            ctx.save();
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_MEDIUM;
            ctx.textAlign = 'center';
            ctx.fillText(this.props.C, pos.x, pos.y);
            ctx.restore();
        }
    };
}
