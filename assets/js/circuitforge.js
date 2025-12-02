/* === CONFIG === */
// Grid + time-step config
const GRID         = 20;    // breadboard hole spacing (world units)
const DT           = 1e-7;  // 0.1 µs
const SUB_STEPS    = 200;   // 20 µs per frame
const HISTORY_SIZE = 1200;  // samples in scope history

// UI / interaction constants
const PIN_HIT_RADIUS        = GRID * 0.4;
const PIN_LEG_LENGTH        = GRID * 0.3;
const PIN_HEAD_RADIUS       = 2.2;
const GRID_HOLE_RADIUS      = 1.6;
const WIRE_HIT_DISTANCE     = 12;
const WIRE_WIDTH_SELECTED   = 6;
const WIRE_WIDTH_HOVER      = 3.2;
const WIRE_WIDTH_DEFAULT    = 2.2;
const WIRE_OUTLINE_PADDING  = 2;
const WIRE_CORNER_RADIUS    = 2;
const WIRE_DASH_PATTERN     = [4, 4];
const ACTIVE_WIRE_WIDTH     = 1.5;
const MARQUEE_DASH_PATTERN  = [5, 3];
const SELECTION_DASH_PATTERN= [4, 4];
const SELECTION_PADDING     = 4;
const DRAG_THRESHOLD        = 4;
const SAVE_SCHEMA_ID        = 'circuitforge-state';
const SAVE_SCHEMA_VERSION   = 1;
const LOCAL_STORAGE_KEY     = 'circuitforge-save';
const AUTOSAVE_DELAY_MS     = 450;
const ZOOM_IN_STEP          = 1.1;
const ZOOM_OUT_STEP         = 0.9;
const DEFAULT_SCOPE_WINDOW_POS = { x: 24, y: 24 };
const EDITABLE_TAGS         = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const LABEL_FONT_SMALL      = '8px monospace';
const LABEL_FONT_MEDIUM     = '10px monospace';
const LABEL_FONT_BOLD       = 'bold 11px monospace';
const LABEL_FONT_MOSFET_TYPE= 'bold 13px monospace';
const LABEL_FONT_LARGE      = '12px monospace';
const LABEL_GAP_SMALL       = 6;
const LABEL_GAP_MEDIUM      = 10;
const LABEL_OUTSIDE_OFFSET  = 14;
const PIN_LABEL_OFFSET      = 24;
const PIN_LABEL_DISTANCE    = 16;
const CENTER_LABEL_DISTANCE = 12;

let boardBgColor = '#020617';
let gridHoleColor = '#1f2937';
let canvasBgColor = '#1a1a1a';

// View / zoom
let zoom     = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const BOARD_W     = 3000; // world units (~150 grid cells)
const BOARD_H     = 2000;
const BOARD_MARGIN= 200;  // empty border

// Simulation state
let components = [];
let wires      = [];
let time       = 0;
let isPaused   = true;
let simError   = null;

let selectedComponent = null;
let selectedWire      = null;
let selectionGroup    = [];
let currentTool       = null;
let viewMode          = 'physical';
let scopeMode         = false;
let draggingComponent = null;
let draggingWire      = null; // { wire, start: {x,y}, verts: [...] }
let wireDragMoved     = false;
let wireDragStart     = null;
let viewOffsetX       = 0;
let viewOffsetY       = 0;
let isPanning         = false;
let clickCandidate    = null;
let clickStart        = null;

// NEW: wiring state
let activeWire = null;   // { fromPin: {c,p}, vertices: [{x,y},...], toPin?:{c,p} }
let hoverWire  = null;
let selectionBox = null; // {start:{x,y}, current:{x,y}}
let activeScopeComponent = null;
let dragListenersAttached = false;
let scopeDisplayMode = null; // 'window' | 'fullscreen'
let scopeWindowPos = { ...DEFAULT_SCOPE_WINDOW_POS };
let scopeDragOffset = { x: 0, y: 0 };
let isDraggingScope = false;
let autosaveTimer = null;
let isRestoringState = false;

// Canvas handles (set after DOM exists)
let canvas = null;
let ctx = null;
let scopeCanvas = null;
let scopeCtx = null;
let initRan = false;

/* === UTILITIES === */
function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / zoom - viewOffsetX,
        y: (clientY - rect.top)  / zoom - viewOffsetY
    };
}

function snapToGrid(v) {
    return Math.round(v / GRID) * GRID;
}

function clampView() {
    const maxX = BOARD_MARGIN;
    const minX = -(BOARD_W + BOARD_MARGIN * 2 - canvas.width / zoom);
    const maxY = BOARD_MARGIN;
    const minY = -(BOARD_H + BOARD_MARGIN * 2 - canvas.height / zoom);
    viewOffsetX = Math.min(maxX, Math.max(minX, viewOffsetX));
    viewOffsetY = Math.min(maxY, Math.max(minY, viewOffsetY));
}

function getPinCenter(comp) {
    if (!comp || !comp.pins || !comp.pins.length) {
        return { x: comp?.x || 0, y: comp?.y || 0 };
    }
    let sx = 0;
    let sy = 0;
    comp.pins.forEach((_, i) => {
        const pos = comp.getPinPos(i);
        sx += pos.x;
        sy += pos.y;
    });
    return { x: sx / comp.pins.length, y: sy / comp.pins.length };
}

function offsetLabelFromPin(comp, pinIdx, distance = PIN_LABEL_DISTANCE, fallbackDir = { x: 0, y: 1 }) {
    const center = getPinCenter(comp);
    const pinPos = comp.getPinPos(pinIdx);
    let dx = pinPos.x - center.x;
    let dy = pinPos.y - center.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6 && fallbackDir) {
        dx = fallbackDir.x;
        dy = fallbackDir.y;
        len = Math.hypot(dx, dy) || 1;
    }
    const nx = dx / len;
    const ny = dy / len;
    return { x: pinPos.x + nx * distance, y: pinPos.y + ny * distance };
}

function isEditableElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return EDITABLE_TAGS.has(tag) || el.isContentEditable;
}

function worldToLocal(comp, x, y) {
    let px = x - comp.x;
    let py = y - comp.y;
    if (comp.mirrorX) px = -px;
    for (let r = comp.rotation; r > 0; r--) {
        const tx = px;
        px = py;
        py = -tx;
    }
    return { x: px, y: py };
}

// Snap a point to the nearest breadboard hole center
function snapToBoardPoint(x, y) {
    return {
        x: snapToGrid(x - GRID / 2) + GRID / 2,
        y: snapToGrid(y - GRID / 2) + GRID / 2
    };
}

// "10k", "33n", "0.5" -> number
function parseUnit(str) {
    if (!str) return 0;
    str = String(str).trim();
    const m = str.match(/^(-?[\d.]+)\s*([a-zA-Zµμ]*)$/);
    if (!m) return parseFloat(str) || 0;

    let v = parseFloat(m[1]);
    let s = m[2];

    switch (s) {
        case 'p': v *= 1e-12; break;
        case 'n': v *= 1e-9;  break;
        case 'u':
        case 'µ':
        case 'μ': v *= 1e-6;  break;
        case 'm': v *= 1e-3;  break;
        case 'k': v *= 1e3;   break;
        case 'M': v *= 1e6;   break;
        case 'G': v *= 1e9;   break;
    }
    return v;
}

function formatUnit(num, unit = '') {
    if (!isFinite(num)) return '0' + unit;
    const a = Math.abs(num);
    if (a === 0)         return '0' + unit;
    if (a < 1e-9)        return (num * 1e12).toFixed(2) + 'p' + unit;
    if (a < 1e-6)        return (num * 1e9 ).toFixed(2) + 'n' + unit;
    if (a < 1e-3)        return (num * 1e6 ).toFixed(2) + 'µ' + unit;
    if (a < 1)           return (num * 1e3 ).toFixed(2) + 'm' + unit;
    if (a >= 1e6)        return (num / 1e6).toFixed(2) + 'M' + unit;
    if (a >= 1e3)        return (num / 1e3).toFixed(2) + 'k' + unit;
    return num.toFixed(2) + unit;
}

// Resistor color code bands: returns array of 4 CSS colors
function getResColor(val, tol) {
    const colors = ['#000000', '#8B4513', '#FF0000', '#FFA500',
                    '#FFFF00', '#00FF00', '#0000FF', '#EE82EE',
                    '#808080', '#FFFFFF'];

    let ohms = parseUnit(val);
    if (!isFinite(ohms) || ohms <= 0) ohms = 1000; // fallback 1k

    let mag  = Math.floor(Math.log10(ohms));
    let base = ohms / Math.pow(10, mag);
    if (base < 1) { base *= 10; mag--; }

    let dv  = Math.round(base * 10);
    let d1  = Math.floor(dv / 10);
    let d2  = dv % 10;
    let mult = mag - 1;

    d1 = Math.max(0, Math.min(9, d1));
    d2 = Math.max(0, Math.min(9, d2));

    const bands = [colors[d1], colors[d2]];

    // multiplier band
    let multColor = '#000000';
    if (mult >= 0 && mult <= 9) multColor = colors[mult];
    else if (mult === -1) multColor = '#FFD700'; // gold
    else if (mult === -2) multColor = '#C0C0C0'; // silver
    bands.push(multColor);

    // tolerance band
    const t = parseFloat(tol);
    let tolColor = '#d4af37'; // default ~5%
    if (t === 1)  tolColor = '#8B4513';
    if (t === 2)  tolColor = '#FF0000';
    if (t === 10) tolColor = '#C0C0C0';
    bands.push(tolColor);

    return bands;
}


/* === MATRIX SOLVER (for MNA) === */
class Matrix {
    constructor(n) {
        this.n    = n;
        this.data = new Float64Array(n * n);
    }
    get(r, c) {
        return this.data[r * this.n + c];
    }
    add(r, c, v) {
        if (r < 0 || c < 0) return;
        if (r >= this.n || c >= this.n) return;
        this.data[r * this.n + c] += v;
    }
    // Simple Gaussian elimination with partial pivoting
    solve(rhs) {
        const n = this.n;
        const a = this.data;
        const b = rhs.slice(); // copy
        const x = new Float64Array(n);
        const EPS = 1e-12;
        let singular = false;

        for (let i = 0; i < n; i++) {
            // pivot
            let maxRow = i;
            let maxVal = Math.abs(a[i * n + i]);
            for (let r = i + 1; r < n; r++) {
                const v = Math.abs(a[r * n + i]);
                if (v > maxVal) { maxVal = v; maxRow = r; }
            }
            if (maxRow !== i) {
                for (let c = i; c < n; c++) {
                    const idx1 = i * n + c;
                    const idx2 = maxRow * n + c;
                    const tmp  = a[idx1];
                    a[idx1] = a[idx2];
                    a[idx2] = tmp;
                }
                const tb = b[i]; b[i] = b[maxRow]; b[maxRow] = tb;
            }

            const pivot = a[i * n + i];
            if (Math.abs(pivot) < EPS) {
                singular = true;
                break;
            }

            // eliminate
            for (let r = i + 1; r < n; r++) {
                const factor = a[r * n + i] / pivot;
                if (!factor) continue;
                a[r * n + i] = 0;
                for (let c = i + 1; c < n; c++) {
                    a[r * n + c] -= factor * a[i * n + c];
                }
                b[r] -= factor * b[i];
            }
        }

        if (singular) {
            return { x, singular: true };
        }

        // back substitution
        for (let i = n - 1; i >= 0; i--) {
            let sum = 0;
            for (let c = i + 1; c < n; c++) {
                sum += a[i * n + c] * x[c];
            }
            const pivot = a[i * n + i];
            x[i] = (Math.abs(pivot) < EPS) ? 0 : (b[i] - sum) / pivot;
            if (!isFinite(x[i])) x[i] = 0;
        }
        return { x, singular: false };
    }
}

/* === BASE COMPONENT CLASS === */

class Component {
    constructor(x, y) {
        this.id   = Math.random().toString(36).slice(2);
        // align component origin to grid centers so pin legs land in holes
        const snap = snapToBoardPoint(x, y);
        this.x    = snap.x;
        this.y    = snap.y;
        this.w    = 40;
        this.h    = 40;
        this.rotation = 0;   // 0,1,2,3 => 0,90,180,270 deg
        this.mirrorX  = false; // NEW: horizontal mirror
        this.pins = [];      // local pin coords
        this.props = {};     // editable properties
        this.setup();
    }

    // overridden in subclasses: define pins, props, etc.
    setup() {}

    // Local pin position -> world (account for rotation + origin)
    getPinPos(i) {
        const p = this.pins[i];
        let px = p.x, py = p.y;
        for (let r = 0; r < this.rotation; r++) {
            const tx = px;
            px = -py;
            py = tx;
        }
        if (this.mirrorX) px = -px; // mirror over Y-axis
        const wx = this.x + px;
        const wy = this.y + py;
        // Snap pin to nearest hole
        const sn = snapToBoardPoint(wx, wy);
        return sn;
    }

    // Convert a local coordinate (before rotation/mirroring) to world space without snapping
    localToWorld(x, y) {
        let px = x, py = y;
        for (let r = 0; r < this.rotation; r++) {
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

        let x1 =  Infinity, y1 =  Infinity;
        let x2 = -Infinity, y2 = -Infinity;
        corners.forEach(p => {
            x1 = Math.min(x1, p.x);
            y1 = Math.min(y1, p.y);
            x2 = Math.max(x2, p.x);
            y2 = Math.max(y2, p.y);
        });
        return { x1, y1, x2, y2 };
    }

    // Axis-aligned hit test in world space
    isInside(mx, my) {
        const b = this.getBoundingBox();
        return (mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2);
    }

    draw(ctx, mode) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 2);
        if (this.mirrorX) ctx.scale(-1, 1);  // NEW: mirror

        ctx.shadowColor   = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur    = 8;
        ctx.shadowOffsetY = 4;

        if (mode === 'schematic') this.drawSym(ctx);
        else                      this.drawPhys(ctx);

        ctx.restore();

        // MOSFET in physical view draws its own pins/legs
        const skipDefaultPins = (this instanceof MOSFET && mode === 'physical');
        if (skipDefaultPins) return;

        // draw pin legs + dots that sit in the holes
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth   = 1;

        this.pins.forEach((p, i) => {
            const pos = this.getPinPos(i);
            // short leg (one “hole” below the head)
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x, pos.y + PIN_LEG_LENGTH);
            ctx.stroke();

            // pin head (exactly over hole)
            ctx.fillStyle = '#e5e7eb';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, PIN_HEAD_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });

        // selection box for single or group
        const isSel = selectionGroup.includes(this);
        if (isSel) {
            const b = this.getBoundingBox();
            ctx.save();
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth   = 1;
            ctx.strokeRect(
                b.x1 - SELECTION_PADDING,
                b.y1 - SELECTION_PADDING,
                (b.x2 - b.x1) + SELECTION_PADDING * 2,
                (b.y2 - b.y1) + SELECTION_PADDING * 2
            );
            ctx.restore();
        }
    }

    // default drawing (overridden)
    drawSym(ctx) {}
    drawPhys(ctx) { this.drawSym(ctx); }
}

/* === PASSIVE COMPONENTS === */

class Resistor extends Component {
    setup() {
        this.pins = [{ x: -40, y: 0 }, { x: 40, y: 0 }];
        this.w = 90;
        this.h = 16;
        this.props = { R: '10k', Tol: '5' };
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(-24, 0);
        [-18,-12,-6,0,6,12,18].forEach((x, i) => {
            ctx.lineTo(x, (i % 2 ? -8 : 8));
        });
        ctx.lineTo(24, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
    }

    drawPhys(ctx) {
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();

        const g = ctx.createLinearGradient(0, -7, 0, 7);
        g.addColorStop(0, '#e8cfa1');
        g.addColorStop(1, '#cbb286');
        ctx.fillStyle = g;
        ctx.fillRect(-22, -7, 44, 14);

        const bands = getResColor(this.props.R, this.props.Tol);
        bands.forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.fillRect(-18 + i * 8, -7, 4, 14);
        });
    }

    drawLabels(ctx, mode) {
        if (mode !== 'schematic') return;
        const center = getPinCenter(this);
        const pos = { x: center.x, y: center.y - LABEL_GAP_SMALL };
        ctx.save();
        ctx.fillStyle = '#aaa';
        ctx.font = LABEL_FONT_MEDIUM;
        ctx.textAlign = 'center';
        ctx.fillText(this.props.R, pos.x, pos.y);
        ctx.restore();
    }
}

