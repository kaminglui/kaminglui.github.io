export default function createCurrentSource({ Component }) {
    return class CurrentSource extends Component {
        setup() {
            // Pin 0 is the arrowhead (current OUT), pin 1 is the tail (current IN).
            this.pinNames = ['+', '−'];
            this.pins = [{ x: 0, y: -40 }, { x: 0, y: 40 }];
            this.w = 40;
            this.h = 90;
            this.props = { Idc: '1m' };
        }

        drawSym(ctx) {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Top and bottom leads
            ctx.beginPath();
            ctx.moveTo(0, -40);
            ctx.lineTo(0, -16);
            ctx.moveTo(0, 16);
            ctx.lineTo(0, 40);
            ctx.stroke();

            // Circle
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
            ctx.stroke();

            // Arrow pointing up (toward pin 0, "+")
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, 10);
            ctx.lineTo(0, -6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(-4, -2);
            ctx.lineTo(4, -2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        drawPhys(ctx) {
            ctx.save();
            // Cylindrical package — dark body with a bright top cap to match the
            // voltage source vocabulary but with a different cue (vertical band).
            const g = ctx.createLinearGradient(-18, 0, 18, 0);
            g.addColorStop(0, '#2a2a2a');
            g.addColorStop(1, '#101010');
            ctx.fillStyle = g;
            ctx.fillRect(-18, -35, 36, 70);

            // Bright stripe down the centre reading as "constant current"
            ctx.fillStyle = '#60a5fa';
            ctx.fillRect(-2, -30, 4, 60);

            // Top/bottom end caps so it still reads as a two-terminal part
            ctx.fillStyle = '#d0d5dc';
            ctx.fillRect(-6, -40, 12, 6);
            ctx.fillRect(-6, 34, 12, 6);
            ctx.restore();
        }

        drawLabels(ctx, mode) {
            ctx.save();
            if (mode === 'schematic') {
                const pos = this.localToWorld(22, 0);
                ctx.fillStyle = '#9ca3af';
                ctx.font = '10px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${this.props.Idc}A`, pos.x, pos.y);
            } else if (mode === 'physical') {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const idPos = this.localToWorld(0, -8);
                ctx.fillText('I', idPos.x, idPos.y);
                ctx.font = 'bold 10px monospace';
                const valPos = this.localToWorld(0, 12);
                ctx.fillText(`${this.props.Idc}A`, valPos.x, valPos.y);
            }
            ctx.restore();
        }
    };
}
