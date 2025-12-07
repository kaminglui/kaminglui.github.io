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
const GRID_HOLE_RADIUS      = 2.6;
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
const DRAG_DEADZONE         = 3;
const TOUCH_SELECTION_HOLD_MS = 280;
const COMPONENT_DELETE_HOLD_MS = 650;
const SWITCH_TYPES          = ['SPST', 'SPDT', 'DPDT'];
const DEFAULT_SWITCH_TYPE   = 'SPDT';
const MOBILE_BREAKPOINT     = 1024;
const BASELINE_NODE_LEAK    = 1e-11;
const OPAMP_GAIN            = 1e9;
const OPAMP_INPUT_LEAK      = 1e-15;
const OPAMP_OUTPUT_LEAK     = 1e-12;
const OPAMP_RAIL_HEADROOM   = 0.1;
// A bench function generator normally references its output to chassis/ground.
// Keep COM near ground with a low impedance so “floating” hookups (COM not
// explicitly wired) still deliver the configured amplitude instead of letting
// the COM node wander and steal half the signal.
const FUNCGEN_REF_RES       = 1;     // tie COM solidly to reference
const FUNCGEN_SERIES_RES    = 1;     // tiny source impedance to keep stacks stable
const PROP_UNITS = {
    R: 'Ω',
    Tolerance: '%',
    C: 'F',
    Vf: 'V',
    If: 'A',
    W: 'm',
    L: 'm',
    Kp: 'A/V^2',
    Vth: 'V',
    Lambda: '1/V',
    Gamma: 'V^0.5',
    Phi: 'V',
    Vdc: 'V',
    Vpp: 'Vpp',
    Freq: 'Hz',
    Offset: 'V',
    Phase: '°',
    Turn: '%',
    TimeDiv: 's/div',
    VDiv1: 'V/div',
    VDiv2: 'V/div'
};

let boardBgColor = '#020617';
let gridHoleColor = '#1f2937';
let canvasBgColor = '#1a1a1a';

// View / zoom
let zoom     = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const BOARD_W     = 4200; // world units (~210 grid cells)
const BOARD_H     = 3200;
const BOARD_MARGIN= 400;  // extra pan room at edges

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
let pendingComponentDrag = null;
let draggingWire      = null; // { wire, start: {x,y}, verts: [...] }
let wireDragMoved     = false;
let wireDragStart     = null;
let viewOffsetX       = 0;
let viewOffsetY       = 0;
let isPanning         = false;

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
let currentSwitchType = DEFAULT_SWITCH_TYPE;
let templatePlacementCount = 0;
let activeTemplatePlacement = null; // { template, origin }
let templatePreviewOrigin = null;
let lastMouseWorld = { x: 0, y: 0 };
let touchSelectionTimer = null;
let touchDeleteTimer = null;
let touchHoldStart = null;
let touchMovedSinceDown = false;

// Canvas handles (set after DOM exists)
let canvas = null;
let ctx = null;
let scopeCanvas = null;
let scopeCtx = null;
let initRan = false;
let canvasDisplayWidth = 0;
let canvasDisplayHeight = 0;
let canvasCssWidth = 0;
let canvasCssHeight = 0;

/* === UTILITIES === */
function screenToWorld(clientX, clientY) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? (canvas.width / rect.width) : 1;
    const scaleY = rect.height ? (canvas.height / rect.height) : 1;
    return {
        x: ((clientX - rect.left) * scaleX) / zoom - viewOffsetX,
        y: ((clientY - rect.top)  * scaleY) / zoom - viewOffsetY
    };
}

function getViewportSize() {
    const vv = window.visualViewport;
    const fallbackW = Math.round(window.screen?.width || 0);
    const fallbackH = Math.round(window.screen?.height || 0);
    const width = Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || fallbackW);
    const height = Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || fallbackH);
    return { width, height };
}

function isMobileViewport() {
    const { width } = getViewportSize();
    return width <= MOBILE_BREAKPOINT;
}

function syncViewportCssVars() {
    const root = document.documentElement;
    const { width, height } = getViewportSize();
    if (width)  root.style.setProperty('--viewport-w', `${width}px`);
    if (height) root.style.setProperty('--viewport-h', `${height}px`);

    const header = document.querySelector('.site-header');
    if (header) {
        root.style.setProperty('--header-h', `${header.offsetHeight}px`);
    }

    const simBar = document.getElementById('sim-bar');
    if (simBar) {
        root.style.setProperty('--simbar-height', `${simBar.offsetHeight}px`);
    }
}

function snapToGrid(v) {
    return Math.round(v / GRID) * GRID;
}

