// Component base class used by every Circuit Lab palette item. Wrapped in a
// factory so the class can be constructed once per host with that host's
// board-grid snapping function and selection predicate — keeps the module
// free of circuit-lab globals while still letting subclasses get automatic
// pin-leg drawing and selection highlights.

const DEFAULTS = {
    pinLegLength: 20,
    pinHeadRadius: 2.2,
    selectionPadding: 6,
    selectionDash: [3, 2],
    pinHeadColor: '#e5e7eb',
    pinStrokeColor: '#9ca3af'
};

function createComponentBase({
    reserveComponentId,
    snapToBoardPoint,
    isSelected = () => false,
    getPinHeadColor = () => DEFAULTS.pinHeadColor,
    pinLegLength = DEFAULTS.pinLegLength,
    pinHeadRadius = DEFAULTS.pinHeadRadius,
    selectionPadding = DEFAULTS.selectionPadding,
    selectionDash = DEFAULTS.selectionDash
} = {}) {
    return class Component {
        constructor(x, y) {
            const kind = (this.constructor?.name || 'component').toLowerCase();
            this.id   = reserveComponentId(kind);
            this.kind = kind;
            const snap = snapToBoardPoint(x, y);
            this.x = snap.x;
            this.y = snap.y;
            this.w = 40;
            this.h = 40;
            this.rotation = 0;      // 0,1,2,3 => 0°/90°/180°/270°
            this.mirrorX = false;   // horizontal mirror
            this.pins = [];
            this.props = {};
            this.setup();
        }

        // Overridden by subclasses to declare pins, props, size, etc.
        setup() {}

        // Local pin position → world, accounting for rotation, mirror, and origin.
        // Pins snap to the nearest board hole so legs always land cleanly.
        getPinPos(i) {
            const p = this.pins[i];
            let px = p.x;
            let py = p.y;
            for (let r = 0; r < this.rotation; r += 1) {
                const tx = px;
                px = -py;
                py = tx;
            }
            if (this.mirrorX) px = -px;
            return snapToBoardPoint(this.x + px, this.y + py);
        }

        // Local → world without the board-hole snap, for label and body geometry.
        localToWorld(x, y) {
            let px = x;
            let py = y;
            for (let r = 0; r < this.rotation; r += 1) {
                const tx = px;
                px = -py;
                py = tx;
            }
            if (this.mirrorX) px = -px;
            return { x: this.x + px, y: this.y + py };
        }

        getLocalBounds() {
            return {
                x1: -this.w / 2,
                y1: -this.h / 2,
                x2:  this.w / 2,
                y2:  this.h / 2
            };
        }

        getBoundingBox() {
            const b = this.getLocalBounds();
            const corners = [
                this.localToWorld(b.x1, b.y1),
                this.localToWorld(b.x1, b.y2),
                this.localToWorld(b.x2, b.y1),
                this.localToWorld(b.x2, b.y2)
            ];
            let x1 =  Infinity;
            let y1 =  Infinity;
            let x2 = -Infinity;
            let y2 = -Infinity;
            corners.forEach((p) => {
                if (p.x < x1) x1 = p.x;
                if (p.y < y1) y1 = p.y;
                if (p.x > x2) x2 = p.x;
                if (p.y > y2) y2 = p.y;
            });
            return { x1, y1, x2, y2 };
        }

        isInside(mx, my) {
            const b = this.getBoundingBox();
            return (mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2);
        }

        shouldSkipDefaultPins() { return false; }

        draw(ctx, mode) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation * Math.PI / 2);
            if (this.mirrorX) ctx.scale(-1, 1);

            ctx.shadowColor   = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur    = 8;
            ctx.shadowOffsetY = 4;

            if (mode === 'schematic') this.drawSym(ctx);
            else                      this.drawPhys(ctx);

            ctx.restore();

            if (this.shouldSkipDefaultPins(mode)) return;

            ctx.strokeStyle = DEFAULTS.pinStrokeColor;
            ctx.lineWidth = 1;
            const pinHead = getPinHeadColor();
            this.pins.forEach((_, i) => {
                const pos = this.getPinPos(i);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x, pos.y + pinLegLength);
                ctx.stroke();

                ctx.fillStyle = pinHead;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, pinHeadRadius, 0, Math.PI * 2);
                ctx.fill();
            });

            // Selection glow — soft blue bloom plus a dashed rim so users know
            // which component(s) will be affected by Delete / Copy / rotate.
            if (isSelected(this)) {
                const b = this.getBoundingBox();
                const x = b.x1 - selectionPadding;
                const y = b.y1 - selectionPadding;
                const w = (b.x2 - b.x1) + selectionPadding * 2;
                const h = (b.y2 - b.y1) + selectionPadding * 2;
                ctx.save();
                ctx.shadowColor = 'rgba(96, 165, 250, 0.55)';
                ctx.shadowBlur = 14;
                ctx.fillStyle = 'rgba(96, 165, 250, 0.10)';
                ctx.fillRect(x, y, w, h);
                ctx.shadowBlur = 0;
                ctx.setLineDash(selectionDash);
                ctx.strokeStyle = '#60a5fa';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, w, h);
                ctx.restore();
            }
        }

        // Overridden by subclasses.
        drawSym() {}
        drawPhys(ctx) { this.drawSym(ctx); }
    };
}

export { createComponentBase };
