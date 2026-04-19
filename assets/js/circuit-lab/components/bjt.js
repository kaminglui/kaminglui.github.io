export default function createBJT({
    Component,
    LABEL_FONT_MEDIUM,
    LABEL_FONT_SMALL,
    LABEL_GAP_MEDIUM
}) {
    return class BJT extends Component {
        setup() {
            // Base, Collector (top), Emitter (bottom)
            this.pinNames = ['B', 'C', 'E'];
            this.pins = [
                { x: -20, y: 0 },  // 0: Base
                { x: 20, y: -20 }, // 1: Collector (top right)
                { x: 20, y: 20 }   // 2: Emitter (bottom right)
            ];
            this.w = 50;
            this.h = 70;
            this.props = {
                Type: 'NPN',
                Beta: '100',
                VbeOn: '0.7',
                VceSat: '0.2',
                Rbe: '1k'
            };
        }

        drawSym(ctx) {
            const isPnp = String(this.props.Type || 'NPN').toUpperCase() === 'PNP';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            // Base lead
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-6, 0);
            ctx.stroke();

            // Vertical body bar
            ctx.beginPath();
            ctx.moveTo(-6, -12);
            ctx.lineTo(-6, 12);
            ctx.stroke();

            // Collector diagonal up-right
            ctx.beginPath();
            ctx.moveTo(-6, -4);
            ctx.lineTo(20, -20);
            ctx.stroke();
            // Emitter diagonal down-right
            ctx.beginPath();
            ctx.moveTo(-6, 4);
            ctx.lineTo(20, 20);
            ctx.stroke();

            // Emitter arrow: points OUT for NPN, IN for PNP.
            const ax = 8;
            const ay = isPnp ? 8 : 12;
            const bx = isPnp ? 4 : 14;
            const by = isPnp ? 4 : 16;
            const cx = isPnp ? 0 : 10;
            const cy = isPnp ? 8 : 20;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.lineTo(cx, cy);
            ctx.closePath();
            ctx.fill();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            ctx.save();
            ctx.fillStyle = '#aaa';
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'left';
            const worldLabel = this.localToWorld(24, -4);
            ctx.fillText(`${this.props.Type} · β=${this.props.Beta}`, worldLabel.x, worldLabel.y);
            ctx.restore();
        }
    };
}