function clampView() {
    const viewW = canvasDisplayWidth || canvas?.width || 0;
    const viewH = canvasDisplayHeight || canvas?.height || 0;
    const slack = BOARD_MARGIN * 0.5; // allow slight overscroll/pan beyond edges
    const maxX = BOARD_MARGIN + slack;
    const minX = -(BOARD_W + BOARD_MARGIN * 2 - viewW / zoom) - slack;
    const maxY = BOARD_MARGIN + slack;
    const minY = -(BOARD_H + BOARD_MARGIN * 2 - viewH / zoom) - slack;
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

function formatSignedUnit(num, unit = '') {
    if (!isFinite(num)) return '0' + unit;
    const sign = num < 0 ? '-' : '';
    return sign + formatUnit(Math.abs(num), unit);
}

// Resistor color code bands: returns array of 4 CSS colors
function getResColor(val, Tolerance) {
    const colors = ['#000000', '#512627', '#FF2100', '#D87347',
                    '#E6C951', '#528F65', '#0F5190', '#6967CE',
                    '#7D7D7D', '#FFFFFF'];

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
    else if (mult === -1) multColor = '#C08327'; // gold
    else if (mult === -2) multColor = '#BFBEBF'; // silver
    bands.push(multColor);

    // tolerance band
    const t = parseFloat(Tolerance);
    let tolColor = '#C08327'; // default ~5%
    if (t === 1)  tolColor = '#512627';
    if (t === 2)  tolColor = '#FF2100';
    if (t === 10) tolColor = '#BFBEBF';
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
        this.kind = (this.constructor?.name || 'component').toLowerCase();
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
        this.props = { R: '10k', Tolerance: '5' };
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

        const bands = getResColor(this.props.R, this.props.Tolerance);
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

/* === SWITCH (SPST / SPDT / DPDT) === */
class Switch extends Component {
    setup() {
        const initial = (SWITCH_TYPES.includes(currentSwitchType)) ? currentSwitchType : DEFAULT_SWITCH_TYPE;
        this.props = { Type: initial, Position: 'A' };
        this.pinNames = [];
        this.applyType(initial, true);
    }

    getTypeConfig(type) {
        switch (type) {
            case 'SPDT':
                return {
                    names: ['COM', 'A', 'B'],
                    pins: [
                        { x: -30, y: 0 },   // COM
                        { x:  30, y:-16 },  // A (upper)
                        { x:  30, y: 16 }   // B (lower)
                    ],
                    w: 80,
                    h: 60
                };
            case 'DPDT':
                return {
                    names: ['COM1', 'A1', 'B1', 'COM2', 'A2', 'B2'],
                    pins: [
                        { x: -32, y: -22 }, // COM1
                        { x:  32, y: -32 }, // A1
                        { x:  32, y: -12 }, // B1
                        { x: -32, y:  22 }, // COM2
                        { x:  32, y:  12 }, // A2
                        { x:  32, y:  32 }  // B2
                    ],
                    w: 90,
                    h: 90
                };
            default:
                return {
                    names: ['A', 'B'],
                    pins: [
                        { x: -30, y: 0 }, // A
                        { x:  30, y: 0 }  // B
                    ],
                    w: 80,
                    h: 40
                };
        }
    }

    applyType(type, skipWireCleanup = false) {
        const clamped = SWITCH_TYPES.includes(type) ? type : DEFAULT_SWITCH_TYPE;
        const cfg = this.getTypeConfig(clamped);
        const prevNames = this.pinNames ? [...this.pinNames] : [];
        const nameFromIdx = new Map(prevNames.map((n, i) => [i, n]));

        this.props.Type = clamped;
        if (this.props.Position !== 'A' && this.props.Position !== 'B') {
            this.props.Position = 'A';
        }
        this.pinNames = [...cfg.names];
        this.pins = cfg.pins.map(p => ({ ...p }));
        this.w = cfg.w;
        this.h = cfg.h;

        if (!skipWireCleanup) {
            const nextIdxByName = new Map(this.pinNames.map((n, i) => [n, i]));
            wires = wires.filter(w => {
                let keep = true;
                if (w.from.c === this) {
                    const name = nameFromIdx.get(w.from.p);
                    const mapped = nextIdxByName.get(name);
                    if (mapped == null) keep = false;
                    else w.from.p = mapped;
                }
                if (w.to.c === this) {
                    const name = nameFromIdx.get(w.to.p);
                    const mapped = nextIdxByName.get(name);
                    if (mapped == null) keep = false;
                    else w.to.p = mapped;
                }
                return keep;
            });
        }
    }

    toggle() {
        this.props.Position = (this.props.Position === 'A') ? 'B' : 'A';
    }

    getActiveConnections() {
        const pos = this.props.Position === 'B' ? 'B' : 'A';
        if (this.props.Type === 'SPST') {
            return (pos === 'A') ? [[0, 1]] : [];
        }
        if (this.props.Type === 'SPDT') {
            const idx = (pos === 'A') ? 1 : 2;
            return [[0, idx]];
        }
        if (this.props.Type === 'DPDT') {
            const upper = (pos === 'A') ? 1 : 2;
            const lower = (pos === 'A') ? 4 : 5;
            return [
                [0, upper],
                [3, lower]
            ];
        }
        return [];
    }

    drawSwitch(ctx, filled = false) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#e5e7eb';
        if (filled) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
            ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
        }

        const drawPole = (comIdx, aIdx, bIdx) => {
            const com = this.pins[comIdx];
            const a = this.pins[aIdx];
            const b = this.pins[bIdx];
            if (!com || !a || !b) return;
            const lead = (com.x < a.x || com.x < b.x) ? 10 : -10;

            // fixed contacts
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - lead * 0.5, a.y); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - lead * 0.5, b.y); ctx.stroke();

            // pads
            ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.stroke();

            // common stub
            ctx.beginPath();
            ctx.moveTo(com.x, com.y);
            ctx.lineTo(com.x + lead, com.y);
            ctx.stroke();

            const pos = (this.props.Position === 'B') ? 'B' : 'A';
            const target = (this.props.Type === 'SPST' && pos === 'B')
                ? { x: com.x + lead + 8, y: com.y - 14 }
                : (pos === 'A' ? a : b);

            ctx.beginPath();
            ctx.moveTo(com.x + lead, com.y);
            ctx.lineTo(target.x - (lead * 0.3), target.y + (pos === 'B' && this.props.Type === 'SPST' ? 0 : 0));
            ctx.stroke();
        };

        if (this.props.Type === 'DPDT') {
            drawPole(0, 1, 2);
            drawPole(3, 4, 5);
        } else if (this.props.Type === 'SPDT') {
            drawPole(0, 1, 2);
        } else {
            drawPole(0, 1, 1);
        }

        ctx.restore();
    }

    drawSym(ctx) { this.drawSwitch(ctx, false); }
    drawPhys(ctx) { this.drawSwitch(ctx, true); }

    drawLabels(ctx) {
        ctx.save();
        ctx.font = LABEL_FONT_SMALL;
        ctx.fillStyle = '#d1d5db';
        this.pinNames.forEach((name, idx) => {
            const dir = getPinDirection(this, idx) || { x: 0, y: 1 };
            const pos = offsetLabelFromPin(this, idx, LABEL_OUTSIDE_OFFSET, dir);
            ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, pos.x, pos.y);
        });
        const center = getPinCenter(this);
        ctx.font = LABEL_FONT_BOLD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(this.props.Type, center.x, center.y);
        ctx.restore();
    }
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

/* === IDEAL DUAL OP-AMP (LM358 / LF412 style) === */
class LF412 extends Component {
    setup() {
        this.pinNames = ['1OUT', '1IN-', '1IN+', 'VCC-', '2IN+', '2IN-', '2OUT', 'VCC+'];
        this.pins = [
            { x: -40, y: -40 }, // 1OUT (pin 1)
            { x: -40, y: -20 }, // 1IN-
            { x: -40, y:  20 }, // 1IN+
            { x: -40, y:  40 }, // VCC-
            { x:  40, y:  40 }, // 2IN+
            { x:  40, y:  20 }, // 2IN-
            { x:  40, y: -20 }, // 2OUT
            { x:  40, y: -40 }  // VCC+
        ];
        this.w = 80;
        this.h = 100;
        this.props = {};
    }

