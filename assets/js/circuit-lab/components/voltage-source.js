export default function createVoltageSource({ Component }) {
    return class VoltageSource extends Component {
        setup() {
            // pin0 = +, pin1 = -
            this.pins = [{ x: 0, y: -40 }, { x: 0, y: 40 }];
            this.w = 40;
            this.h = 90;
            this.props = { Vdc: '5' }; // renamed so we know it's DC
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            const plateOffset = 12; // vertical distance from center to outer plates
            const plateSpacing = (plateOffset * 2) / 3; // even spacing for 4 plates

            // vertical leads
            ctx.beginPath();
            ctx.moveTo(0, -40);
            ctx.lineTo(0, -plateOffset);
            ctx.moveTo(0, plateOffset);
            ctx.lineTo(0, 40);
            ctx.stroke();

            // four plates: long, short, long, short with tighter spacing
            const plateYs = Array.from({ length: 4 }, (_, i) => -plateOffset + plateSpacing * i);
            const plateHalfLong = 16;
            const plateHalfShort = 8;

            ctx.beginPath();
            ctx.moveTo(-plateHalfLong, plateYs[0]);
            ctx.lineTo(plateHalfLong, plateYs[0]); // long
            ctx.moveTo(-plateHalfShort, plateYs[1]);
            ctx.lineTo(plateHalfShort, plateYs[1]); // short
            ctx.moveTo(-plateHalfLong, plateYs[2]);
            ctx.lineTo(plateHalfLong, plateYs[2]); // long
            ctx.moveTo(-plateHalfShort, plateYs[3]);
            ctx.lineTo(plateHalfShort, plateYs[3]); // short
            ctx.stroke();
        }

        drawPhys(ctx) {
            const g = ctx.createLinearGradient(-18, 0, 18, 0);
            g.addColorStop(0, '#333333');
            g.addColorStop(1, '#111111');
            ctx.fillStyle = g;
            ctx.fillRect(-18, -35, 36, 70);

            ctx.fillStyle = '#ff0000';
            ctx.fillRect(-6, -40, 12, 6);
            ctx.fillStyle = '#000000';
            ctx.fillRect(-6, 34, 12, 6);
        }

        drawLabels(ctx, mode) {
            ctx.save();
            if (mode === 'schematic') {
                const pos = this.localToWorld(10, 0);
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '10px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`${this.props.Vdc} V`, pos.x, pos.y);
            } else if (mode === 'physical') {
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = 'bold 10px sans-serif';
                const dcPos = this.localToWorld(0, -8);
                ctx.fillText('DC', dcPos.x, dcPos.y);
                ctx.font = 'bold 11px monospace';
                const valPos = this.localToWorld(0, 12);
                ctx.fillText(`${this.props.Vdc} V`, valPos.x, valPos.y);
            }
            ctx.restore();
        }
    };
}
