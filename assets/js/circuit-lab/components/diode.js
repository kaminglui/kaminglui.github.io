export default function createDiode({
    Component,
    getPinCenter,
    LABEL_GAP_SMALL,
    LABEL_FONT_SMALL
}) {
    return class Diode extends Component {
        setup() {
            this.pinNames = ['A', 'K'];
            this.pins = [
                { x: -20, y: 0 },
                { x: 20, y: 0 }
            ];
            this.w = 50;
            this.h = 24;
            this.props = { Vf: '0.7', If: '10m' };
            this._lastI = 0;
        }

        drawSym(ctx) {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Leads
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-10, 0);
            ctx.moveTo(10, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();

            // Triangle pointing at cathode
            ctx.beginPath();
            ctx.moveTo(-10, -9);
            ctx.lineTo(10, 0);
            ctx.lineTo(-10, 9);
            ctx.closePath();
            ctx.fill();

            // Cathode bar
            ctx.beginPath();
            ctx.moveTo(10, -11);
            ctx.lineTo(10, 11);
            ctx.stroke();
            ctx.restore();
        }

        drawPhys(ctx) {
            ctx.save();

            // Metal leads
            ctx.strokeStyle = '#d0d5dc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-12, 0);
            ctx.moveTo(12, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();

            // Glass/plastic body with a slight gradient so it reads as cylindrical.
            const g = ctx.createLinearGradient(0, -6, 0, 6);
            g.addColorStop(0, '#1f1f1f');
            g.addColorStop(0.5, '#0c0c0c');
            g.addColorStop(1, '#1a1a1a');
            ctx.fillStyle = g;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(-12, -6, 24, 12, 3);
            else ctx.rect(-12, -6, 24, 12);
            ctx.fill();
            ctx.stroke();

            // Cathode stripe (white band near the cathode end).
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(7, -6, 3, 12);
            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            ctx.save();
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'center';
            ctx.fillText(`${this.props.Vf}V`, center.x, center.y - LABEL_GAP_SMALL);
            ctx.restore();
        }
    };
}
