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
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(-24, 0);
            [-18, -12, -6, 0, 6, 12, 18].forEach((x, i) => {
                ctx.lineTo(x, (i % 2 ? -8 : 8));
            });
            ctx.lineTo(24, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();
            ctx.restore();
        }

        drawPhys(ctx) {
            ctx.save();
            // Metal leads.
            ctx.strokeStyle = '#d0d5dc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(-22, 0);
            ctx.moveTo(22, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();

            // Ceramic body — beige with rounded end caps instead of hard rectangle.
            const g = ctx.createLinearGradient(0, -7, 0, 7);
            g.addColorStop(0, '#ecd4a8');
            g.addColorStop(0.5, '#d8bc85');
            g.addColorStop(1, '#b39965');
            ctx.fillStyle = g;
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(-22, -7, 44, 14, 3);
            else ctx.rect(-22, -7, 44, 14);
            ctx.fill();
            ctx.stroke();

            // Color bands for the resistance value.
            const bands = getResColor(this.props.R, this.props.Tolerance);
            bands.forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.fillRect(-17 + i * 8, -7, 3.5, 14);
            });
            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            const center = getPinCenter(this);
            const pos = { x: center.x, y: center.y - LABEL_GAP_SMALL };
            ctx.save();
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_MEDIUM;
            ctx.textAlign = 'center';
            ctx.fillText(this.props.R, pos.x, pos.y);
            ctx.restore();
        }
    };
}
