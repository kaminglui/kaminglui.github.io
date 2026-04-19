export default function createInductor({
    Component,
    getPinCenter,
    LABEL_GAP_MEDIUM,
    LABEL_FONT_MEDIUM
}) {
    return class Inductor extends Component {
        setup() {
            this.pins = [{ x: -40, y: 0 }, { x: 40, y: 0 }];
            this.w = 90;
            this.h = 20;
            this.props = { L: '1m', DCR: '0' };
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            // Four coil humps between the leads.
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(-24, 0);
            const humps = 4;
            const span = 48; // total width spanned by the coils
            const step = span / humps;
            const radius = step / 2;
            let x = -24;
            for (let i = 0; i < humps; i += 1) {
                ctx.arc(x + radius, 0, radius, Math.PI, 0, false);
                x += step;
            }
            ctx.moveTo(24, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();
        }

        drawPhys(ctx) {
            ctx.strokeStyle = '#c9a96e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();

            ctx.fillStyle = '#1f2937';
            ctx.fillRect(-22, -8, 44, 16);
            ctx.strokeStyle = '#c9a96e';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 5; i += 1) {
                const x = -18 + i * 9;
                ctx.beginPath();
                ctx.moveTo(x, -8);
                ctx.lineTo(x, 8);
                ctx.stroke();
            }
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            const pos = { x: center.x, y: center.y - LABEL_GAP_MEDIUM };
            ctx.save();
            ctx.fillStyle = '#aaa';
            ctx.font = LABEL_FONT_MEDIUM;
            ctx.textAlign = 'center';
            ctx.fillText(this.props.L + 'H', pos.x, pos.y);
            ctx.restore();
        }
    };
}
