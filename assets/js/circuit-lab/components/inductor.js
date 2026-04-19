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
            // Axial wire-wound inductor: metal leads + a cylindrical core with
            // coiled copper wire visible as densely packed loops.
            ctx.save();

            // Leads
            ctx.strokeStyle = '#d0d5dc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-40, 0);
            ctx.lineTo(-24, 0);
            ctx.moveTo(24, 0);
            ctx.lineTo(40, 0);
            ctx.stroke();

            // Core body — dark grey ferrite with a subtle vertical gradient.
            const coreGrad = ctx.createLinearGradient(0, -10, 0, 10);
            coreGrad.addColorStop(0, '#3b3b3b');
            coreGrad.addColorStop(0.5, '#242424');
            coreGrad.addColorStop(1, '#111');
            ctx.fillStyle = coreGrad;
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(-24, -10, 48, 20, 4) : ctx.rect(-24, -10, 48, 20);
            ctx.fill();
            ctx.stroke();

            // Copper winding — tightly spaced slanted lines to read as a coil.
            ctx.strokeStyle = '#d7883a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let x = -22; x <= 22; x += 3) {
                ctx.moveTo(x, -9);
                ctx.lineTo(x + 2, 9);
            }
            ctx.stroke();

            // Small highlight stripe along the top to suggest a cylindrical body.
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-22, -7);
            ctx.lineTo(22, -7);
            ctx.stroke();

            ctx.restore();
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
