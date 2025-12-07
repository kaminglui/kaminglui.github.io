export default function createResistor({
    Component,
    getResColor,
    getPinCenter,
    LABEL_GAP_SMALL,
    LABEL_FONT_MEDIUM
}) {
    return class Resistor extends Component {
        setup() {
            this.pins = [{ x: -40, y: 0 }, { x: 40, y: 0 }];
            this.w = 90;
            this.h = 16;
            this.props = { R: '10k', Tolerance: '5' };
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(-24, 0);
            [-18, -12, -6, 0, 6, 12, 18].forEach((x, i) => {
                ctx.lineTo(x, (i % 2 ? -8 : 8));
            });
            ctx.lineTo(24, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();
        }

        drawPhys(ctx) {
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();

            const g = ctx.createLinearGradient(0, -7, 0, 7);
            g.addColorStop(0, '#e8cfa1');
            g.addColorStop(1, '#cbb286');
            ctx.fillStyle = g;
            ctx.fillRect(-22, -7, 44, 14);

            const bands = getResColor(this.props.R, this.props.Tolerance);
            bands.forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.fillRect(-18 + i * 8, -7, 4, 14);
            });
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            const pos = { x: center.x, y: center.y - LABEL_GAP_SMALL };
            ctx.save();
            ctx.fillStyle = '#aaa';
            ctx.font = LABEL_FONT_MEDIUM;
            ctx.textAlign = 'center';
            ctx.fillText(this.props.R, pos.x, pos.y);
            ctx.restore();
        }
    };
}