class Potentiometer extends Component {
    setup() {
        this.pins = [
            { x: -40, y: 20 },
            { x:   0, y: 20 }, // wiper
            { x:  40, y: 20 }  // moved one step left
        ];
        this.w = 130;
        this.h = 110;
        this.props = { R: '100k', Turn: '50' }; // Turn = percent of rotation toward pin 3
    }

    getTurnFraction() {
        const raw = parseFloat(this.props.Turn || '50');
        if (!isFinite(raw)) return 0.5;
        return Math.min(1, Math.max(0, raw / 100));
    }

    drawSym(ctx) {
        const t = this.getTurnFraction();
        const yOff = 20;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;

        // resistor body
        ctx.beginPath();
        ctx.moveTo(-50, yOff);
        ctx.lineTo(-30, yOff);
        [-22, -14, -6, 2, 10, 18, 26].forEach((x, i) => {
            ctx.lineTo(x, yOff + (i % 2 ? -8 : 8));
        });
        ctx.lineTo(34, yOff);
        ctx.lineTo(50, yOff);
        ctx.stroke();

        // straight horizontal legs to pins
        ctx.beginPath();
        ctx.moveTo(this.pins[0].x, this.pins[0].y);
        ctx.lineTo(-30, yOff);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.pins[2].x, this.pins[2].y);
        ctx.lineTo(34, yOff);
        ctx.stroke();

