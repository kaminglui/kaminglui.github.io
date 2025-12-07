export default function createLED({ Component, parseUnit }) {
    function getLEDColor(name, lastI = 0, IfStr = '10m') {
        const palette = {
            red: [255, 95, 70],
            green: [90, 255, 150],
            blue: [90, 160, 255],
            white: [240, 240, 240]
        };
        const key = String(name || 'red').toLowerCase();
        const base = palette[key] || palette.red;
        const If = parseUnit(IfStr || '10m') || 0.01;
        const forwardI = Math.max(0, lastI);
        const norm = Math.max(0, Math.min(1, forwardI / If));
        const offScale = 0.18;
        const onScale = 0.95;
        const scale = offScale + (onScale - offScale) * norm;
        const rayScale = 0.2 + 0.8 * norm;

        const body = `rgb(${Math.round(base[0] * scale)}, ${Math.round(base[1] * scale)}, ${Math.round(base[2] * scale)})`;
        const glow = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${0.6 * norm})`;
        const sym = `rgb(${Math.round(base[0] * rayScale)}, ${Math.round(base[1] * rayScale)}, ${Math.round(base[2] * rayScale)})`;
        return { body, glow, sym, norm };
    }

    return class LED extends Component {
        setup() {
            // Anode (left), Cathode (right)
            this.pins = [
                { x: -20, y: 0 }, // 0: Anode
                { x: 20, y: 0 } // 1: Cathode
            ];
            this.w = 50;
            this.h = 30;

            // Vf and "ideal" bright current
            this.props = {
                Vf: '3.3', // volts
                If: '10m', // amps
                Color: 'red' // red|green|blue|white
            };

            this._lastI = 0; // last simulated current (A)
        }

        drawSym(ctx) {
            const col = getLEDColor(this.props.Color, this._lastI, this.props.If);
            const norm = col.norm;

            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = 'rgba(255,255,255,0.06)';

            // leads
            ctx.beginPath();
            ctx.moveTo(-28, 0);
            ctx.lineTo(-12, 0);
            ctx.moveTo(10, 0);
            ctx.lineTo(26, 0);
            ctx.stroke();

            // diode body (white, with flat cathode side)
            ctx.beginPath();
            ctx.moveTo(-12, -10);
            ctx.lineTo(6, 0);
            ctx.lineTo(-12, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // cathode bar for polarity cue
            ctx.beginPath();
            ctx.moveTo(8, -12);
            ctx.lineTo(8, 12);
            ctx.stroke();

            // colored emission arrows above/left; keep positions, flip heads outward
            this.drawLightRays(ctx, col, norm, { length: 12, glow: true, headFacing: 'away' });
            ctx.restore();
        }

        drawPhys(ctx) {
            const col = getLEDColor(this.props.Color, this._lastI, this.props.If);
            const norm = col.norm;

            // disable the default drop shadow so the LED body stays transparent on the board
            ctx.shadowColor = 'rgba(0,0,0,0)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            const R = 11;
            const start = Math.PI / 6; // 30 deg
            const end = Math.PI * 11 / 6; // 330 deg
            const flatX = R * Math.cos(start);

            // diode lens with subtle flat on cathode side
            ctx.save();
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 16 * norm;
            ctx.beginPath();
            ctx.arc(0, 0, R, start, end, false);
            ctx.lineTo(R * Math.cos(start), R * Math.sin(start));
            ctx.closePath();
            ctx.fillStyle = col.body; // single-color lens
            ctx.strokeStyle = col.body;
            ctx.lineWidth = 1.1; // thinner outline
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // leads touching the lens edges
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-R - 2, 0);
            ctx.lineTo(-26, 0);
            ctx.moveTo(flatX, 0);
            ctx.lineTo(26, 0);
            ctx.stroke();
        }

        drawLightRays(ctx, col, norm, opts = {}) {
            const offsetX = opts.offsetX ?? -15;
            const offsetY = opts.offsetY ?? -15;
            const length = opts.length ?? 16;
            const headFacing = opts.headFacing || 'along';

            ctx.save();
            ctx.strokeStyle = col.sym;
            ctx.fillStyle = col.sym;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'miter';
            ctx.globalAlpha = 0.35 + 0.65 * norm;

            if (opts.glow && norm > 0.01) {
                ctx.shadowColor = col.glow;
                ctx.shadowBlur = 10 + 10 * norm;
            }

            const rays = opts.rays || [
                { x1: offsetX, y1: offsetY, angle: -Math.PI / 4 },
                { x1: offsetX + 10, y1: offsetY, angle: -Math.PI / 4 },
                { x1: offsetX + 20, y1: offsetY, angle: -Math.PI / 4 }
            ];

            rays.forEach((r) => {
                const x2 = r.x1 + Math.cos(r.angle) * length;
                const y2 = r.y1 + Math.sin(r.angle) * length;

                // keep your existing semantics: 'away' uses r.angle, 'along' flips it
                const headAngle = (headFacing === 'along')
                    ? r.angle + Math.PI
                    : r.angle;

                // shaft
                ctx.beginPath();
                ctx.moveTo(r.x1, r.y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                // === sharp triangular head ===
                const headLen = 5; // how long the arrowhead is
                const baseHalf = headLen * 0.45; // half-width of the base (narrow = sharper)

                // tip of the triangle, pointing along headAngle
                const tipX = x2 + Math.cos(headAngle) * headLen;
                const tipY = y2 + Math.sin(headAngle) * headLen;

                // base center is at the end of the shaft (x2, y2)
                // base corners are perpendicular to headAngle
                const bx1 = x2 + Math.cos(headAngle + Math.PI / 2) * baseHalf;
                const by1 = y2 + Math.sin(headAngle + Math.PI / 2) * baseHalf;
                const bx2 = x2 + Math.cos(headAngle - Math.PI / 2) * baseHalf;
                const by2 = y2 + Math.sin(headAngle - Math.PI / 2) * baseHalf;

                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(bx1, by1);
                ctx.lineTo(bx2, by2);
                ctx.closePath();
                ctx.fill(); // solid triangle
                ctx.stroke(); // crisp outline
            });

            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;
            ctx.save();
            ctx.font = '8px monospace';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            const pos = this.localToWorld(0, -14);
            ctx.fillText('LED', pos.x, pos.y);
            ctx.restore();
        }
    };
}
