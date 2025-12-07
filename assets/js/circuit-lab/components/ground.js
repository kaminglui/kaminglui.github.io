export default function createGround({ Component }) {
    return class Ground extends Component {
        setup() {
            this.pins = [{ x: 0, y: -20 }];
            this.w = 30;
            this.h = 40;
        }

        drawSym(ctx) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(0, -20);
            ctx.lineTo(0, 0);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-15, 0);
            ctx.lineTo(15, 0);
            ctx.moveTo(-10, 5);
            ctx.lineTo(10, 5);
            ctx.moveTo(-5, 10);
            ctx.lineTo(5, 10);
            ctx.stroke();
        }

        drawPhys(ctx) { this.drawSym(ctx); }
    };
}
