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
            this.props = { C: '33n' };
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
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();

            ctx.fillStyle = '#1e3a8a';
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#cccccc';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            const pos = { x: center.x, y: center.y - LABEL_GAP_MEDIUM };
            ctx.save();
            ctx.fillStyle = '#aaa';
            ctx.font = LABEL_FONT_MEDIUM;
            ctx.textAlign = 'center';
            ctx.fillText(this.props.C, pos.x, pos.y);
            ctx.restore();
        }
    };
}
