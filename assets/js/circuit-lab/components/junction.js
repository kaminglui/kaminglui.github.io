export default function createJunction({ Component }) {
    return class Junction extends Component {
        setup() {
            this.pins = [{ x: 0, y: 0 }];
            this.w = 8;
            this.h = 8;
        }

        drawSym(ctx) { this.drawPhys(ctx); }

        drawPhys(ctx) {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}
