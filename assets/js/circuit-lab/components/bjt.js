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
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 2;

            // IEEE-style enclosing circle gives the symbol a cleaner visual anchor.
            ctx.beginPath();
            ctx.arc(6, 0, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Base lead + vertical body bar.
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-6, 0);
            ctx.moveTo(-6, -12);
            ctx.lineTo(-6, 12);
            ctx.stroke();

            // Collector and emitter leads. Clip so they fit inside the circle.
            ctx.beginPath();
            ctx.moveTo(-6, -4);
            ctx.lineTo(20, -20);
            ctx.moveTo(-6, 4);
            ctx.lineTo(20, 20);
            ctx.stroke();

            // Emitter arrow — points AWAY from base for NPN, TOWARDS base for PNP.
            const head = 6;
            const emitterDir = { x: 20 - (-6), y: 20 - 4 };
            const len = Math.hypot(emitterDir.x, emitterDir.y) || 1;
            const ux = emitterDir.x / len;
            const uy = emitterDir.y / len;
            // Tip roughly 1/3 along emitter lead for readability.
            const tip = isPnp
                ? { x: -6 + ux * 6,  y: 4 + uy * 6 }
                : { x: -6 + ux * 18, y: 4 + uy * 18 };
            const dir = isPnp ? -1 : 1;
            const baseMid = { x: tip.x - ux * head * dir, y: tip.y - uy * head * dir };
            const px = -uy;
            const py = ux;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(baseMid.x + px * head * 0.45, baseMid.y + py * head * 0.45);
            ctx.lineTo(baseMid.x - px * head * 0.45, baseMid.y - py * head * 0.45);
            ctx.closePath();
            ctx.fill();
        }

        drawPhys(ctx) {
            // TO-92 through-hole package: black plastic half-moon with 3 leads
            // coming out the bottom. We render it rotated to match the left-side
            // base pin of the schematic — body on the right, leads on the left.
            ctx.save();

            // Three metal leads fanning out from the flat side of the package.
            ctx.strokeStyle = '#d0d5dc';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-6, 0);
            ctx.moveTo(20, -20);
            ctx.lineTo(6, -8);
            ctx.moveTo(20, 20);
            ctx.lineTo(6, 8);
            ctx.stroke();

            // Package body — black plastic, slightly offset gradient for subtle depth.
            const g = ctx.createLinearGradient(-10, -12, 14, 12);
            g.addColorStop(0, '#2a2a2a');
            g.addColorStop(1, '#0f0f0f');
            ctx.fillStyle = g;
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;

            // Half-moon: circle on the right, flat edge on the left.
            ctx.beginPath();
            ctx.moveTo(-4, -14);
            ctx.lineTo(8, -14);
            ctx.arc(8, 0, 14, -Math.PI / 2, Math.PI / 2, false);
            ctx.lineTo(-4, 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Tiny imprint text so the package reads as a discrete part.
            ctx.fillStyle = '#9ca3af';
            ctx.font = 'bold 6px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(this.props.Type || 'NPN'), 6, 0);
            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            ctx.save();
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'left';
            const worldLabel = this.localToWorld(24, -4);
            ctx.fillText(`${this.props.Type} · β=${this.props.Beta}`, worldLabel.x, worldLabel.y);
            ctx.restore();
        }
    };
}