    drawPackage(ctx, filled = false, bodyFill = null) {
        const body = { x: -40, y: -50, w: 80, h: 100 };
        ctx.save();
        ctx.lineWidth = 2;
        ctx.fillStyle   = bodyFill || (filled ? '#111827' : '#0b0f19');
        ctx.strokeStyle = '#ffffff';
        ctx.fillRect(body.x, body.y, body.w, body.h);
        ctx.strokeRect(body.x, body.y, body.w, body.h);

        const notchW = 28;
        const notchDepth = 8;
        const topY = body.y;
        ctx.fillStyle = filled ? '#0f172a' : '#020617';
        ctx.beginPath();
        ctx.moveTo(-notchW / 2, topY);
        ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
        ctx.lineTo(notchW / 2, topY - 2);
        ctx.lineTo(-notchW / 2, topY - 2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-notchW / 2, topY);
        ctx.quadraticCurveTo(0, topY + notchDepth, notchW / 2, topY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#60a5fa';
        this.pins.forEach(p => {
            const edgeX = p.x < 0 ? body.x : body.x + body.w;
            ctx.beginPath();
            ctx.moveTo(edgeX, p.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawSym(ctx) { this.drawPackage(ctx, false); }
    drawPhys(ctx) {
        const g = ctx.createLinearGradient(-40, 0, 40, 0);
        g.addColorStop(0, '#222222');
        g.addColorStop(1, '#000000');
        this.drawPackage(ctx, true, g);
    }

    drawLabels(ctx) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        const center = getPinCenter(this);
        ctx.fillStyle = '#9ca3af';
        ctx.font = LABEL_FONT_BOLD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LF412', center.x, center.y);

        ctx.font = LABEL_FONT_SMALL;
        ctx.fillStyle = '#d1d5db';
        this.pinNames.forEach((label, idx) => {
            const dir = getPinDirection(this, idx) || { x: 0, y: 1 };
            const pos = offsetLabelFromPin(this, idx, LABEL_OUTSIDE_OFFSET, dir);
            ctx.textAlign = dir.x < 0 ? 'right' : dir.x > 0 ? 'left' : 'center';
            ctx.fillText(label, pos.x, pos.y);
        });

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

    if (typeof CircuitSim === 'undefined' || typeof CircuitSim.runSimulation !== 'function') {
        simError = 'Simulation core not available';
        return;
    }

    const result = CircuitSim.runSimulation({
        components,
        wires,
        time: t,
        dt: DT,
        parseUnit,
        baselineLeak: BASELINE_NODE_LEAK,
        opAmpGain: OPAMP_GAIN,
        opAmpInputLeak: OPAMP_INPUT_LEAK,
        opAmpOutputLeak: OPAMP_OUTPUT_LEAK,
        opAmpHeadroom: OPAMP_RAIL_HEADROOM,
        funcGenRefRes: FUNCGEN_REF_RES,
        funcGenSeriesRes: FUNCGEN_SERIES_RES,
        updateState: false
    });

    if (result.error) {
        simError = result.error;
        isPaused = true;
        updatePlayPauseButton();
        return;
    }

    const sol = result.solution || [];
    const getNodeIdx = result.getNodeIndex || (() => -1);

    CircuitSim.updateComponentState({
        components,
        solution: sol,
        getNodeIndex: getNodeIdx,
        parseUnit
    });

    simError = null;

    wires.forEach(w => {
        const n = getNodeIdx(w.from.c, w.from.p);
        const v = (n === -1 ? 0 : sol[n]);
        if (w.v === undefined) w.v = v;
        w.v = 0.8 * w.v + 0.2 * v;
    });

    components.forEach(c => {
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
    const viewW = (canvasDisplayWidth || canvas.width) / zoom;
    const viewH = (canvasDisplayHeight || canvas.height) / zoom;
    const worldLeft = -viewOffsetX;
    const worldTop  = -viewOffsetY;
    const startSnap = snapToBoardPoint(worldLeft - GRID * 2, worldTop - GRID * 2);
    const endSnap = snapToBoardPoint(worldLeft + viewW + GRID * 2, worldTop + viewH + GRID * 2);
    const startX = startSnap.x;
    const endX   = endSnap.x;
    const startY = startSnap.y;
    const endY   = endSnap.y;

    ctx.fillStyle = boardBgColor;
    ctx.fillRect(worldLeft - GRID * 2, worldTop - GRID * 2, viewW + GRID * 4, viewH + GRID * 4);

    ctx.fillStyle = gridHoleColor;
    for (let x = startX; x <= endX; x += GRID) {
        for (let y = startY; y <= endY; y += GRID) {
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

function drawTemplatePreview() {
    if (!activeTemplatePlacement || !templatePreviewOrigin) return;
    const template = activeTemplatePlacement.template;
    const origin = templatePreviewOrigin;
    const center = getTemplateCenter(template);
    const idMap = new Map();

    const tempComponents = (template.components || []).map((def) => {
        const Ctor = TOOL_COMPONENTS[def.type];
        if (!Ctor) return null;
        const c = new Ctor(origin.x + ((def.x || 0) - center.x), origin.y + ((def.y || 0) - center.y));
        c.props = { ...c.props, ...(def.props || {}) };
        c.rotation = def.rotation ?? 0;
        c.mirrorX = !!def.mirrorX;
        if (def.id) idMap.set(def.id, c);
        return c;
    }).filter(Boolean);

    const tempWires = (template.wires || []).map((wire) => {
        const fromComp = idMap.get(wire?.from?.id);
        const toComp = idMap.get(wire?.to?.id);
        if (!fromComp || !toComp) return null;
        const mid = (wire.vertices || []).map(v => ({
            x: origin.x + ((v?.x || 0) - center.x),
            y: origin.y + ((v?.y || 0) - center.y)
        }));
        return {
            from: { c: fromComp, p: wire.from?.pin },
            to: { c: toComp, p: wire.to?.pin },
            vertices: mid
        };
    }).filter(Boolean);

    ctx.save();
    ctx.globalAlpha = 0.35;
    tempWires.forEach(w => {
        const pts = getWirePolyline(w);
        drawWirePolyline(pts, '#93c5fd', WIRE_WIDTH_DEFAULT, true);
    });
    tempComponents.forEach(c => c.draw(ctx, viewMode));
    tempComponents.forEach(c => {
        if (typeof c.drawLabels === 'function') c.drawLabels(ctx, viewMode);
    });
    ctx.restore();
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
    drawTemplatePreview();

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

    const channels = [
        { key: 'ch1', color: '#fbbf24', scale: scaleCh1, data: scope.data.ch1 },
        { key: 'ch2', color: '#22d3ee', scale: scaleCh2, data: scope.data.ch2 }
    ];

    function renderChannel(ch) {
        scopeCtx.strokeStyle = ch.color;
        scopeCtx.lineWidth   = 2;
        scopeCtx.beginPath();
        for (let x = 0; x < w; x++) {
            const t   = x / w;
            const off = Math.floor(t * HISTORY_SIZE);
            const idx = (startIdx + off) % HISTORY_SIZE;
            const v   = ch.data[idx];
            const y   = midY - v * ch.scale;
            if (x === 0) scopeCtx.moveTo(x, y);
            else         scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();
    }

    channels.forEach(renderChannel);

    const cursorMetrics = buildCursorMetrics(scope);
    if (cursorMetrics) {
        const drawCursorMarker = (pct, color, values) => {
            const x = (pct / 100) * w;
            scopeCtx.save();
            scopeCtx.setLineDash([4, 4]);
            scopeCtx.strokeStyle = color;
            scopeCtx.beginPath();
            scopeCtx.moveTo(x, 0);
            scopeCtx.lineTo(x, h);
            scopeCtx.stroke();
            scopeCtx.setLineDash([]);
            values.forEach(v => {
                scopeCtx.fillStyle = v.color;
                const y = midY - (v.scale ? v.value * v.scale : 0);
                scopeCtx.beginPath();
                scopeCtx.arc(x, y, 4, 0, Math.PI * 2);
                scopeCtx.fill();
            });
            scopeCtx.restore();
        };

        const valuesA = channels.map(ch => ({
            color: ch.color,
            scale: ch.scale,
            value: cursorMetrics.channels.find(row => row.key === ch.key)?.va || 0
        }));
        const valuesB = channels.map(ch => ({
            color: ch.color,
            scale: ch.scale,
            value: cursorMetrics.channels.find(row => row.key === ch.key)?.vb || 0
        }));

        drawCursorMarker(cursorMetrics.pctA, '#fcd34d', valuesA);
        drawCursorMarker(cursorMetrics.pctB, '#06b6d4', valuesB);
    }

    // keep cursor Δt / ΔV working even when the sim is paused
    updateCursors();
}

/* ---------- UI HELPERS / MODES ---------- */
function resize() {
    if (!canvas) return;

    syncViewportCssVars();

    const { width: viewportW, height: viewportH } = getViewportSize();
    const headerH = document.querySelector('.site-header')?.offsetHeight || 0;
    const parent = canvas.parentElement || canvas;
    const fallbackH = Math.max(1, viewportH - headerH);
    const cssW = Math.max(1, parent.clientWidth  || parent.offsetWidth  || viewportW);
    const cssH = Math.max(1, parent.clientHeight || parent.offsetHeight || fallbackH);
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width  = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    canvasCssWidth = cssW;
    canvasCssHeight = cssH;
    canvasDisplayWidth  = canvas.width;
    canvasDisplayHeight = canvas.height;

    // keep initial view centered
    if (viewOffsetX === 0 && viewOffsetY === 0) {
        viewOffsetX = (canvas.width  / (2 * zoom) - BOARD_W / 2);
        viewOffsetY = (canvas.height / (2 * zoom) - BOARD_H / 2);
    }
    clampView();

    const scopeContainer = document.getElementById('scope-container');
    if (scopeContainer && scopeCanvas) {
        const scopeW = Math.max(1, scopeContainer.clientWidth);
        const scopeH = Math.max(1, scopeContainer.clientHeight);
        scopeCanvas.style.width  = `${scopeW}px`;
        scopeCanvas.style.height = `${scopeH}px`;
        scopeCanvas.width  = Math.floor(scopeW * dpr);
        scopeCanvas.height = Math.floor(scopeH * dpr);
    }

    if (scopeMode) {
        setScopeOverlayLayout(scopeDisplayMode);
    }

    syncSidebarOverlayState();
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
    createToolIcon("button[onclick=\"selectTool('switch', this)\"]", Switch, s => {
        s.applyType('SPST', true);
        s.props.Position = 'A';
    });
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
    pendingComponentDrag = null;
    currentTool       = null;
    updateProps();
}

function ensureSidebarExpanded() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        document.body.classList.remove('sidebar-collapsed');
        const icon = document.getElementById('sidebar-toggle-icon');
        if (icon) icon.className = 'fas fa-chevron-left';
        sidebar.setAttribute('aria-expanded', 'true');
    }
}

    function syncSidebarOverlayState(forceCollapsed = null) {
        const sidebar = document.getElementById('sidebar');
        const isCollapsed = (forceCollapsed != null)
            ? forceCollapsed
            : (sidebar ? sidebar.classList.contains('collapsed') : true);
        const shouldOverlay = isMobileViewport() && !isCollapsed;
        document.body.classList.toggle('sidebar-open-mobile', shouldOverlay);
        const canvasShell = document.querySelector('.canvas-shell');
        if (canvasShell) {
            canvasShell.setAttribute('aria-hidden', shouldOverlay ? 'true' : 'false');
        }
    }

// Tool selection (resistor, capacitor, funcGen, etc.)
function clearToolSelection() {
    clearTemplatePlacement();
    currentTool = null;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
}

function selectTool(type, btn) {
    if (currentTool === type) {
        clearToolSelection();
        return;
    }
    clearTemplatePlacement();
    currentTool = type;

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    if (btn) btn.classList.add('active');
}

function syncSwitchTypeSelector(type = currentSwitchType) {
    const effective = type || DEFAULT_SWITCH_TYPE;
    const select = document.getElementById('switch-type-select');
    if (select && select.value !== effective) {
        select.value = effective;
    }
    const chip = document.getElementById('switch-type-label');
    if (chip) chip.innerText = effective;
}

function setSwitchToolType(type) {
    const normalized = SWITCH_TYPES.includes(type) ? type : DEFAULT_SWITCH_TYPE;
    currentSwitchType = normalized;
    syncSwitchTypeSelector(normalized);
    if (selectedComponent instanceof Switch) {
        selectedComponent.applyType(normalized);
        rerouteWiresForComponent(selectedComponent);
        cleanupJunctions();
        markStateDirty();
        updateProps();
    }
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

function getPropLabel(key) {
    const unit = PROP_UNITS[key];
    return unit ? `${key} (${unit})` : key;
}

function updateProps() {
    const panel = document.getElementById('properties-panel');
    const dyn   = document.getElementById('dynamic-props');
    const title = document.getElementById('prop-title');
    if (!panel || !dyn || !title) return;

    dyn.innerHTML = '';
    syncSwitchTypeSelector(selectedComponent instanceof Switch
        ? (selectedComponent.props.Type || DEFAULT_SWITCH_TYPE)
        : currentSwitchType);

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

    const appendUnitBadge = (wrap, key) => {
        const unit = PROP_UNITS[key];
        if (!unit) return;
        const badge = document.createElement('span');
        badge.className = 'text-[10px] text-gray-400 font-mono';
        badge.innerText = unit;
        wrap.appendChild(badge);
    };

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

    if (selectedComponent instanceof Switch) {
        syncSwitchTypeSelector(selectedComponent.props.Type || DEFAULT_SWITCH_TYPE);
        currentSwitchType = selectedComponent.props.Type || DEFAULT_SWITCH_TYPE;

        const typeRow = document.createElement('div');
        typeRow.className = 'flex justify-between items-center bg-gray-700/50 p-2 rounded mb-2';
        const typeLabel = document.createElement('span');
        typeLabel.className = 'text-[10px] text-gray-300';
        typeLabel.innerText = 'Type';
        const typeSelect = document.createElement('select');
        typeSelect.className = 'w-24 bg-gray-900 border border-gray-600 rounded px-1 text-right text-xs';
        SWITCH_TYPES.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.innerText = opt;
            if (opt === (selectedComponent.props.Type || DEFAULT_SWITCH_TYPE)) o.selected = true;
            typeSelect.appendChild(o);
        });
        typeSelect.onchange = ev => setSwitchToolType(ev.target.value);
        typeRow.appendChild(typeLabel);
        typeRow.appendChild(typeSelect);
        dyn.appendChild(typeRow);

        const stateRow = document.createElement('div');
        stateRow.className = 'flex justify-between items-center bg-gray-700/50 p-2 rounded mb-2';
        const stateLabel = document.createElement('span');
        stateLabel.className = 'text-[10px] text-gray-300';
        stateLabel.innerText = 'State';
        const pos = selectedComponent.props.Position === 'B' ? 'B' : 'A';
        const stateBtn = document.createElement('button');
        stateBtn.className = 'bg-blue-600 px-2 py-1 text-xs rounded text-white';
        stateBtn.innerText = selectedComponent.props.Type === 'SPST'
            ? (pos === 'A' ? 'Closed' : 'Open')
            : `Throw ${pos}`;
        stateBtn.onclick = () => {
            selectedComponent.toggle();
            markStateDirty();
            updateProps();
        };
        stateRow.appendChild(stateLabel);
        stateRow.appendChild(stateBtn);
        dyn.appendChild(stateRow);
    }

    const comp = selectedComponent;
    for (const key in comp.props) {
        if (key === 'Type') continue;
        if (comp instanceof Switch && key === 'Position') continue;
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
        label.innerText = getPropLabel(key);
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
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.appendChild(sel);
            appendUnitBadge(wrap, key);
            row.appendChild(wrap);
        } else if (key === 'VDiv1' || key === 'VDiv2') {
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
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.appendChild(sel);
            appendUnitBadge(wrap, key);
            row.appendChild(wrap);
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
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.appendChild(sel);
            appendUnitBadge(wrap, key);
            row.appendChild(wrap);
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
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.appendChild(sel);
            appendUnitBadge(wrap, key);
            row.appendChild(wrap);
        } else if (comp instanceof Potentiometer && key === 'Turn') {
            row.className = 'bg-gray-700/50 p-2 rounded';
            row.innerHTML = '';

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-1';
            const name = document.createElement('span');
            name.className = 'text-[10px] text-gray-300 font-mono';
            name.innerText = getPropLabel('Turn');
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
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.appendChild(inp);
            appendUnitBadge(wrap, key);
            row.appendChild(wrap);
        }

        dyn.appendChild(row);
    }
}


function getTemplateLibrary() {
    if (Array.isArray(window.CIRCUIT_TEMPLATES)) return window.CIRCUIT_TEMPLATES;
    return [];
}

function getTemplateBounds(template) {
    const comps = template?.components || [];
    if (!comps.length) {
        return { x1: 0, y1: 0, x2: 0, y2: 0 };
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    comps.forEach((c) => {
        const cx = c?.x || 0;
        const cy = c?.y || 0;
        x1 = Math.min(x1, cx);
        y1 = Math.min(y1, cy);
        x2 = Math.max(x2, cx);
        y2 = Math.max(y2, cy);
    });
    return { x1, y1, x2, y2 };
}

function getTemplateCenter(template) {
    const b = getTemplateBounds(template);
    return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}

function getTemplateOrigin() {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const center = screenToWorld(rect.width / 2, rect.height / 2);
    const col = templatePlacementCount % 3;
    const row = Math.floor(templatePlacementCount / 3);
    const spacingX = 280;
    const spacingY = 240;
    const origin = {
        x: center.x + (col - 1) * spacingX,
        y: center.y + row * spacingY
    };
    templatePlacementCount++;
    return origin;
}

function placeTemplate(template, origin) {
    if (!canvas || !template) return [];
    const center = getTemplateCenter(template);
    const created = [];
    const idMap = new Map();

    (template.components || []).forEach(def => {
        const Ctor = TOOL_COMPONENTS[def.type];
        if (!Ctor) return;
        const c = new Ctor(origin.x + ((def.x || 0) - center.x), origin.y + ((def.y || 0) - center.y));
        c.props = { ...c.props, ...(def.props || {}) };
        c.rotation = def.rotation ?? 0;
        c.mirrorX = !!def.mirrorX;
        if (c instanceof Switch) {
            c.applyType(currentSwitchType, true);
        }
        components.push(c);
        created.push(c);
        if (def.id) idMap.set(def.id, c);
    });

    (template.wires || []).forEach(wire => {
        const fromComp = idMap.get(wire?.from?.id);
        const toComp = idMap.get(wire?.to?.id);
        const fromPin = wire?.from?.pin;
        const toPin = wire?.to?.pin;
        if (!fromComp || !toComp || typeof fromPin !== 'number' || typeof toPin !== 'number') return;

        const mid = (wire.vertices || []).map(v => ({
            x: origin.x + ((v?.x || 0) - center.x),
            y: origin.y + ((v?.y || 0) - center.y)
        }));
        const verts = buildWireVertices({ c: fromComp, p: fromPin }, mid, { c: toComp, p: toPin }) || [];
        wires.push({ from: { c: fromComp, p: fromPin }, to: { c: toComp, p: toPin }, vertices: verts, v: 0 });
    });

    selectionGroup = created;
    selectedComponent = created[0] || null;
    selectedWire = null;
    activeWire = null;
    pendingComponentDrag = null;
    cleanupJunctions();
    markStateDirty();
    updateProps();
    return created;
}

function applyTemplate(name, origin = getTemplateOrigin()) {
    const template = getTemplateLibrary().find(t => t.id === name);
    if (!template) return;
    placeTemplate(template, origin);
}

function queueTemplatePlacement(template) {
    if (!template) return;
    const fallback = getTemplateOrigin();
    const base = (lastMouseWorld.x === 0 && lastMouseWorld.y === 0) ? fallback : lastMouseWorld;
    activeTemplatePlacement = { template };
    templatePreviewOrigin = snapToBoardPoint(base.x, base.y);
    currentTool = null;
    selectionGroup = [];
    selectedComponent = null;
    selectedWire = null;
    activeWire = null;
    markStateDirty();
}

function clearTemplatePlacement() {
    activeTemplatePlacement = null;
    templatePreviewOrigin = null;
    markStateDirty();
}

function renderTemplateButtons() {
    const grid = document.getElementById('template-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const templates = getTemplateLibrary();
    if (!templates.length) {
        const empty = document.createElement('div');
        empty.className = 'col-span-2 text-xs text-gray-500 text-center py-2';
        empty.innerText = 'No templates available yet';
        grid.appendChild(empty);
        return;
    }

    templates.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'tool-btn p-3 rounded flex flex-col items-center justify-center gap-2 text-center';
        btn.onclick = () => queueTemplatePlacement(t);

        const icon = document.createElement('i');
        icon.className = t.icon || 'fas fa-microchip text-blue-200';
        const label = document.createElement('span');
        label.className = 'text-[11px] font-medium';
        label.innerText = t.label || t.id;

        btn.appendChild(icon);
        btn.appendChild(label);
        grid.appendChild(btn);
    });
}

/* ---------- MOUSE & KEYBOARD ---------- */

const TOOL_COMPONENTS = {
    resistor: Resistor,
    capacitor: Capacitor,
    potentiometer: Potentiometer,
    mosfet: MOSFET,
    switch: Switch,
    lf412: LF412,
    voltageSource: VoltageSource,
    funcGen: FunctionGenerator,
    ground: Ground,
    oscilloscope: Oscilloscope,
    led: LED,
    junction: Junction
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
        })).filter(entry => entry.type !== null),
        wires: wires.map(w => ({
            from: { id: w.from?.c?.id, p: w.from?.p },
            to:   { id: w.to?.c?.id,   p: w.to?.p },
            vertices: (w.vertices || []).map(v => ({ x: v.x, y: v.y }))
        })).filter(w => w.from.id != null && w.to.id != null)
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
            if (c instanceof Switch) {
                const t = SWITCH_TYPES.includes(c.props.Type) ? c.props.Type : DEFAULT_SWITCH_TYPE;
                c.applyType(t, true);
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

        updateViewLabel();

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
    const c = new ComponentCtor(snapPoint.x, snapPoint.y);
    if (c instanceof Switch) {
        const t = SWITCH_TYPES.includes(currentSwitchType) ? currentSwitchType : DEFAULT_SWITCH_TYPE;
        c.applyType(t, true);
        c.props.Position = c.props.Position || 'A';
    }
    return c;
}

function attachDragListeners() {
    if (dragListenersAttached) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    dragListenersAttached = true;
}

function detachDragListeners() {
    if (!dragListenersAttached) return;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    dragListenersAttached = false;
}

function clearTouchTimers() {
    if (touchSelectionTimer) {
        clearTimeout(touchSelectionTimer);
        touchSelectionTimer = null;
    }
    if (touchDeleteTimer) {
        clearTimeout(touchDeleteTimer);
        touchDeleteTimer = null;
    }
}

function scheduleTouchSelection(origin) {
    if (!origin) return;
    clearTouchTimers();
    touchHoldStart = origin;
    touchMovedSinceDown = false;
    touchSelectionTimer = setTimeout(() => {
        if (touchMovedSinceDown) return;
        selectionBox = { start: origin, current: origin };
        isPanning = false;
        wireDragStart = null;
        attachDragListeners();
        touchSelectionTimer = null;
    }, TOUCH_SELECTION_HOLD_MS);
}

function scheduleDeleteHold(targetComp) {
    if (!targetComp) return;
    if (touchDeleteTimer) clearTimeout(touchDeleteTimer);
    touchDeleteTimer = setTimeout(() => {
        if (touchMovedSinceDown) return;
        if (selectionGroup.includes(targetComp) && confirm('Delete selected component(s)?')) {
            deleteSelected();
            updateProps();
        }
    }, COMPONENT_DELETE_HOLD_MS);
}

function getPointerXY(e) {
    if (!e) return { clientX: 0, clientY: 0 };
    if (e && e.touches && e.touches.length) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    if (e && e.changedTouches && e.changedTouches.length) {
        return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
}

function canvasPoint(e) {
    const { clientX, clientY } = getPointerXY(e);
    const p = screenToWorld(clientX, clientY);
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

function applyZoom(factor) {
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    clampView();
    markStateDirty();
}

function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY || e.wheelDelta || 0;
    const factor = delta > 0 ? ZOOM_IN_STEP : ZOOM_OUT_STEP;
    applyZoom(factor);
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
    const isTouch = !!(e && e.touches && e.touches.length);
    const touchCount = isTouch ? (e.touches.length || e.changedTouches?.length || 0) : 0;
    if (isTouch && e.cancelable !== false) {
        e.preventDefault();
    }
    // ignore clicks inside UI inputs
    if (isEditableElement(e.target)) {
        return;
    }

    clearTouchTimers();

    const button = (typeof e.button === 'number') ? e.button : 0;
    const shift = !!e.shiftKey;
    const m = canvasPoint(e);
    touchHoldStart = isTouch ? m : null;
    touchMovedSinceDown = false;

    if (!isTouch && button === 1) { // middle mouse
        isPanning = true;
        wireDragStart = m;
        attachDragListeners();
        return;
    }
    if (isTouch && touchCount >= 2) {
        isPanning = true;
        wireDragStart = m;
        attachDragListeners();
        return;
    }

    // right-click -> deselect / cancel
    if (!isTouch && button === 2) {
        if (currentTool) {
            clearToolSelection();
        } else if (activeWire) {
            activeWire = null;
        } else if (activeTemplatePlacement) {
            clearTemplatePlacement();
        }
        pendingComponentDrag = null;
        draggingComponent = null;
        draggingWire      = null;
        wireDragMoved     = false;
        wireDragStart     = null;
        updateProps(); // keep current selection
        return;
    }

    const pinHit  = findPinAt(m);
    const wireHit = pickWireAt(m, WIRE_HIT_DISTANCE);
    let compHit = false;
    for (const c of components) {
        if (c.isInside(m.x, m.y)) { compHit = true; break; }
    }

    // Start placing a template where the cursor is
    if (activeTemplatePlacement && button === 0) {
        const snap = snapToBoardPoint(m.x, m.y);
        placeTemplate(activeTemplatePlacement.template, snap);
        clearTemplatePlacement();
        return;
    }

    // start selection marquee if empty area and not wiring/dragging
    if (!activeWire && !pinHit && !wireHit && !compHit && !currentTool) {
        if (isTouch) {
            isPanning = true;
            wireDragStart = m;
            attachDragListeners();
            scheduleTouchSelection(m);
        } else {
            selectionBox = { start: m, current: m };
            attachDragListeners();
        }
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
            activeWire = null;
            selectedWire = null;

            if (shift) {
                if (selectionGroup.includes(c)) {
                    selectionGroup = selectionGroup.filter(x => x !== c);
                } else {
                    selectionGroup = [...selectionGroup, c];
                }
                selectedComponent = selectionGroup[selectionGroup.length - 1] || null;
                pendingComponentDrag = null;
                updateProps();
                return;
            }

            if (!selectionGroup.includes(c)) {
                selectionGroup = [c];
            }
            selectedComponent = c;
            const targets = selectionGroup.length ? selectionGroup : [c];
            pendingComponentDrag = {
                start: m,
                target: c,
                objs: targets.map(obj => ({
                    obj,
                    offsetX: m.x - obj.x,
                    offsetY: m.y - obj.y
                }))
            };
            draggingComponent = null;
            attachDragListeners();
            if (isTouch) {
                scheduleDeleteHold(c);
            }
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
    if (e && e.touches && e.cancelable !== false) {
        e.preventDefault();
    }
    const m = canvasPoint(e);
    lastMouseWorld = m;
    if (activeTemplatePlacement) {
        const snap = snapToBoardPoint(m.x, m.y);
        if (!templatePreviewOrigin || snap.x !== templatePreviewOrigin.x || snap.y !== templatePreviewOrigin.y) {
            templatePreviewOrigin = snap;
            markStateDirty();
        }
    }

    if (touchHoldStart) {
        const dist = Math.hypot(m.x - touchHoldStart.x, m.y - touchHoldStart.y);
        if (dist > DRAG_DEADZONE) {
            touchMovedSinceDown = true;
            if (touchSelectionTimer) { clearTimeout(touchSelectionTimer); touchSelectionTimer = null; }
            if (touchDeleteTimer) { clearTimeout(touchDeleteTimer); touchDeleteTimer = null; }
        }
    }

    if (isPanning && wireDragStart) {
        const dx = m.x - wireDragStart.x;
        const dy = m.y - wireDragStart.y;
        if (dx || dy) {
            viewOffsetX += dx;
            viewOffsetY += dy;
            wireDragStart = m;
            clampView();
            markStateDirty();
        }
        return;
    }

    if (pendingComponentDrag && !draggingComponent) {
        const dx = m.x - pendingComponentDrag.start.x;
        const dy = m.y - pendingComponentDrag.start.y;
        if (Math.hypot(dx, dy) >= DRAG_DEADZONE) {
            draggingComponent = pendingComponentDrag;
            pendingComponentDrag = null;
        }
    }

    if (draggingComponent) {
        let moved = false;
        draggingComponent.objs.forEach(entry => {
            const c = entry.obj;
            const nx = m.x - entry.offsetX;
            const ny = m.y - entry.offsetY;
            const snap = snapToBoardPoint(nx, ny);
            if (c.x !== snap.x || c.y !== snap.y) {
                c.x = snap.x;
                c.y = snap.y;
                rerouteWiresForComponent(c);
                moved = true;
            }
        });
        if (moved) {
            markStateDirty();
        }
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

    if (!draggingComponent && !draggingWire && !selectionBox && !isPanning && !pendingComponentDrag) {
        hoverWire = pickWireAt(m, WIRE_HIT_DISTANCE);
    } else {
        hoverWire = null;
    }
}

function onCanvasMove(e) {
    if (draggingComponent || draggingWire || isPanning) return;
    onMove(e);
}

function onUp(e) {
    const m = canvasPoint(e);
    let handled = false;

    clearTouchTimers();
    touchHoldStart = null;
    touchMovedSinceDown = false;

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
        selectedComponent = selectionGroup[selectionGroup.length - 1] || null;
        selectionBox = null;
        updateProps();
        handled = true;
    }

    if (draggingComponent) {
        draggingComponent.objs.forEach(entry => {
            autoConnectPins(entry.obj);
            rerouteWiresForComponent(entry.obj);
        });
        draggingComponent = null;
        pendingComponentDrag = null;
        cleanupJunctions();
        markStateDirty();
        handled = true;
    } else if (pendingComponentDrag) {
        const target = pendingComponentDrag.target;
        if (target instanceof Switch) {
            target.toggle();
            markStateDirty();
        }
        if (target) {
            selectedComponent = target;
            if (!selectionGroup.includes(target)) {
                selectionGroup = [target];
            }
            if (target instanceof Oscilloscope) {
                activeScopeComponent = target;
                openScope(target);
            }
        }
        pendingComponentDrag = null;
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

    if (activeWire && !activeWire.toPin) {
        activeWire.currentPoint = snapToBoardPoint(m.x, m.y);
    }

    if (!draggingComponent && !draggingWire && !selectionBox && !isPanning) {
        hoverWire = pickWireAt(m, WIRE_HIT_DISTANCE);
    } else {
        hoverWire = null;
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
        pendingComponentDrag = null;
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

function getCursorPercents() {
    const c1El = document.getElementById('cursor-1');
    const c2El = document.getElementById('cursor-2');
    let pctA = parseFloat(c1El?.style.left || '');
    let pctB = parseFloat(c2El?.style.left || '');
    if (!isFinite(pctA)) pctA = 30;
    if (!isFinite(pctB)) pctB = 70;
    return { a: pctA, b: pctB };
}

function sampleChannelAt(arr, startIdx, pct) {
    const pos = (pct / 100) * HISTORY_SIZE;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const i1 = (startIdx + idx) % HISTORY_SIZE;
    const i2 = (startIdx + idx + 1) % HISTORY_SIZE;
    const v1 = arr[i1];
    const v2 = arr[i2];
    return v1 + (v2 - v1) * frac;
}

function buildCursorMetrics(scope) {
    if (!scope) return null;
    const { a: pctA, b: pctB } = getCursorPercents();
    const tDiv        = parseUnit(scope.props.TimeDiv || '1m');
    const totalWindow = tDiv * 10;
    const tA          = (pctA / 100) * totalWindow;
    const tB          = (pctB / 100) * totalWindow;
    const deltaT      = tB - tA;
    const freq        = deltaT !== 0 ? 1 / Math.abs(deltaT) : null;
    const startIdx    = (scope.head + 1) % HISTORY_SIZE;

    const channels = [
        { key: 'ch1', label: 'CH1', color: '#fbbf24', data: scope.data.ch1 },
        { key: 'ch2', label: 'CH2', color: '#22d3ee', data: scope.data.ch2 }
    ].map(ch => ({
        ...ch,
        va: sampleChannelAt(ch.data, startIdx, pctA),
        vb: sampleChannelAt(ch.data, startIdx, pctB)
    }));

    return { pctA, pctB, tA, tB, deltaT, freq, channels };
}

function setScopeOverlayLayout(mode = scopeDisplayMode || getDefaultScopeMode()) {
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;
    scopeDisplayMode = (mode === 'window') ? 'window' : 'fullscreen';
    const windowed = (scopeDisplayMode === 'window');
    const headerH = document.querySelector('.site-header')?.offsetHeight || 0;
    const { height: viewportH } = getViewportSize();
    overlay.classList.toggle('scope-window', windowed);
    if (windowed) {
        overlay.style.left   = `${scopeWindowPos.x}px`;
        overlay.style.top    = `${headerH + scopeWindowPos.y}px`;
        overlay.style.right  = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.height = `min(520px, ${Math.max(0, viewportH - headerH - 96)}px)`;
    } else {
        overlay.style.left = '';
        overlay.style.right = '';
        overlay.style.bottom = '';
        overlay.style.top = `${headerH}px`;
        overlay.style.height = `${Math.max(0, viewportH - headerH)}px`;
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
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.cancelable !== false) e.preventDefault();
}

function dragCursor(e) {
    if (e && e.touches && e.cancelable !== false) e.preventDefault();
    const container = document.getElementById('scope-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const { clientX } = getPointerXY(e || {});
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(rect.width, x));
    const pct = (x / rect.width) * 100;
    const el = document.getElementById(`cursor-${activeCursor}`);
    if (el) {
        el.style.left = pct + '%';
        updateCursors();
    }
}

function stopDragCursor() {
    window.removeEventListener('mousemove', dragCursor);
    window.removeEventListener('mouseup', stopDragCursor);
    window.removeEventListener('touchmove', dragCursor);
    window.removeEventListener('touchend', stopDragCursor);
}

function updateCursors() {
    if (!scopeCanvas || !scopeCtx) return;
    const scope = activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    if (!scope) return;

    const metrics = buildCursorMetrics(scope);
    if (!metrics) return;

    const tAEl = document.getElementById('cursor-ta');
    const tBEl = document.getElementById('cursor-tb');
    const dtEl = document.getElementById('cursor-dt') || document.getElementById('scope-dt');
    const fEl  = document.getElementById('cursor-freq') || document.getElementById('scope-freq');
    const dtHeader = document.getElementById('scope-dt');

    if (tAEl) tAEl.innerText = formatUnit(metrics.tA, 's');
    if (tBEl) tBEl.innerText = formatUnit(metrics.tB, 's');
    if (dtEl) dtEl.innerText = formatSignedUnit(metrics.deltaT, 's');
    if (dtHeader && dtHeader !== dtEl) dtHeader.innerText = formatSignedUnit(metrics.deltaT, 's');
    if (fEl)  fEl.innerText  = (metrics.deltaT !== 0) ? formatUnit(metrics.freq, 'Hz') : '--';

    metrics.channels.forEach((row, idx) => {
        const vaEl = document.getElementById(`${row.key}-va`);
        const vbEl = document.getElementById(`${row.key}-vb`);
        const dvEl = document.getElementById(`${row.key}-dv`);
        if (vaEl) vaEl.innerText = formatSignedUnit(row.va, 'V');
        if (vbEl) vbEl.innerText = formatSignedUnit(row.vb, 'V');
        if (dvEl) dvEl.innerText = formatSignedUnit(row.vb - row.va, 'V');
        const legacyDv = document.getElementById(`scope-dv${idx + 1}`);
        if (legacyDv) legacyDv.innerText = formatSignedUnit(row.vb - row.va, 'V');
    });
}


function startScopeWindowDrag(e) {
    if (scopeDisplayMode !== 'window') return;
    if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const { clientX, clientY } = getPointerXY(e);
    scopeDragOffset = { x: clientX - rect.left, y: clientY - rect.top };
    isDraggingScope = true;
    window.addEventListener('mousemove', dragScopeWindow);
    window.addEventListener('mouseup', stopScopeWindowDrag);
    window.addEventListener('touchmove', dragScopeWindow, { passive: false });
    window.addEventListener('touchend', stopScopeWindowDrag);
    if (e && e.cancelable !== false) e.preventDefault();
}

function dragScopeWindow(e) {
    if (!isDraggingScope) return;
    if (e && e.touches && e.cancelable !== false) e.preventDefault();
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;

    const w = overlay.offsetWidth;
    const h = overlay.offsetHeight;
    const pad = 8;
    const headerH = document.querySelector('.site-header')?.offsetHeight || 0;
    const { clientX, clientY } = getPointerXY(e);
    let x = clientX - scopeDragOffset.x;
    let y = clientY - scopeDragOffset.y;
    const maxX = Math.max(pad, window.innerWidth - w - pad);
    const minY = headerH + pad;
    const maxY = Math.max(minY, window.innerHeight - h - pad);
    x = Math.min(Math.max(x, pad), maxX);
    y = Math.min(Math.max(y, minY), maxY);

    scopeWindowPos = { x, y: y - headerH };
    overlay.style.left   = `${x}px`;
    overlay.style.top    = `${y}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
}

function stopScopeWindowDrag() {
    isDraggingScope = false;
    window.removeEventListener('mousemove', dragScopeWindow);
    window.removeEventListener('mouseup', stopScopeWindowDrag);
    window.removeEventListener('touchmove', dragScopeWindow);
    window.removeEventListener('touchend', stopScopeWindowDrag);
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

function updateViewLabel() {
    const label = document.getElementById('view-label');
    if (!label) return;
    label.innerText = (viewMode === 'physical') ? 'Breadboard View' : 'Schematic View';
}

function toggleView() {
    viewMode = (viewMode === 'physical') ? 'schematic' : 'physical';
    updateViewLabel();
    markStateDirty();
    if (!scopeDisplayMode) scopeDisplayMode = getDefaultScopeMode();
    setScopeOverlayLayout(scopeDisplayMode);
    if (scopeMode) {
        resize();
        drawScope();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const collapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const icon = document.getElementById('sidebar-toggle-icon');
    if (icon) icon.className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    if (sidebar) sidebar.setAttribute('aria-expanded', (!collapsed).toString());
    syncSidebarOverlayState(collapsed);
    resize();
    requestAnimationFrame(resize);
}

function zoomInButton() { applyZoom(ZOOM_IN_STEP); }
function zoomOutButton() { applyZoom(ZOOM_OUT_STEP); }

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
    pendingComponentDrag = null;
    draggingWire      = null;
    wireDragMoved     = false;
    wireDragStart     = null;
    activeScopeComponent = null;
    templatePlacementCount = 0;
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
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
        window.visualViewport.addEventListener('scroll', resize);
    }
    resize();
    renderToolIcons();
    renderTemplateButtons();
    alignScopeButton();
    attachScopeControlHandlers();
    syncScopeControls();
    updatePlayPauseButton();
    updateViewLabel();
    ensureSidebarExpanded();
    syncSidebarOverlayState();
    if (canvas && canvas.parentElement && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => resize());
        ro.observe(canvas.parentElement);
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('dblclick',  onDblClick);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onCanvasMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
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