        // wiper arrow (position follows Turn)
        const trackStart = -22;
        const trackEnd   = 26;
        const wx = trackStart + (trackEnd - trackStart) * t;
        const start = { x: wx + 16, y: yOff - 18 };
        const end   = { x: wx,      y: yOff + 10 };
        const ang   = Math.atan2(end.y - start.y, end.x - start.x);

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // rotated triangle arrowhead
        const headLen = 7;
        const baseHalf= 4;
        const tipX = end.x + Math.cos(ang) * headLen;
        const tipY = end.y + Math.sin(ang) * headLen;
        const bx1  = end.x + Math.cos(ang + Math.PI / 2) * baseHalf;
        const by1  = end.y + Math.sin(ang + Math.PI / 2) * baseHalf;
        const bx2  = end.x + Math.cos(ang - Math.PI / 2) * baseHalf;
        const by2  = end.y + Math.sin(ang - Math.PI / 2) * baseHalf;

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(bx1, by1);
        ctx.lineTo(bx2, by2);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    drawPhys(ctx) {
        const t = this.getTurnFraction();
        const arcStart = Math.PI * 0.8;
        const arcEnd   = arcStart + Math.PI * 1.4;
        const a = arcStart + (arcEnd - arcStart) * t;
        const yOff = 10;

        // outer base
        const outer = ctx.createRadialGradient(0, -6, 6, 0, 0, 34);
        outer.addColorStop(0, '#3b4254');
        outer.addColorStop(1, '#0b1220');
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(0, yOff, 32, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, yOff, 28, 0, Math.PI * 2);
        ctx.stroke();

        // resistive track
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, yOff, 18, arcStart, arcEnd);
        ctx.stroke();

        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, yOff, 18, arcStart, a + 0.001);
        ctx.stroke();

        // lead extensions to pins 1 and 3
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        const legY = this.pins[0].y;
        const leadAnchors = [
            { from: this.pins[0], to: { x: -22, y: legY } },
            { from: this.pins[2], to: { x:  22, y: legY } }
        ];
        leadAnchors.forEach(seg => {
            ctx.beginPath();
            ctx.moveTo(seg.from.x, seg.from.y);
            ctx.lineTo(seg.to.x,   seg.to.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(seg.to.x, seg.to.y, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = '#e5e7eb';
            ctx.fill();
        });

        // wiper arm
        const innerR = 8;
        const tipR   = 18;
        const sx = Math.cos(a) * innerR;
        const sy = Math.sin(a) * innerR + yOff;
        const tx = Math.cos(a) * tipR;
        const ty = Math.sin(a) * tipR + yOff;

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.fillStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();

        // center cap
        const cap = ctx.createLinearGradient(-8, -8, 12, 12);
        cap.addColorStop(0, '#1f2937');
        cap.addColorStop(1, '#111827');
        ctx.fillStyle = cap;
        ctx.beginPath();
        ctx.arc(0, yOff, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    drawLabels(ctx, mode) {
        ctx.save();
        ctx.fillStyle = '#9ca3af';
        if (mode === 'schematic') {
            ctx.font = LABEL_FONT_MEDIUM;
            const center = getPinCenter(this);
            const labelY = center.y + LABEL_GAP_MEDIUM;
            const rPos = { x: center.x - 20, y: labelY };
            const pPos = { x: center.x + 20, y: labelY };
            ctx.textAlign = 'left';
            ctx.fillText(this.props.R, rPos.x, rPos.y);

            const pct = Math.round(this.getTurnFraction() * 100);
            ctx.textAlign = 'right';
            ctx.fillText(pct + '%', pPos.x, pPos.y);
        } else if (mode === 'physical') {
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'center';
            const labels = [
                { idx: 0, text: '1' },
                { idx: 1, text: '2' },
                { idx: 2, text: '3' }
            ];
            labels.forEach(l => {
                const pos = offsetLabelFromPin(this, l.idx, PIN_LABEL_DISTANCE, { x: 0, y: 1 });
                ctx.fillText(l.text, pos.x, pos.y);
            });
        }
        ctx.restore();
    }
}

class Capacitor extends Component {
    setup() {
        this.pins = [{ x: -20, y: 0 }, { x: 20, y: 0 }];
        this.w = 40;
        this.h = 20;
        this.props = { C: '33n' };
        this._lastV = 0; // voltage across C from previous step
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-4, 0);
        ctx.moveTo(4, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -12, 2, 24);
        ctx.fillRect(2, -12, 2, 24);

    }

    drawPhys(ctx) {
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();

        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#cccccc';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    drawLabels(ctx, mode) {
        if (mode !== 'schematic') return;
        const center = getPinCenter(this);
        const pos = { x: center.x, y: center.y - LABEL_GAP_MEDIUM };
        ctx.save();
        ctx.fillStyle = '#aaa';
        ctx.font = LABEL_FONT_MEDIUM;
        ctx.textAlign = 'center';
        ctx.fillText(this.props.C, pos.x, pos.y);
        ctx.restore();
    }
}

class LED extends Component {
    setup() {
        // Anode (left), Cathode (right)
        this.pins = [
            { x: -20, y: 0 },  // 0: Anode
            { x:  20, y: 0 }   // 1: Cathode
        ];
        this.w = 50;
        this.h = 30;

        // Vf and "ideal" bright current
        this.props = {
            Vf: '3.3',   // volts
            If: '10m',   // amps
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
        ctx.moveTo(-28, 0); ctx.lineTo(-12, 0);
        ctx.moveTo( 10, 0); ctx.lineTo( 26, 0);
        ctx.stroke();

        // diode body (white, with flat cathode side)
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo( 6,   0);
        ctx.lineTo(-12,  10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // cathode bar for polarity cue
        ctx.beginPath();
        ctx.moveTo(8, -12); ctx.lineTo(8, 12);
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
        const start = Math.PI / 6;      // 30 deg
        const end   = Math.PI * 11 / 6; // 330 deg
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
        ctx.moveTo(-R - 2, 0); ctx.lineTo(-26, 0);
        ctx.moveTo(flatX, 0);  ctx.lineTo(26, 0);
        ctx.stroke();
    }

    drawLightRays(ctx, col, norm, opts = {}) {
        const offsetX    = opts.offsetX ?? -15;
        const offsetY    = opts.offsetY ?? -15;
        const length     = opts.length  ?? 16;
        const headFacing = opts.headFacing || 'along';

        ctx.save();
        ctx.strokeStyle = col.sym;
        ctx.fillStyle   = col.sym;
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'miter';
        ctx.globalAlpha = 0.35 + 0.65 * norm;

        if (opts.glow && norm > 0.01) {
            ctx.shadowColor = col.glow;
            ctx.shadowBlur  = 10 + 10 * norm;
        }

        const rays = opts.rays || [
            { x1: offsetX,      y1: offsetY, angle: -Math.PI / 4 },
            { x1: offsetX + 10, y1: offsetY, angle: -Math.PI / 4 },
            { x1: offsetX + 20, y1: offsetY, angle: -Math.PI / 4 }
        ];

        rays.forEach(r => {
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
            const headLen  = 5;           // how long the arrowhead is
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
            ctx.fill();   // solid triangle
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
}

class SPSTSwitch extends Component {
    setup() {
        this.pins = [{ x: -30, y: 0 }, { x: 30, y: 0 }];
        this.w = 80;
        this.h = 30;
        this.props = { Closed: false };
    }

    toggle() { this.props.Closed = !this.props.Closed; markStateDirty(); }

    drawSym(ctx) {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-10, 0);
        const lift = this.props.Closed ? 0 : -10;
        ctx.moveTo(10, lift);
        ctx.lineTo(30, lift);
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, lift);
        ctx.stroke();
    }
}

class SPDTSwitch extends Component {
    setup() {
        this.pins = [
            { x: -30, y: 0 }, // COM
            { x: 30, y: -15 }, // A
            { x: 30, y: 15 }   // B
        ];
        this.w = 80;
        this.h = 50;
        this.props = { Position: 'A' };
    }

    toggle() {
        this.props.Position = (this.props.Position === 'A') ? 'B' : 'A';
        markStateDirty();
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-10, 0);
        const toY = (this.props.Position === 'A') ? -15 : 15;
        ctx.lineTo(10, toY);
        ctx.lineTo(30, toY);
        ctx.moveTo(30, -15); ctx.lineTo(40, -15);
        ctx.moveTo(30,  15); ctx.lineTo(40,  15);
        ctx.stroke();
    }
}

class DPDT extends Component {
    setup() {
        this.pins = [
            { x: -30, y: -20 }, // COM1
            { x: 30,  y: -35 }, // A1
            { x: 30,  y: -5  }, // B1
            { x: -30, y: 20 },  // COM2
            { x: 30,  y: 5 },   // A2
            { x: 30,  y: 35 }   // B2
        ];
        this.w = 80;
        this.h = 80;
        this.props = { Position: 'A' };
    }

    toggle() {
        this.props.Position = (this.props.Position === 'A') ? 'B' : 'A';
        markStateDirty();
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        const posA = this.props.Position === 'A';
        const drawPole = (yBase, toA, toB) => {
            ctx.beginPath();
            ctx.moveTo(-30, yBase);
            ctx.lineTo(-10, yBase);
            const targetY = posA ? toA : toB;
            ctx.lineTo(10, targetY);
            ctx.lineTo(30, targetY);
            ctx.moveTo(30, toA); ctx.lineTo(40, toA);
            ctx.moveTo(30, toB); ctx.lineTo(40, toB);
            ctx.stroke();
        };
        drawPole(-20, -35, -5);
        drawPole(20, 5, 35);
    }
}

function getLEDColor(name, lastI = 0, IfStr = '10m') {
    const palette = {
        red:   [255, 95, 70],
        green: [90, 255, 150],
        blue:  [90, 160, 255],
        white: [240, 240, 240]
    };
    const key = String(name || 'red').toLowerCase();
    const base = palette[key] || palette.red;
    const If = parseUnit(IfStr || '10m') || 0.01;
    const forwardI = Math.max(0, lastI);
    const norm = Math.max(0, Math.min(1, forwardI / If));
    const offScale = 0.18;
    const onScale  = 0.95;
    const scale = offScale + (onScale - offScale) * norm;
    const rayScale = 0.2 + 0.8 * norm;

    const body = `rgb(${Math.round(base[0] * scale)}, ${Math.round(base[1] * scale)}, ${Math.round(base[2] * scale)})`;
    const glow = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${0.6 * norm})`;
    const sym  = `rgb(${Math.round(base[0] * rayScale)}, ${Math.round(base[1] * rayScale)}, ${Math.round(base[2] * rayScale)})`;
    return { body, glow, sym, norm };
}

/* === MOSFET / JUNCTION === */
class Junction extends Component {
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
}

class MOSFET extends Component {
    setup() {
        // Gate, Drain (top), Source (bottom), Body
        this.pins = [
            { x: -20, y:   0 }, // 0: Gate
            { x:  20, y: -20 }, // 1: Drain (top right)
            { x:  20, y:  20 }, // 2: Source (bottom right)
            { x:  20, y:   0 }  // 3: Body (right-center)
        ];
        this.w = 50;
        this.h = 70;

        this.props = {
            Type:   'NMOS',
            W:      '1u',
            L:      '1u',
            Kp:     '140u',  // µA/V^2
            Vth:    '0.7',
            Lambda: '0.1',
            Gamma:  '0.45',
            Phi:    '0.9'
        };

        this._lastVg = this._lastVd = this._lastVs = this._lastVb = 0;
    }

    drawSym(ctx) {
        const isP = (this.props.Type === 'PMOS');

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;

        const gateLeadX = -20;
        const gateX     = -5;
        const channelX  = 2;
        const tapX      = 20;
        const dY = -20, bY = 0, sY = 20;

        ctx.beginPath();
        // gate lead + plate
        ctx.moveTo(gateLeadX, 0); ctx.lineTo(gateX, 0);
        ctx.moveTo(gateX, -21);   ctx.lineTo(gateX, 21);

        // channel (vertical stack) centered between gate and pins
        ctx.moveTo(channelX, -21); ctx.lineTo(channelX, 21);

        // drain (top right, pin 1)
        ctx.moveTo(channelX, dY); ctx.lineTo(tapX, dY); ctx.lineTo(tapX, dY - 4);
        // body (right mid, pin 3)
        ctx.moveTo(channelX, bY); ctx.lineTo(tapX, bY);
        // source (bottom right, pin 2)
        ctx.moveTo(channelX, sY); ctx.lineTo(tapX, sY); ctx.lineTo(tapX, sY + 4);
        ctx.stroke();

        // PMOS gate bubble to distinguish from NMOS
        if (isP) {
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.arc(gateX - 2, 0, 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // source arrow: head sits near the channel, direction flips for P/N
        ctx.beginPath();
        const arrowHeadX = channelX + 2;
        const arrowTailX = tapX - 2;
        const dir = isP ? -1 : 1; // +1: arrow points right (NMOS), -1: points left (PMOS)
        ctx.moveTo(arrowHeadX, sY);
        ctx.lineTo(arrowTailX, sY);
        ctx.stroke();

        const ah = 4;
        ctx.beginPath();
        ctx.moveTo(arrowHeadX, sY);
        ctx.lineTo(arrowHeadX - dir * ah, sY - 3);
        ctx.moveTo(arrowHeadX, sY);
        ctx.lineTo(arrowHeadX - dir * ah, sY + 3);
        ctx.stroke();
    }

    drawPhys(ctx) {
        // package body
        const bw = 40;
        const bh = 40;
        ctx.fillStyle   = '#111827';
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth   = 1.5;
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

        // legs (G left, D top-right, S bottom-right, B mid-right)
        const legs = [
            { x: -20, y:   0, label: 'G' },
            { x:  20, y: -20, label: 'D' },
            { x:  20, y:  20, label: 'S' },
            { x:  20, y:   0, label: 'B' }
        ];

        legs.forEach(leg => {
            const len = 8;

            ctx.fillStyle = '#bbbbbb';
            if (Math.abs(leg.x) >= Math.abs(leg.y)) {
                // horizontal leg (left / right)
                const x0 = (leg.x > 0) ? (leg.x - len) : leg.x;
                ctx.fillRect(x0, leg.y - 1.5, len, 3);
            } else {
                // vertical leg (just in case we ever add one)
                const y0 = (leg.y > 0) ? (leg.y - len) : leg.y;
                ctx.fillRect(leg.x - 1.5, y0, 3, len);
            }

            // pin head at the hole position
            ctx.fillStyle = '#e5e7eb';
            ctx.beginPath();
            ctx.arc(leg.x, leg.y, PIN_HEAD_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawLabels(ctx, mode) {
        ctx.save();

        // pin tags (both views)
        const tags = ['G', 'D', 'S', 'B'];
        ctx.fillStyle = '#9ca3af';
        ctx.font = LABEL_FONT_SMALL;
        const center = getPinCenter(this);
        tags.forEach((label, i) => {
            const pos = this.getPinPos(i);
            const dx = pos.x - center.x;
            const dy = pos.y - center.y;
            const vertical = Math.abs(dy) >= Math.abs(dx);
            if (vertical) {
                ctx.textAlign = 'center';
                const yOff = dy > 0 ? LABEL_GAP_SMALL : -LABEL_GAP_SMALL;
                ctx.fillText(label, pos.x, pos.y + yOff);
            } else {
                const isLeft = dx < 0;
                ctx.textAlign = isLeft ? 'right' : 'left';
                const xOff = isLeft ? -LABEL_GAP_SMALL : LABEL_GAP_SMALL;
                ctx.fillText(label, pos.x + xOff, pos.y + LABEL_GAP_SMALL * 0.5);
            }
        });

        const type = (this.props.Type === 'PMOS') ? 'P' : 'N';
        const box = this.getBoundingBox();
        const boxCenter = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
        const wlPosWorld = { x: boxCenter.x, y: box.y2 + LABEL_OUTSIDE_OFFSET };
        if (mode === 'physical') {
            const Wm   = parseUnit(this.props.W   || '1u');
            const Lm   = parseUnit(this.props.L   || '1u');

            const Wstr  = formatUnit(Wm, 'm');
            const Lstr  = formatUnit(Lm, 'm');

            const typePos  = { x: boxCenter.x, y: boxCenter.y + 3 }; // tuck slightly below center

            ctx.fillStyle = '#e5e7eb';
            ctx.font      = LABEL_FONT_MOSFET_TYPE;
            ctx.textAlign = 'center';
            ctx.fillText(type, typePos.x, typePos.y);
            ctx.textAlign = 'center';
            ctx.font = LABEL_FONT_SMALL;
            ctx.fillText(`W=${Wstr}  L=${Lstr}`, wlPosWorld.x, wlPosWorld.y);
        } else if (mode === 'schematic') {
            const Wm   = parseUnit(this.props.W   || '1u');
            const Lm   = parseUnit(this.props.L   || '1u');
            const Wstr  = formatUnit(Wm, 'm');
            const Lstr  = formatUnit(Lm, 'm');
            const labelPos = { x: boxCenter.x, y: box.y2 + LABEL_OUTSIDE_OFFSET };
            ctx.fillStyle = '#e5e7eb';
            ctx.font = LABEL_FONT_SMALL;
            ctx.textAlign = 'center';
            ctx.fillText(`W=${Wstr}  L=${Lstr}`, labelPos.x, labelPos.y);
        }

        ctx.restore();
    }
}

/* === IDEAL DUAL OP-AMP (LF412-style) === */

class LF412 extends Component {
    setup() {
        // Pin order follows LM358-style dual op-amp DIP numbering:
        // 1=1OUT, 2=1IN-, 3=1IN+, 4=VCC-, 5=2IN+, 6=2IN-, 7=2OUT, 8=VCC+
        this.pins = [
            { x:-40, y:-40 }, // 0: 1OUT (pin 1)
            { x:-40, y:-20 }, // 1: 1IN- (pin 2)
            { x:-40, y: 20 }, // 2: 1IN+ (pin 3)
            { x:-40, y: 40 }, // 3: VCC- (pin 4)
            { x: 40, y: 40 }, // 4: 2IN+ (pin 5)
            { x: 40, y: 20 }, // 5: 2IN- (pin 6)
            { x: 40, y:-20 }, // 6: 2OUT (pin 7)
            { x: 40, y:-40 }  // 7: VCC+ (pin 8)
        ];
        this.w = 80;
        this.h = 100;
        this.props = {}; // ideal, no editable params for now
    }

    drawSym(ctx) {
        ctx.save();
        const body = { x: -40, y: -50, w: 80, h: 100 };

        // body
        ctx.fillStyle   = '#0b0f19';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.fillRect(body.x, body.y, body.w, body.h);
        ctx.strokeRect(body.x, body.y, body.w, body.h);

        // U-shaped notch (∪) cut into the top edge
        const notchW     = 28;
        const notchDepth = 8;
        const topY       = body.y;
        const bgColor    = '#020617';

        // punch the notch out with board background
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.moveTo(-notchW / 2, topY);
        ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
        ctx.lineTo(notchW / 2, topY - 2);
        ctx.lineTo(-notchW / 2, topY - 2);
        ctx.closePath();
        ctx.fill();

        // white outline of the U
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-notchW / 2, topY);
        ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
        ctx.stroke();

        const leftPins = [
            { y: -40, label: '1OUT' },
            { y: -20, label: '1IN-' },
            { y:  20, label: '1IN+' },
            { y:  40, label: 'VCC-' }
        ];
        const rightPins = [
            { y: -40, label: 'VCC+' },
            { y: -20, label: '2OUT' },
            { y:  20, label: '2IN-' },
            { y:  40, label: '2IN+' }
        ];

        ctx.font      = '9px monospace';
        ctx.fillStyle = '#d1d5db';
        leftPins.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(body.x, p.y);
            ctx.lineTo(body.x - 12, p.y);
            ctx.stroke();
        });
        rightPins.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(body.x + body.w, p.y);
            ctx.lineTo(body.x + body.w + 12, p.y);
            ctx.stroke();
        });

        // pin markers
        ctx.fillStyle = '#60a5fa';
        leftPins.concat(rightPins).forEach(p => {
            const x = leftPins.includes(p) ? body.x : body.x + body.w;
            ctx.beginPath();
            ctx.arc(x, p.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawPhys(ctx) {
        const g = ctx.createLinearGradient(-40, 0, 40, 0);
        g.addColorStop(0, '#222222');
        g.addColorStop(1, '#000000');
        ctx.fillStyle = g;
        ctx.fillRect(-40, -50, 80, 100);

        // notch
        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.arc(0, -50, 7, 0, Math.PI);
        ctx.fill();

        ctx.fillStyle = '#dddddd';
        [-40, -20, 20, 40].forEach(y => {
            ctx.fillRect(-45, y - 2, 5, 4);
            ctx.fillRect( 40, y - 2, 5, 4);
        });
    }

    drawLabels(ctx, mode) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        if (mode === 'schematic') {
            const titlePos = getPinCenter(this);
            ctx.fillStyle = '#9ca3af';
            ctx.font = LABEL_FONT_BOLD;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LF412', titlePos.x, titlePos.y);

            const labels = [
                { idx: 0, text: '1OUT' },
                { idx: 1, text: '1IN-' },
                { idx: 2, text: '1IN+' },
                { idx: 3, text: 'VCC-' },
                { idx: 4, text: '2IN+' },
                { idx: 5, text: '2IN-' },
                { idx: 6, text: '2OUT' },
                { idx: 7, text: 'VCC+' }
            ];

            ctx.font = LABEL_FONT_SMALL;
            ctx.fillStyle = '#d1d5db';
            ctx.textBaseline = 'middle';
            labels.forEach(l => {
                const dir = getPinDirection(this, l.idx) || { x: 0, y: 1 };
                const pos = offsetLabelFromPin(this, l.idx, LABEL_OUTSIDE_OFFSET, dir);
                ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
                ctx.fillText(l.text, pos.x, pos.y);
            });
        } else if (mode === 'physical') {
            const pos = getPinCenter(this);
            ctx.fillStyle = '#cccccc';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LF412', pos.x, pos.y);
        }
        ctx.restore();
    }
}

/* === SOURCES: DC + FUNCTION GENERATOR (Vpp) === */
class VoltageSource extends Component {
    setup() {
        // pin0 = +, pin1 = -
        this.pins = [{ x: 0, y:-40 }, { x: 0, y: 40 }];
        this.w = 40;
        this.h = 90;
        this.props = { Vdc: '5' }; // renamed so we know it's DC
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;

        const plateOffset  = 12; // vertical distance from center to outer plates
        const plateSpacing = (plateOffset * 2) / 3; // even spacing for 4 plates

        // vertical leads
        ctx.beginPath();
        ctx.moveTo(0, -40); ctx.lineTo(0, -plateOffset);
        ctx.moveTo(0,  plateOffset); ctx.lineTo(0,  40);
        ctx.stroke();

        // four plates: long, short, long, short with tighter spacing
        const plateYs       = Array.from({ length: 4 }, (_, i) => -plateOffset + plateSpacing * i);
        const plateHalfLong = 16;
        const plateHalfShort= 8;

        ctx.beginPath();
        ctx.moveTo(-plateHalfLong,  plateYs[0]); ctx.lineTo( plateHalfLong,  plateYs[0]); // long
        ctx.moveTo(-plateHalfShort, plateYs[1]); ctx.lineTo( plateHalfShort, plateYs[1]); // short
        ctx.moveTo(-plateHalfLong,  plateYs[2]); ctx.lineTo( plateHalfLong,  plateYs[2]); // long
        ctx.moveTo(-plateHalfShort, plateYs[3]); ctx.lineTo( plateHalfShort, plateYs[3]); // short
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
        ctx.fillRect(-6,  34, 12, 6);
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
}

// 3-terminal function generator (+, COM, -) with Vpp
class FunctionGenerator extends Component {
    setup() {
        // 0: +, 1: COM, 2: -
        // Align body/pins to GRID like the scope so rotation stays centered
        this.body = { x1: -40, x2: 40, y1: -25, y2: 40 };
        const pinY = this.body.y2; // pins sit on bottom edge
        this.pins = [
            { x: -20, y: pinY }, // +
            { x:   0, y: pinY }, // COM
            { x:  20, y: pinY }  // -
        ];
        this.w = 80;
        this.h = 80;

        this.props = {
            Vpp:    '1',    // peak-to-peak voltage
            Freq:   '1k',   // Hz
            Offset: '0',    // DC offset
            Phase:  '0',    // degrees
            Wave:   'sine'  // sine|square|triangle (sim: sine)
        };
    }

    getLocalBounds() {
        // tighter bounds so the selection outline hugs the enclosure and jacks
        return {
            x1: -50,
            x2:  50,
            y1: -35,
            y2:  50
        };
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;

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
        ctx.lineWidth   = 1.5;
        this.drawWaveGlyph(ctx, this.props.Wave || 'sine');
        ctx.restore();

        // banana jack faces aligned to pins, sitting on bottom edge
        const pins = [
            { idx: 0, color: '#f97316' }, // +
            { idx: 1, color: '#e5e7eb' }, // COM
            { idx: 2, color: '#9ca3af' }  // -
        ];

        const jackOffset = 0;
        pins.forEach(p => {
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
            { text: '+',   idx: 0, color: '#f97316' },
            { text: 'COM', idx: 1, color: '#e5e7eb' },
            { text: '-',   idx: 2, color: '#9ca3af' }
        ];
        const labelY = this.body.y2 - LABEL_GAP_SMALL;
        labels.forEach(l => {
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

        const drawSampled = fn => {
            const steps = 36;
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
                const t = -Math.PI + (2 * Math.PI * i) / steps; // one full period
                const x = -w + (2 * w * i) / steps;
                const y = -fn(t) * a + yOffset;                 // shifted down
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        if (wave === 'square') {
            // square like the red marker: low segment, step up, long high, step down
            const yHigh = -a + yOffset;
            const yLow  =  a + yOffset;

            const x0 = -w * 0.5;   // left vertical
            const x1 = -w * 0.0;   // middle vertical
            const x2 =  w * 0.5;   // right vertical

            ctx.beginPath();
            ctx.moveTo(x0, yHigh - 1);  // left, high
            ctx.lineTo(x0, yLow);   // down
            ctx.lineTo(x1, yLow);   // low segment
            ctx.lineTo(x1, yHigh);  // step up
            ctx.lineTo(x2, yHigh);  // long high segment
            ctx.lineTo(x2, yLow + 1);   // step down
            ctx.stroke();
        } else if (wave === 'triangle') {
            // triangle(t) = 2/pi * asin(sin(t))
            drawSampled(t => (2 / Math.PI) * Math.asin(Math.sin(t)));
        } else {
            // sine
            drawSampled(t => Math.sin(t));
        }
    }
}

/* === GROUND === */
class Ground extends Component {
    setup() {
        this.pins = [{ x: 0, y: -20 }];
        this.w = 30;
        this.h = 40;
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;

        ctx.beginPath();
        ctx.moveTo(0, -20); ctx.lineTo(0, 0); ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
        ctx.moveTo(-10, 5); ctx.lineTo(10, 5);
        ctx.moveTo(-5, 10); ctx.lineTo(5, 10);
        ctx.stroke();
    }

    drawPhys(ctx) { this.drawSym(ctx); }
}

/* === OSCILLOSCOPE (dual-channel) === */
class Oscilloscope extends Component {
    setup() {
        // 0: CH1, 1: CH2, 2: GND
        this.pins = [
            { x:-40, y: 40 },
            { x:  0, y: 40 },
            { x: 40, y: 40 }
        ];
        this.w = 100;
        this.h = 80;

        this.data = {
            ch1: new Float32Array(HISTORY_SIZE),
            ch2: new Float32Array(HISTORY_SIZE)
        };
        this.head        = 0;
        this.sampleAccum = 0;
        this._lastNodes  = { n1: null, n2: null, nG: null };
        this.props = {
            TimeDiv: '1m', // 1 ms / div (10 divs total on screen)
            VDiv1:  '1',   // volts / div CH1
            VDiv2:  '1'    // volts / div CH2
        };
    }

    drawSym(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.strokeRect(-50, -40, 100, 80);

        // screen window (slightly inset)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
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
            ctx.moveTo(gx, screen.y); ctx.lineTo(gx, screen.y + screen.h);
            ctx.moveTo(screen.x, gy); ctx.lineTo(screen.x + screen.w, gy);
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
        ctx.beginPath(); ctx.arc(-30, 25, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath(); ctx.arc(  0, 25, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath(); ctx.arc( 30, 25, 3, 0, Math.PI * 2); ctx.fill();

        const jacks = [
            { x: this.pins[0].x, color: '#fbbf24' },
            { x: this.pins[1].x, color: '#22d3ee' },
            { x: this.pins[2].x, color: '#9ca3af' }
        ];

        jacks.forEach(j => {
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
            { text: '2', x:   0, y: 33, color: '#22d3ee' },
            { text: 'G', x:  37, y: 33, color: '#9ca3af' }
        ];
        labels.forEach(l => {
            const pos = this.localToWorld(l.x, l.y);
            ctx.fillStyle = l.color;
            ctx.textAlign = 'center';
            ctx.fillText(l.text, pos.x, pos.y);
        });
        ctx.restore();
    }
}

/* ============================================================
 *  PART 3 – SIMULATION, DRAWING, WIRING & UI
 * ==========================================================*/

/* ---------- SIMULATION CORE (MNA) ---------- */

function simulate(t) {
    if (!components.length) {
        simError = null;
        return;
    }

    // ---- Build pin map ----
    const pinMap = new Map(); // key: "id_idx" -> raw index
    let rawCount = 0;
    components.forEach(c => {
        c.pins.forEach((_, i) => {
            pinMap.set(c.id + '_' + i, rawCount++);
        });
    });
    if (rawCount === 0) return;

    // ---- Union-Find for connectivity ----
    const parent = new Array(rawCount);
    for (let i = 0; i < rawCount; i++) parent[i] = i;
    function find(i) {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }
    function union(a, b) {
        a = find(a); b = find(b);
        if (a !== b) parent[b] = a;
    }

    // unify pin groups by wires
    wires.forEach(w => {
        const a = pinMap.get(w.from.c.id + '_' + w.from.p);
        const b = pinMap.get(w.to.c.id   + '_' + w.to.p);
        if (a != null && b != null) union(a, b);
    });

    // force all Ground pins to share the same root (global reference)
    let firstGroundIdx = null;
    components.forEach(c => {
        if (c instanceof Ground) {
            const key = c.id + '_0';
            const idx = pinMap.get(key);
            if (idx != null) {
                if (firstGroundIdx == null) firstGroundIdx = idx;
                else union(firstGroundIdx, idx);
            }
        }
    });

    // ---- Find ground root (prefer unified GND, else VS- / FG COM) ----
    let groundRoot = (firstGroundIdx != null) ? find(firstGroundIdx) : null;
    const vsNegCandidates = [];
    components.forEach(c => {
        if (c instanceof VoltageSource) {
            const idx = pinMap.get(c.id + '_1');
            if (idx != null) vsNegCandidates.push(find(idx));
        } else if (c instanceof FunctionGenerator) {
            const idx = pinMap.get(c.id + '_1');
            if (idx != null) vsNegCandidates.push(find(idx));
        }
    });
    if (groundRoot == null && vsNegCandidates.length) {
        groundRoot = vsNegCandidates[0];
    }
    if (groundRoot == null) {
        simError = 'No reference node found: add a Ground or tie a source COM/negative to the circuit.';
        isPaused = true;
        updatePlayPauseButton();
        return;
    }

    // Determine which union roots correspond to actual circuit elements (non-measurement)
    const rootHasPhysics = new Map();
    components.forEach(c => {
        const isMeasurement = (c instanceof Oscilloscope) || (c instanceof Junction);
        c.pins.forEach((_, i) => {
            const raw = pinMap.get(c.id + '_' + i);
            if (raw == null) return;
            const r = find(raw);
            if (!isMeasurement) {
                rootHasPhysics.set(r, true);
            } else if (!rootHasPhysics.has(r)) {
                rootHasPhysics.set(r, false);
            }
        });
    });

    // ---- Assign node indices (excluding ground) ----
    // Only roots that touch real circuit elements (rootHasPhysics === true) become MNA nodes.
    // Measurement-only nets (scopes/junctions alone) remain at -1 and read as reference.
    const rootToNode = new Map();
    rootToNode.set(groundRoot, -1);
    let nodeCount = 0;
    const seenRoots = new Set();
    components.forEach(c => {
        c.pins.forEach((_, i) => {
            const raw = pinMap.get(c.id + '_' + i);
            if (raw == null) return;
            const r   = find(raw);
            if (seenRoots.has(r)) return;
            seenRoots.add(r);
            if (r === groundRoot) return;

            const hasPhys = rootHasPhysics.get(r) === true;
            if (hasPhys) {
                rootToNode.set(r, nodeCount++);
            }
        });
    });
    if (nodeCount === 0) {
        simError = null;
        return;
    }

    function getNodeIdx(c, pIdx) {
        const raw = pinMap.get(c.id + '_' + pIdx);
        if (raw == null) return -1;
        const r = find(raw);
        const n = rootToNode.get(r);
        return (n == null ? -1 : n);
    }

    // ---- Collect voltage sources (DC + FunctionGens) ----
    // Only keep a source if it touches at least one real node; otherwise the MNA row would be empty.
    const vsEntries = [];
    components.forEach(c => {
        if (c instanceof VoltageSource) {
            const nPlus  = getNodeIdx(c, 0);
            const nMinus = getNodeIdx(c, 1);
            if (nPlus === -1 && nMinus === -1) return;
            const valueFn = () => parseUnit(c.props.Vdc || '0');
            vsEntries.push({ comp: c, nPlus, nMinus, valueFn });
        } else if (c instanceof FunctionGenerator) {
            const nPlus = getNodeIdx(c, 0);
            const nCom  = getNodeIdx(c, 1);
            const nNeg  = getNodeIdx(c, 2);
            const waveValue = () => {
                const Vpp   = parseUnit(c.props.Vpp    || '0');
                const Freq  = parseUnit(c.props.Freq   || '0');
                const offset= parseUnit(c.props.Offset || '0');
                const phaseDeg = parseFloat(c.props.Phase || '0') || 0;
                const phaseRad = phaseDeg * Math.PI / 180;
                const amp = Vpp / 2;
                const waveType = String(c.props.Wave || 'sine').toLowerCase();
                const omega = 2 * Math.PI * Freq;
                const phase = omega * t + phaseRad;
                let ac = 0;
                switch (waveType) {
                    case 'square':
                        ac = amp * (Math.sin(phase) >= 0 ? 1 : -1);
                        break;
                    case 'triangle': {
                        const cyc = ((phase / (2 * Math.PI)) % 1 + 1) % 1; // 0..1
                        const tri = cyc < 0.5 ? (cyc * 4 - 1) : (3 - cyc * 4);
                        ac = amp * tri;
                        break;
                    }
                    default:
                        ac = amp * Math.sin(phase);
                }
                return { ac, offset };
            };
            if (!(nPlus === -1 && nCom === -1)) {
                // Pin + swings offset + 0.5*Vpp*wave(t) relative to COM
                vsEntries.push({ comp: c, nPlus, nMinus: nCom, valueFn: () => {
                    const { ac, offset } = waveValue();
                    return offset + ac;
                } });
            }
            if (!(nNeg === -1 && nCom === -1)) {
                // Pin - swings offset - 0.5*Vpp*wave(t) relative to COM
                vsEntries.push({ comp: c, nPlus: nNeg, nMinus: nCom, valueFn: () => {
                    const { ac, offset } = waveValue();
                    return offset - ac;
                } });
            }
        }
    });
    // Quick sim sanity check (manual): tie FunctionGenerator COM to Ground,
    // place a resistor from pin + to ground, and probe pin + with the scope.
    // Expect offset + 0.5*Vpp wave(t) as configured.

    const N = nodeCount + vsEntries.length;
    const G = new Matrix(N);
    const I = new Float64Array(N);

    function stampG(n1, n2, g) {
        if (!g) return;
        if (n1 !== -1) G.add(n1, n1, g);
        if (n2 !== -1) G.add(n2, n2, g);
        if (n1 !== -1 && n2 !== -1) {
            G.add(n1, n2, -g);
            G.add(n2, n1, -g);
        }
    }

    function stampI(n, iVal) {
        if (!iVal) return;
        if (n !== -1) I[n] += iVal;
    }

    // ---- Stamp passive, MOSFET, op-amp, etc. (node block only) ----
    components.forEach(c => {
        if (c instanceof Resistor) {
            const n1 = getNodeIdx(c, 0);
            const n2 = getNodeIdx(c, 1);
            const R  = parseUnit(c.props.R || '1');
            const g  = (R > 0) ? 1 / R : 0;
            stampG(n1, n2, g);
        }
        else if (c instanceof Potentiometer) {
            const n1 = getNodeIdx(c, 0);
            const nW = getNodeIdx(c, 1);
            const n3 = getNodeIdx(c, 2);
            const totalR = Math.max(parseUnit(c.props.R || '0'), 1e-3);
            const frac = (typeof c.getTurnFraction === 'function')
                ? c.getTurnFraction()
                : Math.min(1, Math.max(0, parseFloat(c.props.Turn || '50') / 100));

            const minLeg = 1e-3;
            const R1 = Math.max(minLeg, totalR * frac);
            const R2 = Math.max(minLeg, totalR * (1 - frac));

            stampG(n1, nW, 1 / R1);
            stampG(nW, n3, 1 / R2);
        }
        else if (c instanceof Capacitor) {
            const n1 = getNodeIdx(c, 0);
            const n2 = getNodeIdx(c, 1);
            const C  = parseUnit(c.props.C || '0');
            if (C <= 0) return;
            const g = C / DT;
            const vPrev = c._lastV || 0;

            stampG(n1, n2, g);
            stampI(n1,  g * vPrev);
            stampI(n2, -g * vPrev);
        }
        else if (c instanceof LED) {
            const nA = getNodeIdx(c, 0);
            const nK = getNodeIdx(c, 1);
            const Vf = parseUnit(c.props.Vf || '3.3');
            const If = parseUnit(c.props.If || '10m') || 0.01;
            let R = Math.abs(Vf / If);
            if (!isFinite(R) || R <= 0) R = 330;
            const g = 1 / R;
            stampG(nA, nK, g);
        }
        else if (c instanceof SPSTSwitch) {
            const n1 = getNodeIdx(c, 0);
            const n2 = getNodeIdx(c, 1);
            if (c.props.Closed) {
                stampG(n1, n2, 1 / 1e-3);
            }
        }
        else if (c instanceof SPDTSwitch) {
            const nCom = getNodeIdx(c, 0);
            const nA = getNodeIdx(c, 1);
            const nB = getNodeIdx(c, 2);
            if (c.props.Position === 'A') stampG(nCom, nA, 1 / 1e-3);
            else stampG(nCom, nB, 1 / 1e-3);
        }
        else if (c instanceof DPDT) {
            const posA = c.props.Position === 'A';
            const nC1 = getNodeIdx(c, 0);
            const nA1 = getNodeIdx(c, 1);
            const nB1 = getNodeIdx(c, 2);
            const nC2 = getNodeIdx(c, 3);
            const nA2 = getNodeIdx(c, 4);
            const nB2 = getNodeIdx(c, 5);
            stampG(nC1, posA ? nA1 : nB1, 1 / 1e-3);
            stampG(nC2, posA ? nA2 : nB2, 1 / 1e-3);
        }
        else if (c instanceof MOSFET) {
            const nG = getNodeIdx(c, 0);
            const nD = getNodeIdx(c, 1);
            const nS = getNodeIdx(c, 2);
            const nB = getNodeIdx(c, 3);

            const vG = (nG === -1 ? 0 : (c._lastVg ?? 0));
            const vD = (nD === -1 ? 0 : (c._lastVd ?? 0));
            const vS = (nS === -1 ? 0 : (c._lastVs ?? 0));
            const vB = (nB === -1 ? vS : (c._lastVb ?? vS));

            const isP   = (c.props.Type === 'PMOS');
            const vt    = Math.abs(parseUnit(c.props.Vth || '0.7'));
            const kp0   = parseUnit(c.props.Kp  || '140u');
            const W     = parseUnit(c.props.W   || '1u');
            const L     = parseUnit(c.props.L   || '1u') || 1e-6;
            const k     = kp0 * (W / L);
            const lambda= parseUnit(c.props.Lambda || '0.0');
            const gamma = Math.max(0, parseUnit(c.props.Gamma || '0'));
            const phi   = Math.max(0, parseUnit(c.props.Phi   || '0.9'));

            const VsbRaw = isP ? (vB - vS) : (vS - vB);
            const Vsb = Math.max(0, VsbRaw);
            const rootBase = Math.sqrt(Math.max(0, phi));
            const rootBias = Math.sqrt(Math.max(0, phi + Vsb));
            const vtEff = vt + gamma * (rootBias - rootBase);

            let vgs = isP ? (vS - vG) : (vG - vS);
            let vds = isP ? (vS - vD) : (vD - vS);
            let ids = 0;

            if (vgs > vtEff) {
                if (vds < vgs - vtEff) {
                    ids = k * ((vgs - vtEff) * vds - 0.5 * vds * vds);
                } else {
                    const vov = vgs - vtEff;
                    ids = 0.5 * k * vov * vov * (1 + lambda * (vds - vov));
                }
            }
            if (isP) ids = -ids;

            if (nD !== -1) I[nD] -= ids;
            if (nS !== -1) I[nS] += ids;

            const gLeak = 1e-9;
            stampG(nD, nS, gLeak);
        }
        else if (c instanceof LF412) {
            const gain = 5e3;
            function stampOpAmpHalf(pNon, pInv, pOut) {
                const nNon = getNodeIdx(c, pNon);
                const nInv = getNodeIdx(c, pInv);
                const nOut = getNodeIdx(c, pOut);
                if (nOut === -1) return;
                if (nNon !== -1) G.add(nOut, nNon, -gain);
                if (nInv !== -1) G.add(nOut, nInv,  gain);
                G.add(nOut, nOut, 1.0);
            }
            stampOpAmpHalf(2, 1, 0);
            stampOpAmpHalf(4, 5, 6);
        }
    });

    // ---- Stamp independent voltage sources (DC + Function Generator) ----
    vsEntries.forEach((src, idx) => {
        const row   = nodeCount + idx;
        const nPlus = src.nPlus;
        const nMinus= src.nMinus;
        if (nPlus === -1 && nMinus === -1) return;

        if (nPlus !== -1) {
            G.add(nPlus, row,  1);
            G.add(row,  nPlus, 1);
        }
        if (nMinus !== -1) {
            G.add(nMinus, row, -1);
            G.add(row,   nMinus,-1);
        }

        // keep this row pivotable so the matrix isn't singular
        G.add(row, row, 1e-9);

        const vSrc = src.valueFn ? src.valueFn() : 0;
        I[row] += vSrc;
    });

    // ---- Solve for node voltages & source currents ----
    const solved = G.solve(I);
    if (solved.singular) {
        simError = 'Circuit is singular (check ground or shorted sources)';
        isPaused = true;
        updatePlayPauseButton();
        return;
    }
    const sol = solved.x;
    simError = null;

    // Gently clamp op-amp outputs to keep the solver stable
    components.forEach(c => {
        if (c instanceof LF412) {
            const outs = [getNodeIdx(c, 0), getNodeIdx(c, 5)];
            outs.forEach(n => {
                if (n != null && n !== -1) {
                    const v = sol[n];
                    if (Math.abs(v) > 100) {
                        sol[n] = Math.sign(v) * 100;
                    }
                }
            });
        }
    });

    // ---- Store results in wires (for color) ----
    wires.forEach(w => {
        const n = getNodeIdx(w.from.c, w.from.p);
        const v = (n === -1 ? 0 : sol[n]);
        if (w.v === undefined) w.v = v;
        w.v = 0.8 * w.v + 0.2 * v;
    });

    // ---- Update component internal states & scope sampling ----
    components.forEach(c => {
        if (c instanceof Capacitor) {
            const n1 = getNodeIdx(c, 0);
            const n2 = getNodeIdx(c, 1);
            const v1 = (n1 === -1 ? 0 : sol[n1]);
            const v2 = (n2 === -1 ? 0 : sol[n2]);
            c._lastV = v1 - v2;
        }
        if (c instanceof LED) {
            const nA = getNodeIdx(c, 0);
            const nK = getNodeIdx(c, 1);
            const vA = (nA === -1 ? 0 : sol[nA]);
            const vK = (nK === -1 ? 0 : sol[nK]);

            const Vf = parseUnit(c.props.Vf || '3.3');
            const If = parseUnit(c.props.If || '10m') || 0.01;
            let R = Math.abs(Vf / If);
            if (!isFinite(R) || R <= 0) R = 330;

            c._lastI = (vA - vK) / R;
        }
        if (c instanceof MOSFET) {
            const nG = getNodeIdx(c, 0);
            const nD = getNodeIdx(c, 1);
            const nS = getNodeIdx(c, 2);
            const nB = getNodeIdx(c, 3);
            c._lastVg = (nG === -1 ? 0 : sol[nG]);
            c._lastVd = (nD === -1 ? 0 : sol[nD]);
            c._lastVs = (nS === -1 ? 0 : sol[nS]);
            c._lastVb = (nB === -1 ? c._lastVs : sol[nB]);
        }
        if (c instanceof Oscilloscope) {
            const n1 = getNodeIdx(c, 0);
            const n2 = getNodeIdx(c, 1);
            const nG = getNodeIdx(c, 2);
            const lastNodes = c._lastNodes || { n1: null, n2: null, nG: null };
            if (lastNodes.n1 !== n1 || lastNodes.n2 !== n2 || lastNodes.nG !== nG) {
                c.data.ch1.fill(0);
                c.data.ch2.fill(0);
                c.head = 0;
                c.sampleAccum = 0;
            }
            c._lastNodes = { n1, n2, nG };

            const vG = (nG === -1 ? 0 : sol[nG]);
            const v1 = (n1 === -1 ? 0 : sol[n1] - vG);
            const v2 = (n2 === -1 ? 0 : sol[n2] - vG);

            const tDiv       = parseUnit(c.props.TimeDiv || '1m');
            const windowTime = tDiv * 10;
            const sampleT    = windowTime / HISTORY_SIZE || DT;

            c.sampleAccum += DT;
            if (c.sampleAccum >= sampleT) {
                c.sampleAccum = 0;
                c.head = (c.head + 1) % HISTORY_SIZE;
                c.data.ch1[c.head] = v1;
                c.data.ch2[c.head] = v2;

                if (scopeMode) {
                    document.getElementById('scope-ch1-val').innerText = formatUnit(v1, 'V');
                    document.getElementById('scope-ch2-val').innerText = formatUnit(v2, 'V');
                }
            }
        }
    });
}

/* ---------- DRAWING ---------- */
function updateBoardThemeColors() {
    const style = getComputedStyle(document.body);
    const boardBg = style.getPropertyValue('--board-bg').trim();
    const boardHole = style.getPropertyValue('--board-hole').trim();
    const canvasBg = style.getPropertyValue('--canvas-bg').trim();

    if (boardBg) boardBgColor = boardBg;
    if (boardHole) gridHoleColor = boardHole;
    if (canvasBg) {
        canvasBgColor = canvasBg;
        if (canvas) {
            canvas.style.backgroundColor = canvasBgColor;
        }
    }
}

function drawGrid() {
    const w = BOARD_W + BOARD_MARGIN * 2;
    const h = BOARD_H + BOARD_MARGIN * 2;

    ctx.fillStyle = boardBgColor;
    ctx.fillRect(-BOARD_MARGIN, -BOARD_MARGIN, w, h);

    ctx.fillStyle = gridHoleColor;
    for (let x = -BOARD_MARGIN + GRID / 2; x < BOARD_W + BOARD_MARGIN; x += GRID) {
        for (let y = -BOARD_MARGIN + GRID / 2; y < BOARD_H + BOARD_MARGIN; y += GRID) {
            ctx.beginPath();
            ctx.arc(x, y, GRID_HOLE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function distToSegment(p, v, w) {
    function sqr(x) { return x * x; }
    function dist2(a, b) { return sqr(a.x - b.x) + sqr(a.y - b.y); }

    const l2 = dist2(v, w);
    if (l2 === 0) return Math.sqrt(dist2(p, v));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(
        dist2(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        })
    );
}

function mergeCollinear(pts) {
    if (pts.length < 2) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = out[out.length - 1];
        const curr = pts[i];
        const next = pts[i + 1];

        if ((curr.x === prev.x && curr.y === prev.y) ||
            (curr.x === next.x && curr.y === next.y)) {
            continue;
        }

        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const cross = dx1 * dy2 - dy1 * dx2;

        if (cross !== 0) out.push(curr);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (last.x !== tail.x || last.y !== tail.y) out.push(last);
    return out;
}

function getPinDirection(comp, pinIdx) {
    const pin = comp.pins[pinIdx];
    if (!pin) return null;
    let px = pin.x, py = pin.y;
    for (let r = 0; r < comp.rotation; r++) {
        const tx = px;
        px = -py;
        py = tx;
    }
    if (comp.mirrorX) px = -px;
    if (Math.abs(px) >= Math.abs(py)) {
        return { x: Math.sign(px || 1), y: 0 };
    }
    return { x: 0, y: Math.sign(py || 1) };
}

function routeManhattan(start, midPoints, end, startDir = null, endDir = null) {
    const targets = [...(midPoints || []), end].map(p => snapToBoardPoint(p.x, p.y));

    function stubFrom(p, dir, toward) {
        if (dir) return snapToBoardPoint(p.x + dir.x * GRID, p.y + dir.y * GRID);
        const dx = toward.x - p.x;
        const dy = toward.y - p.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
            return snapToBoardPoint(p.x + Math.sign(dx || 1) * GRID, p.y);
        }
        return snapToBoardPoint(p.x, p.y + Math.sign(dy || 1) * GRID);
    }

    let pts = [start];
    let last = start;

    targets.forEach((t, idx) => {
        const isEnd = (idx === targets.length - 1);
        const dirOut = (idx === 0) ? startDir : null;
        const dirIn  = isEnd ? endDir : null;
        const snapT = t;

        // direct align
        if (last.x === snapT.x || last.y === snapT.y) {
            pts.push(snapT);
            last = snapT;
            return;
        }

        // propose two L paths; pick one that aligns with dir hints
        const pathA = [snapToBoardPoint(snapT.x, last.y), snapT];
        const pathB = [snapToBoardPoint(last.x, snapT.y), snapT];

        function score(path) {
            let s = path.length;
            if (dirOut) {
                const first = path[0];
                if (dirOut.x && first.x === last.x) s += 1;
                if (dirOut.y && first.y === last.y) s += 1;
            }
            if (dirIn) {
                const prev = path[path.length - 2] || last;
                if (dirIn.x && prev.x === snapT.x) s += 1;
                if (dirIn.y && prev.y === snapT.y) s += 1;
            }
            return s;
        }

        const best = (score(pathA) <= score(pathB)) ? pathA : pathB;

        // ensure stubs honoring dirOut
        if (dirOut) {
            const stub = stubFrom(last, dirOut, best[0]);
            if (stub.x !== last.x || stub.y !== last.y) pts.push(stub);
        }

        best.forEach(p => pts.push(p));
        last = snapT;

        // add arrival stub if needed
        if (dirIn) {
            const prev = pts[pts.length - 2];
            if ((dirIn.x && prev.x !== snapT.x) || (dirIn.y && prev.y !== snapT.y)) {
                const arr = stubFrom(snapT, { x: -dirIn.x, y: -dirIn.y }, prev);
                pts.splice(pts.length - 1, 0, arr);
            }
        }
    });

    pts = mergeCollinear(pts);
    return pts;
}

function buildWireVertices(fromPin, midPoints, toPin) {
    const start = fromPin.c.getPinPos(fromPin.p);
    const end   = toPin.c.getPinPos(toPin.p);
    const dir   = getPinDirection(fromPin.c, fromPin.p);
    const endDir= getPinDirection(toPin.c, toPin.p);
    const path  = routeManhattan(start, midPoints || [], end, dir, endDir);
    const verts = path.slice(1, Math.max(1, path.length - 1));
    return mergeCollinear(verts);
}

// Insert a junction on a wire at a point, returning the new junction and replacing the wire with two segments
function splitWireAtPoint(wire, pt) {
    const poly = getWirePolyline(wire);
    // find closest segment
    let best = { idx: 0, dist: Infinity, proj: poly[0] };
    for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
        let t = 0;
        if (l2 > 0) {
            t = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / l2;
            t = Math.max(0, Math.min(1, t));
        }
        const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        const d = Math.hypot(pt.x - proj.x, pt.y - proj.y);
        if (d < best.dist) best = { idx: i, dist: d, proj };
    }

    const snap = snapToBoardPoint(best.proj.x, best.proj.y);
    const junction = new Junction(snap.x, snap.y);
    components.push(junction);

    // build new polyline with snap inserted
    const newPoly = [];
    for (let i = 0; i < poly.length; i++) {
        newPoly.push(poly[i]);
        if (i === best.idx) newPoly.push(snap);
    }

    // split
    const insertIdx = best.idx + 1;
    const partA = newPoly.slice(0, insertIdx + 1);
    const partB = newPoly.slice(insertIdx);

    function toVertices(path) {
        const verts = path.slice(1, Math.max(1, path.length - 1));
        return mergeCollinear(verts);
    }

    const wireA = {
        from: wire.from,
        to:   { c: junction, p: 0 },
        vertices: toVertices(partA),
        v: wire.v || 0
    };
    const wireB = {
        from: { c: junction, p: 0 },
        to:   wire.to,
        vertices: toVertices(partB),
        v: wire.v || 0
    };

    wires = wires.filter(w => w !== wire);
    wires.push(wireA, wireB);
    return junction;
}

// Helper: full polyline points for a wire (pins + vertices)
function getWirePolyline(w) {
    const pStart = w.from.c.getPinPos(w.from.p);
    const pEnd   = w.to.c.getPinPos(w.to.p);
    const dir    = getPinDirection(w.from.c, w.from.p);
    const endDir = getPinDirection(w.to.c, w.to.p);
    return routeManhattan(pStart, w.vertices || [], pEnd, dir, endDir);
}

function pruneFloatingJunctions() {
    const connected = new Set();
    wires.forEach(w => {
        connected.add(w.from.c);
        connected.add(w.to.c);
    });
    components = components.filter(c => !(c instanceof Junction) || connected.has(c));
}

function cleanupJunctions() {
    function getConnected(j) {
        return wires.filter(w => w.from.c === j || w.to.c === j);
    }
    function otherEnd(w, j) {
        return (w.from.c === j) ? w.to : w.from;
    }

    let changed;
    do {
        changed = false;
        for (const j of [...components]) {
            if (!(j instanceof Junction)) continue;
            const conn = getConnected(j);
            const deg = conn.length;
            if (deg === 0) {
                components = components.filter(c => c !== j);
                changed = true;
            } else if (deg === 1) {
                wires = wires.filter(w => !conn.includes(w));
                components = components.filter(c => c !== j);
                changed = true;
            } else if (deg === 2) {
                const [w1, w2] = conn;
                const a = otherEnd(w1, j);
                const b = otherEnd(w2, j);
                const mergedVerts = mergeCollinear(buildWireVertices(a, [], b) || []);
                const newWire = {
                    from: a,
                    to: b,
                    vertices: mergedVerts,
                    v: (w1.v || 0)
                };
                wires = wires.filter(w => w !== w1 && w !== w2);
                wires.push(newWire);
                components = components.filter(c => c !== j);
                changed = true;
            }
        }
    } while (changed);
}

function drawWirePolyline(pts, color, width, dashed) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    if (dashed) ctx.setLineDash(WIRE_DASH_PATTERN);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // draw small dots at corners
    ctx.fillStyle = '#777777';
    for (let i = 1; i < pts.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, WIRE_CORNER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWires() {
    wires.forEach(w => {
        const pts = getWirePolyline(w);
        const v   = w.v || 0;

        const isSelected = (w === selectedWire);
        const isHover    = (w === hoverWire);
        const width      = isSelected ? WIRE_WIDTH_SELECTED : (isHover ? WIRE_WIDTH_HOVER : WIRE_WIDTH_DEFAULT);

        // outline for stability (no flashing)
        drawWirePolyline(pts, '#1f2937', width + WIRE_OUTLINE_PADDING, false);

        let color = '#3aa86b';
        if (v > 0.01) color = '#34d399';
        else if (v < -0.01) color = '#f87171';
        color = isSelected ? '#facc15' : color;

        drawWirePolyline(pts, color, width, false);
    });

    if (activeWire && !activeWire.toPin) {
        const fromPos = activeWire.fromPin.c.getPinPos(activeWire.fromPin.p);
        const mousePt = activeWire.currentPoint || fromPos;
        const dir = getPinDirection(activeWire.fromPin.c, activeWire.fromPin.p);
        const pts = routeManhattan(fromPos, activeWire.vertices || [], mousePt, dir);
        drawWirePolyline(pts, '#ffffff', ACTIVE_WIRE_WIDTH, true);
    }
}

function draw() {
    if (!ctx || !canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(viewOffsetX, viewOffsetY);

    drawGrid();
    drawWires();
    components.forEach(c => c.draw(ctx, viewMode));
    components.forEach(c => {
        if (typeof c.drawLabels === 'function') {
            c.drawLabels(ctx, viewMode);
        }
    });

    // selection marquee
    if (selectionBox) {
        const x1 = Math.min(selectionBox.start.x, selectionBox.current.x);
        const y1 = Math.min(selectionBox.start.y, selectionBox.current.y);
        const w  = Math.abs(selectionBox.start.x - selectionBox.current.x);
        const h  = Math.abs(selectionBox.start.y - selectionBox.current.y);
        ctx.strokeStyle = '#60a5fa';
        ctx.fillStyle   = 'rgba(96,165,250,0.15)';
        ctx.lineWidth   = 1;
        ctx.setLineDash(MARQUEE_DASH_PATTERN);
        ctx.strokeRect(x1, y1, w, h);
        ctx.setLineDash([]);
        ctx.fillRect(x1, y1, w, h);
    }

    // outlines for selection group (redundant safety)
    selectionGroup.forEach(c => {
        const b = c.getBoundingBox();
        ctx.save();
        ctx.setLineDash(SELECTION_DASH_PATTERN);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth   = 1;
        ctx.strokeRect(
            b.x1 - SELECTION_PADDING,
            b.y1 - SELECTION_PADDING,
            (b.x2 - b.x1) + SELECTION_PADDING * 2,
            (b.y2 - b.y1) + SELECTION_PADDING * 2
        );
        ctx.restore();
    });

    ctx.restore();
}

function drawScope() {
    if (!scopeCanvas || !scopeCtx) return;
    const scope = activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    if (!scope) return;

    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    scopeCtx.clearRect(0, 0, w, h);

    // grid
    scopeCtx.strokeStyle = '#333333';
    scopeCtx.lineWidth   = 1;
    scopeCtx.beginPath();
    for (let i = 1; i < 10; i++) {
        const x = i * (w / 10);
        const y = i * (h / 10);
        scopeCtx.moveTo(x, 0); scopeCtx.lineTo(x, h);
        scopeCtx.moveTo(0, y); scopeCtx.lineTo(w, y);
    }
    scopeCtx.stroke();

    // 0 V reference line
    const midY = h / 2;
    scopeCtx.strokeStyle = '#888888';
    scopeCtx.lineWidth   = 1.5;
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, midY);
    scopeCtx.lineTo(w, midY);
    scopeCtx.stroke();
    scopeCtx.fillStyle = '#9ca3af';
    scopeCtx.font      = '10px monospace';
    scopeCtx.textAlign = 'left';
    scopeCtx.fillText('0 V', 4, midY - 4);

    const pixelsPerDiv = h / 10;
    const vDiv1 = parseUnit(scope.props.VDiv1 || '1');
    const vDiv2 = parseUnit(scope.props.VDiv2 || scope.props.VDiv1 || '1');
    const scaleCh1 = pixelsPerDiv / (vDiv1 || 1);
    const scaleCh2 = pixelsPerDiv / (vDiv2 || 1);

    const startIdx = (scope.head + 1) % HISTORY_SIZE;

    function renderChannel(chData, color, scaleY) {
        scopeCtx.strokeStyle = color;
        scopeCtx.lineWidth   = 2;
        scopeCtx.beginPath();
        for (let x = 0; x < w; x++) {
            const t   = x / w;
            const off = Math.floor(t * HISTORY_SIZE);
            const idx = (startIdx + off) % HISTORY_SIZE;
            const v   = chData[idx];
            const y   = midY - v * scaleY;
            if (x === 0) scopeCtx.moveTo(x, y);
            else         scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();
    }

    renderChannel(scope.data.ch1, '#fbbf24', scaleCh1);
    renderChannel(scope.data.ch2, '#22d3ee', scaleCh2);

    // keep cursor Δt / ΔV working even when the sim is paused
    updateCursors();
}

/* ---------- UI HELPERS / MODES ---------- */

function resize() {
    if (!canvas) return;
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    // keep initial view centered
    if (viewOffsetX === 0 && viewOffsetY === 0) {
        viewOffsetX = (canvas.width  / (2 * zoom) - BOARD_W / 2);
        viewOffsetY = (canvas.height / (2 * zoom) - BOARD_H / 2);
    }
    clampView();

    const scopeContainer = document.getElementById('scope-container');
    if (scopeContainer && scopeCanvas) {
        scopeCanvas.width  = scopeContainer.clientWidth;
        scopeCanvas.height = scopeContainer.clientHeight;
    }
}

function createToolIcon(selector, ComponentClass, setupFn, offsetY = 0) {
    const btn = document.querySelector(selector);
    if (!btn) return;

    const oldIcon = btn.querySelector('i');
    if (oldIcon) oldIcon.style.display = 'none';

    let canvas = btn.querySelector('canvas.tool-icon');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'tool-icon';
        canvas.width = 56;
        canvas.height = 42;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto 4px';
        btn.insertBefore(canvas, btn.firstChild);
    }
    const ictx = canvas.getContext('2d');
    ictx.clearRect(0, 0, canvas.width, canvas.height);

    const c = new ComponentClass(0, 0);
    c.x = 0;
    c.y = 0;
    c.rotation = 0;
    c.mirrorX = false;
    if (setupFn) setupFn(c);

    const pad = 18;
    const targetW = (c.w || 40) + pad;
    const targetH = (c.h || 40) + pad;
    const scale = Math.min((canvas.width - 6) / targetW, (canvas.height - 6) / targetH, 1);

    ictx.save();
    ictx.translate(canvas.width / 2, canvas.height / 2 + offsetY);
    ictx.scale(scale, scale);

    c.drawPhys(ictx);

    const skipPins = (c instanceof MOSFET);
    if (!skipPins && Array.isArray(c.pins)) {
        ictx.strokeStyle = '#9ca3af';
        ictx.lineWidth = 1.2;
        c.pins.forEach(p => {
            const pos = c.localToWorld(p.x, p.y);
            ictx.beginPath();
            ictx.moveTo(pos.x, pos.y);
            ictx.lineTo(pos.x, pos.y + GRID * 0.25);
            ictx.stroke();
            ictx.fillStyle = '#e5e7eb';
            ictx.beginPath();
            ictx.arc(pos.x, pos.y, 2.1, 0, Math.PI * 2);
            ictx.fill();
        });
    }

    ictx.restore();
}

function renderToolIcons() {
    createToolIcon("button[onclick=\"selectTool('resistor', this)\"]", Resistor);
    createToolIcon("button[onclick=\"selectTool('capacitor', this)\"]", Capacitor);
    createToolIcon("button[onclick=\"selectTool('potentiometer', this)\"]", Potentiometer, p => {
        p.props.Turn = '65';
    });
    createToolIcon("button[onclick=\"selectTool('mosfet', this)\"]", MOSFET, m => {
        m.props.Type = 'NMOS';
    });
    createToolIcon("button[onclick=\"selectTool('spst', this)\"]", SPSTSwitch);
    createToolIcon("button[onclick=\"selectTool('spdt', this)\"]", SPDTSwitch);
    createToolIcon("button[onclick=\"selectTool('dpdt', this)\"]", DPDT);
    createToolIcon("button[onclick=\"selectTool('lf412', this)\"]", LF412);
    createToolIcon("button[onclick=\"selectTool('voltageSource', this)\"]", VoltageSource);
    createToolIcon("button[onclick=\"selectTool('funcGen', this)\"]", FunctionGenerator, undefined, -6);
    createToolIcon("button[onclick=\"selectTool('ground', this)\"]", Ground);
    createToolIcon("button[onclick=\"selectTool('oscilloscope', this)\"]", Oscilloscope);
    createToolIcon("button[onclick=\"selectTool('led', this)\"]", LED, l => {
        l.props.Color = 'red';
        l._lastI = parseUnit(l.props.If || '10m'); // show lit icon
    });
}

function alignScopeButton() {
    const scopeBtn = document.querySelector("button[onclick=\"selectTool('oscilloscope', this)\"]");
    if (!scopeBtn) return;
    scopeBtn.style.display = 'flex';
    scopeBtn.style.flexDirection = 'column';
    scopeBtn.style.alignItems = 'center';
    scopeBtn.style.justifyContent = 'center';
    scopeBtn.style.gap = '6px';

    const icon = scopeBtn.querySelector('i');
    if (icon) icon.style.display = 'none';

    const label = scopeBtn.querySelector('span');
    if (label) {
        label.textContent = 'Dual Scope';
        label.style.fontSize = '10px';
        label.style.textAlign = 'center';
    }
}

function setMode(mode) {
    // legacy shim: we auto-detect actions, so this simply clears selection
    setSelectedComponent(null);
    selectionGroup    = [];
    selectedWire      = null;
    activeWire        = null;
    hoverWire         = null;
    currentTool       = null;
    updateProps();
}

// Tool selection (resistor, capacitor, funcGen, etc.)
function clearToolSelection() {
    currentTool = null;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
}

function selectTool(type, btn) {
    if (currentTool === type) {
        clearToolSelection();
        return;
    }
    currentTool = type;

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    if (btn) btn.classList.add('active');
}

function setSelectedComponent(c) {
    selectedComponent = c;
    selectionGroup    = c ? [c] : [];
    selectedWire      = null;
}

function rotateSelected() {
    const targets = selectionGroup.length ? selectionGroup : (selectedComponent ? [selectedComponent] : []);
    targets.forEach(c => {
        c.rotation = (c.rotation + 1) % 4;
        rerouteWiresForComponent(c);
    });
    cleanupJunctions();
    markStateDirty();
}

function mirrorSelected() {
    const targets = selectionGroup.length ? selectionGroup
                   : (selectedComponent ? [selectedComponent] : []);
    targets.forEach(c => {
        c.mirrorX = !c.mirrorX;
        rerouteWiresForComponent(c);
    });
    cleanupJunctions();
    markStateDirty();
}

function rerouteWiresForComponent(c) {
    wires.forEach(w => {
        if (w.from.c !== c && w.to.c !== c) return;

        const startPos = w.from.c.getPinPos(w.from.p);
        const endPos   = w.to.c.getPinPos(w.to.p);
        const mids     = (w.vertices || []).map(v => snapToBoardPoint(v.x, v.y));
        const startDir = (w.from.c === c) ? getPinDirection(w.from.c, w.from.p) : null;
        const endDir   = (w.to.c === c) ? getPinDirection(w.to.c, w.to.p) : null;

        const bridge = (a, b, dirHint) => {
            const pts = [];
            if (a.x !== b.x && a.y !== b.y) {
                let elbow;
                if (dirHint && dirHint.x) elbow = { x: b.x, y: a.y };
                else if (dirHint && dirHint.y) elbow = { x: a.x, y: b.y };
                else {
                    elbow = (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y))
                        ? { x: b.x, y: a.y }
                        : { x: a.x, y: b.y };
                }
                pts.push(snapToBoardPoint(elbow.x, elbow.y));
            }
            pts.push(snapToBoardPoint(b.x, b.y));
            return pts;
        };

        let poly = [startPos];
        if (mids.length) {
            poly.push(...bridge(startPos, mids[0], startDir));
            for (let i = 1; i < mids.length; i++) {
                const prev = mids[i - 1];
                const curr = mids[i];
                if (prev.x !== curr.x && prev.y !== curr.y) {
                    poly.push(snapToBoardPoint(curr.x, prev.y));
                }
                poly.push(curr);
            }
            poly.push(...bridge(mids[mids.length - 1], endPos, endDir));
        } else {
            poly.push(...bridge(startPos, endPos, startDir || endDir));
        }

        poly = mergeCollinear(poly);
        w.vertices = poly.slice(1, Math.max(1, poly.length - 1));
    });
}

function pinConnected(comp, pinIdx) {
    return wires.some(w =>
        (w.from.c === comp && w.from.p === pinIdx) ||
        (w.to.c   === comp && w.to.p   === pinIdx)
    );
}

// Delete selected component or wire, or cancel active wire
function deleteSelected() {
    const compsToRemove = selectionGroup.length ? selectionGroup : (selectedComponent ? [selectedComponent] : []);

    if (compsToRemove.length) {
        wires = wires.filter(
            w => !compsToRemove.includes(w.from.c) && !compsToRemove.includes(w.to.c)
        );
        components = components.filter(c => !compsToRemove.includes(c));
        setSelectedComponent(null);
    } else if (selectedWire || hoverWire) {
        const target = selectedWire || hoverWire;
        wires = wires.filter(w => w !== target);
        selectedWire = null;
        hoverWire = null;
    }
    activeWire = null;
    pruneFloatingJunctions();
    cleanupJunctions();
    draggingWire      = null;
    draggingComponent = null;
    wireDragMoved     = false;
    wireDragStart     = null;
    hoverWire         = null;
    markStateDirty();
    updateProps();
}

/* ---------- PROPERTIES PANEL ---------- */

function updateProps() {
    const panel = document.getElementById('properties-panel');
    const dyn   = document.getElementById('dynamic-props');
    const title = document.getElementById('prop-title');
    if (!panel || !dyn || !title) return;

    dyn.innerHTML = '';

    if (selectedWire) {
        panel.classList.remove('hidden');
        title.innerText = 'Wire';

        const btn = document.createElement('button');
        btn.className = 'w-full bg-red-700 text-white rounded py-1 mb-2 text-xs';
        btn.innerHTML = '<i class="fas fa-trash"></i> Delete Wire';
        btn.onclick = deleteSelected;
        dyn.appendChild(btn);
        return;
    }

    if (!selectedComponent) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    title.innerText = selectedComponent.constructor.name;

    if (selectedComponent instanceof Oscilloscope) {
        const btn = document.createElement('button');
        btn.className = 'w-full bg-green-700 text-white rounded py-1 mb-2 text-xs';
        btn.innerHTML = '<i class="fas fa-expand"></i> Open Full Screen';
        btn.onclick = openScope;
        dyn.appendChild(btn);
    }

    if (selectedComponent instanceof MOSFET) {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-gray-700/50 p-2 rounded mb-2';
        row.innerHTML = '<span class="text-[10px] text-gray-300">Type</span>';
        const btn = document.createElement('button');
        btn.className = 'bg-blue-600 px-2 py-1 text-xs rounded text-white w-20';
        btn.innerText = selectedComponent.props.Type;
        btn.onclick = () => {
            const p = selectedComponent.props;
            if (p.Type === 'NMOS') {
                p.Type   = 'PMOS';
                p.Kp     = '40u';
                p.Vth    = '-0.8';
                p.Gamma  = '0.4';
                p.Phi    = '0.8';
                p.Lambda = '0.2';
            } else {
                p.Type   = 'NMOS';
                p.Kp     = '140u';
                p.Vth    = '0.7';
                p.Gamma  = '0.45';
                p.Phi    = '0.9';
                p.Lambda = '0.1';
            }
            markStateDirty();
            updateProps();
        };
        row.appendChild(btn);
        dyn.appendChild(row);

        const advRow = document.createElement('div');
        advRow.className = 'flex justify-end mb-1';
        const advBtn = document.createElement('button');
        advBtn.className = 'text-[10px] text-gray-400 hover:text-white';
        advBtn.innerHTML = '<i class="fas fa-cog"></i> Advanced';
        advBtn.onclick = () => {
            selectedComponent.showAdv = !selectedComponent.showAdv;
            updateProps();
        };
        advRow.appendChild(advBtn);
        dyn.appendChild(advRow);
    }

    const comp = selectedComponent;
    for (const key in comp.props) {
        if (key === 'Type') continue;
        if (comp instanceof Oscilloscope &&
            ['TimeDiv', 'VDiv1', 'VDiv2'].includes(key)) {
            continue;
        }
        if (comp instanceof MOSFET &&
            ['Lambda', 'Gamma', 'Phi', 'Kp'].includes(key) &&
            !comp.showAdv) {
            continue;
        }

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-gray-700/50 p-2 rounded';

        const label = document.createElement('span');
        label.className = 'text-[10px] text-gray-300 font-mono';
        label.innerText = key;
        row.appendChild(label);

        if (key === 'TimeDiv') {
            const sel = document.createElement('select');
            sel.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-right text-xs';
            ['10u', '100u', '1m', '10m'].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.innerText = opt + 's/div';
                if (comp.props[key] === opt) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = e => { comp.props[key] = e.target.value; markStateDirty(); };
            row.appendChild(sel);
        } else if (key === 'VDiv1' || key === 'VDiv2') {
            label.innerText = key + ' (V/div)';
            const sel = document.createElement('select');
            sel.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-right text-xs';
            ['50m', '100m', '200m', '500m', '1', '2', '5', '10'].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.innerText = opt + ' V/div';
                if (comp.props[key] === opt) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = e => { comp.props[key] = e.target.value; markStateDirty(); };
            row.appendChild(sel);
        } else if (comp instanceof LED && key === 'Color') {
            const sel = document.createElement('select');
            sel.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-xs';
            ['red','green','blue','white'].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.innerText = opt.toUpperCase();
                if ((comp.props[key] || '').toLowerCase() === opt) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = e => { comp.props[key] = e.target.value; markStateDirty(); };
            row.appendChild(sel);
        } else if (comp instanceof FunctionGenerator && key === 'Wave') {
            const sel = document.createElement('select');
            sel.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-xs';
            ['sine','square','triangle'].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.innerText = opt.toUpperCase();
                if ((comp.props[key] || '').toLowerCase() === opt) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = e => { comp.props[key] = e.target.value; markStateDirty(); };
            row.appendChild(sel);
        } else if (comp instanceof Potentiometer && key === 'Turn') {
            row.className = 'bg-gray-700/50 p-2 rounded';
            row.innerHTML = '';

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-1';
            const name = document.createElement('span');
            name.className = 'text-[10px] text-gray-300 font-mono';
            name.innerText = 'Turn';
            const pct = document.createElement('span');
            pct.className = 'text-xs text-gray-100 font-mono';
            header.appendChild(name);
            header.appendChild(pct);
            row.appendChild(header);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '100';
            slider.step = '1';
            slider.value = comp.props[key];
            slider.className = 'w-full accent-blue-500';
            row.appendChild(slider);

            const split = document.createElement('div');
            split.className = 'text-[10px] text-gray-300 text-right font-mono mt-1';
            row.appendChild(split);

            const updateReadout = (dirty = true) => {
                const pctVal = Math.round(parseFloat(slider.value || '0'));
                pct.innerText = pctVal + '%';
                comp.props[key] = String(pctVal);

                const total = parseUnit(comp.props.R || '0');
                if (total > 0) {
                    const frac = Math.min(1, Math.max(0, pctVal / 100));
                    const minLeg = 1e-3;
                    const r1 = Math.max(minLeg, total * frac);
                    const r2 = Math.max(minLeg, total * (1 - frac));
                    split.innerText = `1-2: ${formatUnit(r1, 'Ω')}  |  2-3: ${formatUnit(r2, 'Ω')}`;
                } else {
                    split.innerText = 'R1/R2 open (set R > 0)';
                }
                if (dirty) markStateDirty();
            };
            slider.oninput = () => updateReadout(true);
            slider.onchange = () => updateReadout(true);
            updateReadout(false);
        } else {
            const inp = document.createElement('input');
            inp.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-right text-xs';
            inp.value = comp.props[key];
            inp.onchange = e => {
                comp.props[key] = e.target.value;
                if (comp instanceof Potentiometer) updateProps();
                markStateDirty();
            };
            row.appendChild(inp);
        }

        dyn.appendChild(row);
    }
}

/* ---------- MOUSE & KEYBOARD ---------- */

const TOOL_COMPONENTS = {
    resistor: Resistor,
    capacitor: Capacitor,
    potentiometer: Potentiometer,
    mosfet: MOSFET,
    lf412: LF412,
    spst: SPSTSwitch,
    spdt: SPDTSwitch,
    dpdt: DPDT,
    voltageSource: VoltageSource,
    funcGen: FunctionGenerator,
    ground: Ground,
    oscilloscope: Oscilloscope,
    led: LED
};

const TEMPLATES = {
    'rc-lowpass': {
        placements: [
            { key: 'fg', type: 'funcGen', x: 200, y: 200, props: { Vpp: '2', Offset: '0', Freq: '1k' } },
            { key: 'r', type: 'resistor', x: 320, y: 200, props: { R: '10k' } },
            { key: 'c', type: 'capacitor', x: 440, y: 200, props: { C: '10n' } },
            { key: 'g', type: 'ground', x: 440, y: 260 }
        ],
        wires: [
            ['fg', 0, 'r', 0],
            ['r', 1, 'c', 0],
            ['c', 1, 'g', 0]
        ]
    },
    'rc-highpass': {
        placements: [
            { key: 'fg', type: 'funcGen', x: 200, y: 320, props: { Vpp: '2', Offset: '0', Freq: '1k' } },
            { key: 'c', type: 'capacitor', x: 320, y: 320, props: { C: '10n' } },
            { key: 'r', type: 'resistor', x: 440, y: 320, props: { R: '10k' } },
            { key: 'g', type: 'ground', x: 440, y: 380 }
        ],
        wires: [
            ['fg', 0, 'c', 0],
            ['c', 1, 'r', 0],
            ['r', 1, 'g', 0]
        ]
    },
    'opamp-inverting': {
        placements: [
            { key: 'fg', type: 'funcGen', x: 200, y: 480, props: { Vpp: '2', Offset: '0', Freq: '1k' } },
            { key: 'rIn', type: 'resistor', x: 320, y: 480, props: { R: '10k' } },
            { key: 'rFb', type: 'resistor', x: 480, y: 420, props: { R: '20k' } },
            { key: 'op', type: 'lf412', x: 520, y: 480 },
            { key: 'g', type: 'ground', x: 360, y: 540 }
        ],
        wires: [
            ['fg', 0, 'rIn', 0],
            ['rIn', 1, 'op', 1],
            ['op', 0, 'rFb', 0],
            ['rFb', 1, 'op', 1],
            ['op', 2, 'g', 0],
            ['op', 3, 'g', 0]
        ]
    },
    'opamp-noninverting': {
        placements: [
            { key: 'fg', type: 'funcGen', x: 200, y: 640, props: { Vpp: '2', Offset: '0', Freq: '1k' } },
            { key: 'r1', type: 'resistor', x: 360, y: 660, props: { R: '10k' } },
            { key: 'r2', type: 'resistor', x: 360, y: 620, props: { R: '10k' } },
            { key: 'op', type: 'lf412', x: 520, y: 640 },
            { key: 'g', type: 'ground', x: 360, y: 700 }
        ],
        wires: [
            ['fg', 0, 'op', 2],
            ['op', 0, 'r1', 0],
            ['r1', 1, 'op', 1],
            ['r2', 0, 'op', 1],
            ['r2', 1, 'g', 0],
            ['op', 3, 'g', 0]
        ]
    }
};

function getComponentTypeId(comp) {
    for (const [key, ctor] of Object.entries(TOOL_COMPONENTS)) {
        if (comp instanceof ctor) return key;
    }
    return null;
}

function serializeState() {
    const payload = {
        schema: SAVE_SCHEMA_ID,
        version: SAVE_SCHEMA_VERSION,
        metadata: {
            savedAt: new Date().toISOString(),
            viewMode,
            zoom,
            viewOffset: { x: viewOffsetX, y: viewOffsetY }
        },
        components: components.map(c => ({
            id: c.id,
            type: getComponentTypeId(c),
            x: c.x,
            y: c.y,
            rotation: c.rotation,
            mirrorX: !!c.mirrorX,
            props: { ...c.props }
        })).filter(entry => entry.type),
        wires: wires.map(w => ({
            from: { id: w.from?.c?.id, p: w.from?.p },
            to:   { id: w.to?.c?.id,   p: w.to?.p },
            vertices: (w.vertices || []).map(v => ({ x: v.x, y: v.y }))
        })).filter(w => w.from.id && w.to.id)
    };
    return payload;
}

function applySerializedState(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid save data');
    if (data.schema !== SAVE_SCHEMA_ID) throw new Error('File is not a Circuit Forge save.');
    if (typeof data.version !== 'number') throw new Error('Missing save version.');
    if (data.version > SAVE_SCHEMA_VERSION) {
        throw new Error('Save file requires a newer version of Circuit Forge.');
    }

    isRestoringState = true;
    try {
        const created = [];
        (data.components || []).forEach(entry => {
            const Ctor = TOOL_COMPONENTS[entry.type];
            if (!Ctor) return;
            const c = new Ctor(entry.x ?? 0, entry.y ?? 0);
            c.id = entry.id || c.id;
            c.rotation = entry.rotation ?? 0;
            c.mirrorX = !!entry.mirrorX;
            if (entry.props && typeof entry.props === 'object') {
                c.props = { ...c.props, ...entry.props };
            }
            created.push(c);
        });

        const idMap = new Map(created.map(c => [c.id, c]));
        const restoredWires = [];
        (data.wires || []).forEach(w => {
            const fromComp = idMap.get(w.from?.id);
            const toComp   = idMap.get(w.to?.id);
            if (!fromComp || !toComp) return;
            restoredWires.push({
                from: { c: fromComp, p: w.from.p ?? 0 },
                to:   { c: toComp,   p: w.to.p   ?? 0 },
                vertices: Array.isArray(w.vertices)
                    ? w.vertices.map(v => snapToBoardPoint(v.x ?? 0, v.y ?? 0))
                    : [],
                v: 0
            });
        });

        components = created;
        wires = restoredWires;
        time = 0;
        simError = null;
        isPaused = true;
        setSelectedComponent(null);
        selectedWire = null;
        selectionGroup = [];
        activeWire = null;

        if (data.metadata) {
            if (data.metadata.viewMode) viewMode = data.metadata.viewMode;
            if (typeof data.metadata.zoom === 'number') {
                zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, data.metadata.zoom));
            }
            if (data.metadata.viewOffset) {
                viewOffsetX = data.metadata.viewOffset.x || 0;
                viewOffsetY = data.metadata.viewOffset.y || 0;
                clampView();
            }
        }

        const viewLabel = document.getElementById('view-label');
        if (viewLabel) {
            viewLabel.innerText = (viewMode === 'physical') ? 'Breadboard View'
                                                          : 'Schematic View';
        }

        cleanupJunctions();
        updateProps();
        updatePlayPauseButton();
    } finally {
        isRestoringState = false;
    }
}

function saveStateToLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    const payload = serializeState();
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('Failed to persist circuit state', err);
    }
}

function markStateDirty() {
    if (isRestoringState) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveStateToLocalStorage, AUTOSAVE_DELAY_MS);
}

function loadStateFromLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        applySerializedState(data);
    } catch (err) {
        console.warn('Unable to restore saved circuit', err);
    }
}

function downloadCircuitJSON() {
    const payload = serializeState();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuitforge-save.json';
    a.click();
    URL.revokeObjectURL(url);
}

function handleImportJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            applySerializedState(data);
            saveStateToLocalStorage();
        } catch (err) {
            alert('Could not import file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function triggerImportDialog() {
    const input = document.getElementById('import-json-input');
    if (!input) return;
    input.value = '';
    input.click();
}

function createComponentFromTool(tool, snapPoint) {
    const ComponentCtor = TOOL_COMPONENTS[tool];
    if (!ComponentCtor) return null;
    return new ComponentCtor(snapPoint.x, snapPoint.y);
}

function insertTemplate(key) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    const created = new Map();
    tpl.placements.forEach(entry => {
        const ctor = TOOL_COMPONENTS[entry.type];
        if (!ctor) return;
        const c = new ctor(entry.x, entry.y);
        if (entry.props) Object.assign(c.props || {}, entry.props);
        components.push(c);
        created.set(entry.key, c);
    });
    tpl.wires.forEach(w => {
        const [aKey, aPin, bKey, bPin] = w;
        const a = created.get(aKey);
        const b = created.get(bKey);
        if (a && b) {
            wires.push({ from: { c: a, p: aPin }, to: { c: b, p: bPin }, vertices: [], v: 0 });
        }
    });
    markStateDirty();
    updateProps();
}

function attachDragListeners() {
    if (dragListenersAttached) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    dragListenersAttached = true;
}

function detachDragListeners() {
    if (!dragListenersAttached) return;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    dragListenersAttached = false;
}

function canvasPoint(e) {
    const p = screenToWorld(e.clientX, e.clientY);
    return { x: p.x, y: p.y };
}

// find a pin under mouse
function findPinAt(m) {
    for (const c of components) {
        for (let i = 0; i < c.pins.length; i++) {
            const p = c.getPinPos(i);
            if (Math.hypot(m.x - p.x, m.y - p.y) < PIN_HIT_RADIUS) {
                return { c, p: i };
            }
        }
    }
    return null;
}

// pick nearest wire to mouse
function pickWireAt(m, maxDist = WIRE_HIT_DISTANCE) {
    let bestWire = null;
    let bestDist = maxDist;
    wires.forEach(w => {
        const pts = getWirePolyline(w);
        for (let i = 0; i < pts.length - 1; i++) {
            const d = distToSegment(m, pts[i], pts[i+1]);
            if (d < bestDist) {
                bestDist = d;
                bestWire = w;
            }
        }
    });
    return bestWire;
}

function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY || e.wheelDelta || 0;
    const factor = delta > 0 ? ZOOM_IN_STEP : ZOOM_OUT_STEP;

    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    clampView();
    markStateDirty();
}

function autoConnectPins(component) {
    components.forEach(other => {
        if (other === component) return;
        component.pins.forEach((_, i) => {
            const p1Raw = component.getPinPos(i);
            const p1 = snapToBoardPoint(p1Raw.x, p1Raw.y);
            other.pins.forEach((__, j) => {
                const p2Raw = other.getPinPos(j);
                const p2 = snapToBoardPoint(p2Raw.x, p2Raw.y);
                if (p1.x === p2.x && p1.y === p2.y) {
                    const exists = wires.some(w =>
                        (w.from.c === component && w.from.p === i &&
                         w.to.c   === other     && w.to.p   === j) ||
                        (w.to.c   === component && w.to.p   === i &&
                         w.from.c === other     && w.from.p === j)
                    );
                    if (!exists) {
                        wires.push({
                            from: { c: component, p: i },
                            to:   { c: other,     p: j },
                            vertices: [],
                            v:    0
                        });
                        markStateDirty();
                    }
                }
            });
        });
    });
}

function onDown(e) {
    // ignore clicks inside UI inputs
    if (isEditableElement(e.target)) {
        return;
    }

    const m = canvasPoint(e);

    if (e.button === 1) { // middle mouse
        isPanning = true;
        wireDragStart = m;
        attachDragListeners();
        return;
    }

    // right-click -> deselect / cancel
    if (e.button === 2) {
        if (currentTool) {
            clearToolSelection();
        } else if (activeWire) {
            activeWire = null;
        }
        draggingComponent = null;
        draggingWire      = null;
        wireDragMoved     = false;
        wireDragStart     = null;
        updateProps(); // keep current selection
        return;
    }

    clickStart = m;
    clickCandidate = null;

    const pinHit  = findPinAt(m);
    const wireHit = pickWireAt(m, WIRE_HIT_DISTANCE);
    let compHit = false;
    for (const c of components) {
        if (c.isInside(m.x, m.y)) { compHit = true; break; }
    }

    // start selection marquee if empty area and not wiring/dragging
    if (!activeWire && !pinHit && !wireHit && !compHit && !currentTool) {
        selectionBox = { start: m, current: m };
        attachDragListeners();
    }

    // 1) If clicking a pin: start / extend / finish a wire
    if (pinHit) {
        if (activeWire && !activeWire.toPin) {
            // finish wire on second pin
            if (!(pinHit.c === activeWire.fromPin.c && pinHit.p === activeWire.fromPin.p)) {
                const from = activeWire.fromPin;
                const to   = pinHit;
                const vertices = buildWireVertices(from, activeWire.vertices, to);
                const exists = wires.some(w =>
                    (w.from.c === from.c && w.from.p === from.p &&
                     w.to.c   === to.c   && w.to.p   === to.p) ||
                    (w.to.c   === from.c && w.to.p   === from.p &&
                     w.from.c === to.c   && w.from.p === to.p)
                );

                if (!exists) {
                    wires.push({
                        from,
                        to,
                        vertices,
                        v: 0
                    });
                    markStateDirty();
                }
            }
            activeWire = null;
            selectedWire = null;
            setSelectedComponent(null);
            updateProps();
            return;
        } else {
            // start a new wire from this pin
            activeWire = {
                fromPin: pinHit,
                vertices: [],
                currentPoint: pinHit.c.getPinPos(pinHit.p)
            };
            selectedWire      = null;
            setSelectedComponent(null);
            updateProps();
            return;
        }
    }

    // 2) If clicking a wire
    if (wireHit) {
        // connect active wire into this wire by creating a junction
        if (activeWire && !activeWire.toPin) {
            const junction = splitWireAtPoint(wireHit, m);
            const from = activeWire.fromPin;
            const to   = { c: junction, p: 0 };
            const vertices = buildWireVertices(from, activeWire.vertices, to);
            if (vertices.length || from.c !== to.c || from.p !== to.p) {
                wires.push({ from, to, vertices, v: 0 });
                markStateDirty();
            }
            activeWire = null;
            selectedWire = null;
            setSelectedComponent(null);
            pruneFloatingJunctions();
            cleanupJunctions();
            updateProps();
            return;
        }

        draggingWire = {
            wire: wireHit,
            start: m,
            verts: (wireHit.vertices || []).map(v => ({ ...v })),
            wasSelected: (selectedWire === wireHit)
        };
        wireDragStart = m;
        wireDragMoved = false;
        selectedWire      = wireHit;
        setSelectedComponent(null);
        activeWire        = null;
        attachDragListeners();
        updateProps();
        return;
    }

    // 3) Check components (topmost)
    for (let i = components.length - 1; i >= 0; i--) {
        const c = components[i];
        if (c.isInside(m.x, m.y)) {
            currentTool = null;
            if (e.shiftKey) {
                const idx = selectionGroup.indexOf(c);
                if (idx >= 0) selectionGroup.splice(idx, 1);
                else selectionGroup.push(c);
                selectedComponent = selectionGroup[0] || null;
            } else {
                if (!selectionGroup.includes(c)) selectionGroup = [c];
                selectedComponent = c;
            }
            selectedWire      = null;
            activeWire        = null;
            const targets = selectionGroup.length ? selectionGroup : [c];
            clickCandidate = {
                objs: targets.map(obj => ({ obj, offsetX: m.x - obj.x, offsetY: m.y - obj.y }))
            };
            attachDragListeners();
            updateProps();
            return;
        }
    }

    // 5) If we are in the middle of drawing a wire and clicked empty board -> add corner
    if (activeWire && !pinHit) {
        const pt = snapToBoardPoint(m.x, m.y);
        const last = activeWire.vertices[activeWire.vertices.length - 1];
        if (!last || last.x !== pt.x || last.y !== pt.y) {
            activeWire.vertices.push(pt);
            activeWire.currentPoint = pt;
        }
        return;
    }

    // 4) Placing new component if a tool is selected
    if (currentTool) {
        const snap = snapToBoardPoint(m.x, m.y);
        const c = createComponentFromTool(currentTool, snap);
        if (c) {
            components.push(c);
            setSelectedComponent(c);
            selectedWire      = null;
            activeWire        = null;
            // keep tool active for repeated placement
            markStateDirty();
            updateProps();
        }
        return;
    }

    // 6) Empty area -> clear selection
    setSelectedComponent(null);
    selectedWire      = null;
    activeWire        = null;
    updateProps();
}


function onMove(e) {
    const m = canvasPoint(e);

    if (isPanning && wireDragStart) {
        const dx = (e.movementX || 0) / zoom;
        const dy = (e.movementY || 0) / zoom;
        viewOffsetX += dx;
        viewOffsetY += dy;
        // clamp to board with margin
        clampView();
        markStateDirty();
        return;
    }

    if (!draggingComponent && clickCandidate) {
        const d = Math.hypot(m.x - clickStart.x, m.y - clickStart.y);
        if (d > DRAG_THRESHOLD) {
            draggingComponent = clickCandidate;
            clickCandidate = null;
        }
    }

    if (draggingComponent) {
        draggingComponent.objs.forEach(entry => {
            const c = entry.obj;
            const nx = m.x - entry.offsetX;
            const ny = m.y - entry.offsetY;
            const snap = snapToBoardPoint(nx, ny);
            c.x = snap.x;
            c.y = snap.y;
            rerouteWiresForComponent(c);
        });
    }

    if (selectionBox) {
        selectionBox.current = m;
        return;
    }

    if (draggingWire) {
        const dx = m.x - wireDragStart.x;
        const dy = m.y - wireDragStart.y;
        const moved = Math.hypot(dx, dy) > 0;
        wireDragMoved = wireDragMoved || moved;

        const newVerts = draggingWire.verts.map(v =>
            snapToBoardPoint(v.x + dx, v.y + dy)
        );
        draggingWire.wire.vertices = newVerts;
    }

    if (activeWire && !activeWire.toPin) {
        activeWire.currentPoint = snapToBoardPoint(m.x, m.y);
    }

    if (!draggingComponent && !draggingWire && !selectionBox && !isPanning) {
        hoverWire = pickWireAt(m, WIRE_HIT_DISTANCE);
    } else {
        hoverWire = null;
    }
}

function onCanvasMove(e) {
    if (draggingComponent || draggingWire || isPanning || selectionBox) return;
    onMove(e);
}

function onUp(e) {
    let handled = false;

    if (isPanning) {
        isPanning = false;
        wireDragStart = null;
        handled = true;
    }

    if (selectionBox) {
        const rect = {
            x1: Math.min(selectionBox.start.x, selectionBox.current.x),
            y1: Math.min(selectionBox.start.y, selectionBox.current.y),
            x2: Math.max(selectionBox.start.x, selectionBox.current.x),
            y2: Math.max(selectionBox.start.y, selectionBox.current.y)
        };
        selectedWire = null;
        selectionGroup = [];
        components.forEach(c => {
            const b = c.getBoundingBox();
            const overlaps = !(b.x2 < rect.x1 || b.x1 > rect.x2 || b.y2 < rect.y1 || b.y1 > rect.y2);
            if (overlaps) selectionGroup.push(c);
        });
        selectedComponent = selectionGroup[0] || null;
        selectionBox = null;
        updateProps();
        handled = true;
    }

    if (!handled && clickCandidate) {
        const primary = clickCandidate.objs[0]?.obj;
        if (primary && (primary instanceof SPSTSwitch || primary instanceof SPDTSwitch || primary instanceof DPDT)) {
            primary.toggle();
        }
        clickCandidate = null;
        handled = true;
    }

    if (draggingComponent) {
        draggingComponent.objs.forEach(entry => {
            autoConnectPins(entry.obj);
            rerouteWiresForComponent(entry.obj);
        });
        draggingComponent = null;
        cleanupJunctions();
        markStateDirty();
        handled = true;
    }

    if (draggingWire) {
        const w = draggingWire.wire;
        w.vertices = mergeCollinear(w.vertices || []);
        if (!wireDragMoved) {
            if (draggingWire.wasSelected && !activeWire) {
                const pts = getWirePolyline(w);
                const dStart = Math.hypot(draggingWire.start.x - pts[0].x, draggingWire.start.y - pts[0].y);
                const dEnd   = Math.hypot(draggingWire.start.x - pts[pts.length - 1].x, draggingWire.start.y - pts[pts.length - 1].y);
                const fromPin = (dEnd < dStart) ? w.to : w.from;
                activeWire = {
                    fromPin,
                    vertices: [],
                    currentPoint: snapToBoardPoint(draggingWire.start.x, draggingWire.start.y)
                };
                selectedWire = null;
                setSelectedComponent(null);
            } else {
                selectedWire = w;
                setSelectedComponent(null);
            }
            updateProps();
        }
        draggingWire  = null;
        wireDragStart = null;
        wireDragMoved = false;
        pruneFloatingJunctions();
        cleanupJunctions();
        markStateDirty();
        handled = true;
    }

    if (handled) {
        detachDragListeners();
    }
}

function onDblClick(e) {
    const m = canvasPoint(e);
    for (const c of components) {
        if (c instanceof Oscilloscope && c.isInside(m.x, m.y)) {
            setSelectedComponent(c);
            activeScopeComponent = c;
            updateProps();
            openScope(c);
            break;
        }
    }
}

function onKey(e) {
    const activeEl = document.activeElement;
    const isEditable = isEditableElement(activeEl);

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable) {
        e.preventDefault();
        deleteSelected();
    }
    if (e.key.toLowerCase() === 'r' && selectedComponent) rotateSelected();
    if (e.key.toLowerCase() === 'f' && selectedComponent && !isEditable) {
        mirrorSelected();
    }
    if (e.key === 'Escape' && !isEditable) {
        selectionBox = null;
        draggingComponent = null;
        draggingWire = null;
        activeWire = null;
        isPanning = false;
        wireDragMoved = false;
        wireDragStart = null;
        clearToolSelection();
        detachDragListeners();
        updateProps();
    }
}

/* ---------- SCOPE UI ---------- */

let activeCursor = 0;

function getClientXFromEvent(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
    return e.clientX;
}

function getDefaultScopeMode() {
    return (viewMode === 'schematic') ? 'window' : 'fullscreen';
}

function updateScopeModeButton() {
    const btn  = document.getElementById('scope-mode-btn');
    if (!btn) return;
    const label = btn.querySelector('span');
    const icon  = btn.querySelector('i');
    const windowed = scopeDisplayMode === 'window';
    if (label) label.innerText = windowed ? 'Full Screen' : 'Window';
    if (icon)  icon.className = windowed ? 'fas fa-expand' : 'fas fa-clone';
}

function setScopeOverlayLayout(mode = scopeDisplayMode || getDefaultScopeMode()) {
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;
    scopeDisplayMode = (mode === 'window') ? 'window' : 'fullscreen';
    const windowed = (scopeDisplayMode === 'window');
    overlay.classList.toggle('scope-window', windowed);
    if (windowed) {
        overlay.style.left   = `${scopeWindowPos.x}px`;
        overlay.style.top    = `${scopeWindowPos.y}px`;
        overlay.style.right  = 'auto';
        overlay.style.bottom = 'auto';
    } else {
        overlay.style.left = '';
        overlay.style.top = '';
        overlay.style.right = '';
        overlay.style.bottom = '';
    }
    updateScopeModeButton();
}

function toggleScopeDisplayMode() {
    const next = (scopeDisplayMode === 'window') ? 'fullscreen' : 'window';
    setScopeOverlayLayout(next);
    resize();
    if (scopeMode) drawScope();
}

function openScope(targetScope = null) {
    if (targetScope instanceof Oscilloscope) {
        activeScopeComponent = targetScope;
    } else if (selectedComponent instanceof Oscilloscope) {
        activeScopeComponent = selectedComponent;
    }
    if (!activeScopeComponent) {
        activeScopeComponent = components.find(c => c instanceof Oscilloscope) || null;
    }

    if (!scopeCanvas) scopeCanvas = document.getElementById('scopeCanvas');
    if (!scopeCtx && scopeCanvas) scopeCtx = scopeCanvas.getContext('2d');

    scopeMode = true;
    setScopeOverlayLayout(scopeDisplayMode || getDefaultScopeMode());
    const overlay = document.getElementById('scope-overlay');
    if (overlay) overlay.classList.remove('hidden');
    resize();
    attachScopeControlHandlers();
    syncScopeControls();
    drawScope();
    updateCursors();
}

function closeScope() {
    scopeMode = false;
    stopScopeWindowDrag();
    const overlay = document.getElementById('scope-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('scope-window');
    }
}

function toggleCursors() {
    const c1 = document.getElementById('cursor-1');
    const c2 = document.getElementById('cursor-2');
    if (!c1 || !c2) return;
    c1.classList.toggle('hidden');
    c2.classList.toggle('hidden');
    updateCursors();
}

function startDragCursor(id, e) {
    activeCursor = id;
    window.addEventListener('mousemove', dragCursor);
    window.addEventListener('mouseup', stopDragCursor);
    window.addEventListener('touchmove', dragCursor, { passive: false });
    window.addEventListener('touchend', stopDragCursor);
    e.stopPropagation();
    e.preventDefault();
}

function dragCursor(e) {
    const container = document.getElementById('scope-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let x = getClientXFromEvent(e) - rect.left;
    x = Math.max(0, Math.min(rect.width, x));
    const pct = (x / rect.width) * 100;
    const el = document.getElementById(`cursor-${activeCursor}`);
    if (el) {
        el.style.left = pct + '%';
        updateCursors();
    }
    if (e.cancelable) e.preventDefault();
}

function stopDragCursor() {
    window.removeEventListener('mousemove', dragCursor);
    window.removeEventListener('mouseup', stopDragCursor);
    window.removeEventListener('touchmove', dragCursor);
    window.removeEventListener('touchend', stopDragCursor);
}

function updateCursors() {
    if (!scopeCanvas || !scopeCtx) return;
    const c1El = document.getElementById('cursor-1');
    const c2El = document.getElementById('cursor-2');
    if (!c1El || !c2El) return;

    let c1Pct = parseFloat(c1El.style.left);
    let c2Pct = parseFloat(c2El.style.left);
    if (!isFinite(c1Pct)) c1Pct = 30;
    if (!isFinite(c2Pct)) c2Pct = 70;

    const scope = activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    if (!scope) return;

    const tDiv        = parseUnit(scope.props.TimeDiv || '1m');
    const totalWindow = tDiv * 10;
    const tA          = (c1Pct / 100) * totalWindow;
    const tB          = (c2Pct / 100) * totalWindow;
    const dt          = tB - tA;

    const startIdx = (scope.head + 1) % HISTORY_SIZE;
    const sampleAt = (pct, data) => {
        const fIdx = (startIdx + (pct / 100) * HISTORY_SIZE) % HISTORY_SIZE;
        const i0 = Math.floor(fIdx) % HISTORY_SIZE;
        const i1 = (i0 + 1) % HISTORY_SIZE;
        const frac = fIdx - Math.floor(fIdx);
        return data[i0] * (1 - frac) + data[i1] * frac;
    };

    const readings = [
        { name: 'CH1', color: '#fbbf24', a: sampleAt(c1Pct, scope.data.ch1), b: sampleAt(c2Pct, scope.data.ch1) },
        { name: 'CH2', color: '#22d3ee', a: sampleAt(c1Pct, scope.data.ch2), b: sampleAt(c2Pct, scope.data.ch2) }
    ];

    const dtEl   = document.getElementById('scope-dt');
    const freqEl = document.getElementById('scope-freq');
    const tAEl   = document.getElementById('cursor-a');
    const tBEl   = document.getElementById('cursor-b');

    if (tAEl) tAEl.innerText = formatUnit(tA, 's');
    if (tBEl) tBEl.innerText = formatUnit(tB, 's');
    if (dtEl) dtEl.innerText = formatUnit(Math.abs(dt), 's');
    if (freqEl) freqEl.innerText = (dt === 0) ? '∞' : formatUnit(1 / Math.abs(dt), 'Hz');

    const tableBody = document.getElementById('scope-cursor-rows');
    if (tableBody) {
        tableBody.innerHTML = '';
        readings.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-2 py-1 font-mono" style="color:${r.color}">${r.name}</td>
                <td class="px-2 py-1 text-right">${formatUnit(r.a, 'V')}</td>
                <td class="px-2 py-1 text-right">${formatUnit(r.b, 'V')}</td>
                <td class="px-2 py-1 text-right">${formatUnit(r.b - r.a, 'V')}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

function startScopeWindowDrag(e) {
    if (scopeDisplayMode !== 'window') return;
    // avoid dragging when clicking interactive elements inside the header
    if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    scopeDragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    isDraggingScope = true;
    window.addEventListener('mousemove', dragScopeWindow);
    window.addEventListener('mouseup', stopScopeWindowDrag);
    e.preventDefault();
}

function dragScopeWindow(e) {
    if (!isDraggingScope) return;
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;

    const w = overlay.offsetWidth;
    const h = overlay.offsetHeight;
    const pad = 8;
    let x = e.clientX - scopeDragOffset.x;
    let y = e.clientY - scopeDragOffset.y;
    const maxX = Math.max(pad, window.innerWidth - w - pad);
    const maxY = Math.max(pad, window.innerHeight - h - pad);
    x = Math.min(Math.max(x, pad), maxX);
    y = Math.min(Math.max(y, pad), maxY);

    scopeWindowPos = { x, y };
    overlay.style.left   = `${x}px`;
    overlay.style.top    = `${y}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
}

function stopScopeWindowDrag() {
    isDraggingScope = false;
    window.removeEventListener('mousemove', dragScopeWindow);
    window.removeEventListener('mouseup', stopScopeWindowDrag);
}

function syncScopeControls() {
    const scope = activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    const timeSel = document.getElementById('scope-time-div');
    const v1Sel = document.getElementById('scope-vdiv1');
    const v2Sel = document.getElementById('scope-vdiv2');
    if (!scope) return;
    if (timeSel) timeSel.value = scope.props.TimeDiv || timeSel.value;
    if (v1Sel)  v1Sel.value  = scope.props.VDiv1  || v1Sel.value;
    if (v2Sel)  v2Sel.value  = scope.props.VDiv2  || v2Sel.value;
}

function attachScopeControlHandlers() {
    const currentScope = () => activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    const timeSel = document.getElementById('scope-time-div');
    const v1Sel = document.getElementById('scope-vdiv1');
    const v2Sel = document.getElementById('scope-vdiv2');

    const hook = (el, handler) => {
        if (el && !el._scopeHooked) {
            el.addEventListener('change', handler);
            el._scopeHooked = true;
        }
    };

    hook(timeSel, e => {
        const s = currentScope();
        if (!s) return;
        s.props.TimeDiv = e.target.value;
        s.sampleAccum = 0;
        drawScope();
        updateCursors();
        markStateDirty();
    });
    hook(v1Sel, e => {
        const s = currentScope();
        if (!s) return;
        s.props.VDiv1 = e.target.value;
        drawScope();
        markStateDirty();
    });
    hook(v2Sel, e => {
        const s = currentScope();
        if (!s) return;
        s.props.VDiv2 = e.target.value;
        drawScope();
        markStateDirty();
    });
}

/* ---------- VIEW / SIM CONTROL ---------- */

function updatePlayPauseButton() {
    const btn = document.getElementById('play-pause-btn');
    if (!btn) return;
    btn.innerHTML = isPaused
        ? '<i class="fas fa-play"></i> Play'
        : '<i class="fas fa-pause"></i> Pause';
}

function toggleView() {
    viewMode = (viewMode === 'physical') ? 'schematic' : 'physical';
    const label = document.getElementById('view-label');
    if (label) {
        label.innerText = (viewMode === 'physical') ? 'Breadboard View'
                                                    : 'Schematic View';
    }
    markStateDirty();
    if (!scopeDisplayMode) scopeDisplayMode = getDefaultScopeMode();
    setScopeOverlayLayout(scopeDisplayMode);
    if (scopeMode) {
        resize();
        drawScope();
    }
}

function toggleSim() {
    isPaused = !isPaused;
    updatePlayPauseButton();
}

function clearCanvas() {
    components = [];
    wires      = [];
    simError   = null;
    setSelectedComponent(null);
    selectedWire      = null;
    activeWire        = null;
    hoverWire         = null;
    selectionGroup    = [];
    selectionBox      = null;
    draggingComponent = null;
    draggingWire      = null;
    wireDragMoved     = false;
    wireDragStart     = null;
    activeScopeComponent = null;
    markStateDirty();
    updateProps();
}

/* ---------- MAIN LOOP & INIT ---------- */

function loop() {
    if (!isPaused) {
        for (let s = 0; s < SUB_STEPS; s++) {
            time += DT;
            simulate(time);
            if (simError) break;
        }
    }
    draw();
    if (scopeMode) drawScope();

    const simTimeEl = document.getElementById('sim-time');
    const statusEl  = document.getElementById('sim-status');
    if (simTimeEl) simTimeEl.innerText = formatUnit(time, 's');
    if (statusEl)  statusEl.innerText  = simError ? `ERROR: ${simError}`
                                                  : (isPaused ? 'PAUSED' : 'RUNNING');

    requestAnimationFrame(loop);
}

function init() {
    if (initRan) return;
    initRan = true;

    canvas = document.getElementById('circuitCanvas');
    if (!canvas) {
        console.error('circuitCanvas not found; aborting simulator init.');
        return;
    }
    ctx = canvas.getContext('2d');
    scopeCanvas = document.getElementById('scopeCanvas');
    scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;

    updateBoardThemeColors();

    window.addEventListener('resize', resize);
    resize();
    renderToolIcons();
    alignScopeButton();
    attachScopeControlHandlers();
    syncScopeControls();
    updatePlayPauseButton();

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('dblclick',  onDblClick);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown',   onKey);

    loadStateFromLocalStorage();
    updateProps();
    loop();
}

// Start it
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
