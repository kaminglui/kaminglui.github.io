export default function createOscilloscope({
    Component,
    HISTORY_SIZE,
    parseUnit,
    getSimState
}) {
    return class Oscilloscope extends Component {
        setup() {
            // 0: CH1, 1: CH2, 2: GND
            this.pins = [
                { x: -40, y: 40 },
                { x: 0, y: 40 },
                { x: 40, y: 40 }
            ];
            this.w = 100;
            this.h = 80;

            this.data = {
                ch1: new Float32Array(HISTORY_SIZE),
                ch2: new Float32Array(HISTORY_SIZE)
            };
            this.head = 0;
            this.sampleAccum = 0;
            this._lastNodes = { n1: null, n2: null, nG: null };
            this.props = {
                TimeDiv: '1m', // 1 ms / div (10 divs total on screen)
                VDiv1: '1', // volts / div CH1
                VDiv2: '1' // volts / div CH2
            };
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-50, -40, 100, 80);

            // screen window (slightly inset)
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-42, -30, 84, 52);
        }

        drawPhys(ctx) {
            ctx.fillStyle = '#222222';
            ctx.fillRect(-50, -40, 100, 80);

            // screen bezel + mini live preview
            const screen = { x: -44, y: -32, w: 88, h: 56 };
            ctx.fillStyle = '#000000';
            ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
            ctx.strokeStyle = '#333333';
            ctx.strokeRect(screen.x, screen.y, screen.w, screen.h);

            ctx.save();
            ctx.beginPath();
            ctx.rect(screen.x, screen.y, screen.w, screen.h);
            ctx.clip();

            // grid
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i < 10; i++) {
                const gx = screen.x + (screen.w / 10) * i;
                const gy = screen.y + (screen.h / 10) * i;
                ctx.moveTo(gx, screen.y);
                ctx.lineTo(gx, screen.y + screen.h);
                ctx.moveTo(screen.x, gy);
                ctx.lineTo(screen.x + screen.w, gy);
            }
            ctx.stroke();

            const startIdx = (this.head + 1) % HISTORY_SIZE;
            const pixelsPerDiv = screen.h / 10;
            const vDiv1 = parseUnit(this.props.VDiv1 || '1') || 1;
            const vDiv2 = parseUnit(this.props.VDiv2 || vDiv1) || 1;
            const scale1 = pixelsPerDiv / vDiv1;
            const scale2 = pixelsPerDiv / vDiv2;

            const renderPreview = (data, color, scale) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let px = 0; px <= screen.w; px++) {
                    const t = px / screen.w;
                    const idx = (startIdx + Math.floor(t * HISTORY_SIZE)) % HISTORY_SIZE;
                    const v = data[idx];
                    const y = screen.y + screen.h / 2 - v * scale;
                    const x = screen.x + px;
                    if (px === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            };

            renderPreview(this.data.ch1, '#fbbf24', scale1);
            renderPreview(this.data.ch2, '#22d3ee', scale2);
            ctx.restore();

            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(-30, 25, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(0, 25, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#9ca3af';
            ctx.beginPath();
            ctx.arc(30, 25, 3, 0, Math.PI * 2);
            ctx.fill();

            const jacks = [
                { x: this.pins[0].x, color: '#fbbf24' },
                { x: this.pins[1].x, color: '#22d3ee' },
                { x: this.pins[2].x, color: '#9ca3af' }
            ];

            jacks.forEach((j) => {
                ctx.fillStyle = '#0b0f19';
                ctx.beginPath();
                ctx.arc(j.x, 40, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = j.color;
                ctx.beginPath();
                ctx.arc(j.x, 40, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(j.x - 1, 40, 2, 10);
            });

            const { isPaused, simError, time } = getSimState();
            // status LED
            const ledOK = !isPaused && !simError;
            const pulse = ledOK ? (1 + Math.sin(time * 5000)) * 0.5 : 0;
            const ledR = 4 + (ledOK ? pulse * 2 : 0);
            const ledColor = ledOK ? 'rgba(52,211,153,0.9)' : 'rgba(239,68,68,0.9)';
            ctx.save();
            ctx.shadowColor = ledColor;
            ctx.shadowBlur = ledOK ? 12 + pulse * 6 : 6;
            ctx.fillStyle = ledColor;
            ctx.beginPath();
            ctx.arc(48, 30, ledR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        drawLabels(ctx, mode) {
            if (mode !== 'schematic') return;

            ctx.save();
            ctx.font = '10px monospace';
            const labels = [
                { text: '1', x: -37, y: 33, color: '#fbbf24' },
                { text: '2', x: 0, y: 33, color: '#22d3ee' },
                { text: 'G', x: 37, y: 33, color: '#9ca3af' }
            ];
            labels.forEach((l) => {
                const pos = this.localToWorld(l.x, l.y);
                ctx.fillStyle = l.color;
                ctx.textAlign = 'center';
                ctx.fillText(l.text, pos.x, pos.y);
            });
            ctx.restore();
        }
    };
}
