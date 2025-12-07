export default function createFunctionGenerator({
    Component,
    LABEL_FONT_SMALL,
    LABEL_GAP_SMALL
}) {
    return class FunctionGenerator extends Component {
        setup() {
            // 0: +, 1: COM, 2: -
            // Align body/pins to GRID like the scope so rotation stays centered
            this.body = { x1: -40, x2: 40, y1: -25, y2: 40 };
            const pinY = this.body.y2; // pins sit on bottom edge
            this.pins = [
                { x: -20, y: pinY }, // +
                { x: 0, y: pinY }, // COM
                { x: 20, y: pinY } // -
            ];
            this.w = 80;
            this.h = 80;

            this.props = {
                Vpp: '1', // peak-to-peak voltage
                Freq: '1k', // Hz
                Offset: '0', // DC offset
                Phase: '0', // degrees
                Wave: 'sine' // sine|square|triangle (sim: sine)
            };
        }

        getLocalBounds() {
            // tighter bounds so the selection outline hugs the enclosure and jacks
            return {
                x1: -50,
                x2: 50,
                y1: -35,
                y2: 50
            };
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            // rectangular body (aligned with physical footprint)
            ctx.strokeRect(this.body.x1, this.body.y1, this.body.x2 - this.body.x1, this.body.y2 - this.body.y1); // stop at jack row

            // centered waveform along the top edge
            ctx.save();
            ctx.translate(0, 0);
            this.drawWaveGlyph(ctx, this.props.Wave || 'sine');
            ctx.restore();
        }

        drawPhys(ctx) {
            const g = ctx.createLinearGradient(-40, 0, 40, 0);
            g.addColorStop(0, '#111827');
            g.addColorStop(1, '#1f2937');
            ctx.fillStyle = g;
            ctx.fillRect(this.body.x1, this.body.y1, this.body.x2 - this.body.x1, this.body.y2 - this.body.y1); // stop at jack row

            // centered wave glyph near the top
            ctx.save();
            ctx.translate(0, -5);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 1.5;
            this.drawWaveGlyph(ctx, this.props.Wave || 'sine');
            ctx.restore();

            // banana jack faces aligned to pins, sitting on bottom edge
            const pins = [
                { idx: 0, color: '#f97316' }, // +
                { idx: 1, color: '#e5e7eb' }, // COM
                { idx: 2, color: '#9ca3af' } // -
            ];

            const jackOffset = 0;
            pins.forEach((p) => {
                const pin = this.pins[p.idx];
                const x = pin.x;
                const y = pin.y + jackOffset;
                ctx.fillStyle = '#0b0f19';
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(x - 1, y, 2, 10); // colored leg, same treatment as scope
            });
        }

        drawLabels(ctx, mode) {
            ctx.save();
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'center';

            const labels = [
                { text: '+', idx: 0, color: '#f97316' },
                { text: 'COM', idx: 1, color: '#e5e7eb' },
                { text: '-', idx: 2, color: '#9ca3af' }
            ];
            const labelY = this.body.y2 - LABEL_GAP_SMALL;
            labels.forEach((l) => {
                const pin = this.pins[l.idx];
                const pos = this.localToWorld(pin.x, labelY - 8);
                ctx.fillStyle = l.color;
                ctx.fillText(l.text, pos.x, pos.y);
            });
            ctx.restore();
        }

        drawWaveGlyph(ctx, type) {
            const w = 18;
            const a = 8;
            const yOffset = 5;
            const wave = String(type || 'sine').toLowerCase();

            const drawSampled = (fn) => {
                const steps = 36;
                ctx.beginPath();
                for (let i = 0; i <= steps; i++) {
                    const t = -Math.PI + (2 * Math.PI * i) / steps; // one full period
                    const x = -w + (2 * w * i) / steps;
                    const y = -fn(t) * a + yOffset; // shifted down
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            };

            if (wave === 'square') {
                // square like the red marker: low segment, step up, long high, step down
                const yHigh = -a + yOffset;
                const yLow = a + yOffset;

                const x0 = -w * 0.5; // left vertical
                const x1 = -w * 0.0; // middle vertical
                const x2 = w * 0.5; // right vertical

                ctx.beginPath();
                ctx.moveTo(x0, yHigh - 1); // left, high
                ctx.lineTo(x0, yLow); // down
                ctx.lineTo(x1, yLow); // low segment
                ctx.lineTo(x1, yHigh); // step up
                ctx.lineTo(x2, yHigh); // long high segment
                ctx.lineTo(x2, yLow + 1); // step down
                ctx.stroke();
            } else if (wave === 'triangle') {
                // triangle(t) = 2/pi * asin(sin(t))
                drawSampled((t) => (2 / Math.PI) * Math.asin(Math.sin(t)));
            } else {
                // sine
                drawSampled((t) => Math.sin(t));
            }
        }
    };
}
