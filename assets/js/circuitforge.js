import {
    createResistor,
    createPotentiometer,
    createCapacitor,
    createLED,
    createSwitch,
    createJunction,
    createMOSFET,
    createLF412,
    createVoltageSource,
    createFunctionGenerator,
    createGround,
    createOscilloscope
} from './circuit-lab/components/index.js';
import {
    COMPONENT_ID_PREFIXES,
    defaultIdRegistry as componentIdRegistry,
    reserveComponentId as reserveComponentIdForRegistry,
    releaseComponentId as releaseComponentIdForRegistry,
    resetIdRegistry as resetIdRegistryState
} from './sim/utils/idGenerator.js';
import { listTemplates, loadTemplate } from './circuit-lab/templateRegistry.js';
import { solveCircuitWasm, updateCircuitState } from './sim/wasmInterface.js';
import { createWiringApi } from './circuit-lab/wiring.js';

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
const DEFAULT_SCOPE_WINDOW_POS = { x: 12, y: 0 };
const SCOPE_WINDOW_MODE_ENABLED = false; // Disable windowed scope view without removing code paths
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
const MOBILE_BREAKPOINT     = 768;
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

const ID_PREFIXES = COMPONENT_ID_PREFIXES;

function resetIdRegistry() {
    resetIdRegistryState(componentIdRegistry);
}

function reserveComponentId(kind, providedId) {
    const prefix = (ID_PREFIXES[kind] || 'X').toUpperCase();
    return reserveComponentIdForRegistry(prefix, componentIdRegistry, providedId);
}

function releaseComponentId(id) {
    releaseComponentIdForRegistry(id, componentIdRegistry);
}

function reassignComponentId(comp, newId) {
    if (!newId || newId === comp.id) return comp.id;
    releaseComponentId(comp.id);
    comp.id = reserveComponentId(comp.kind, newId);
    return comp.id;
}

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
// Wires are stored as { from: {c, p}, to: {c, p}, vertices: [{x,y}] } where vertices are
// user waypoints between the pins. getWirePolyline() renders an orthogonal path through
// those waypoints; we try hard not to discard bends unless a vertex is truly redundant.
let wires      = [];
let time       = 0;
let isPaused   = true;
let simError   = null;
let simErrorMessage = '';
let warnedNoSources = false;

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
let scopeWindowSize = { width: 640, height: 420 };
let scopeHorizontalDivs = 10;
let scopeDragStart = null;
let scopeDragBounds = null;
let isDraggingScope = false;
let autosaveTimer = null;
let isRestoringState = false;
let currentSwitchType = DEFAULT_SWITCH_TYPE;
let templatePlacementCount = 0;
let activeTemplatePlacement = null; // { template, origin }
let templatePreviewOrigin = null;
let clipboardTemplate = null;
let lastMouseWorld = { x: 0, y: 0 };
let touchSelectionTimer = null;
let touchDeleteTimer = null;
let touchHoldStart = null;
let touchMovedSinceDown = false;
let pinchState = null;
const cursorVisibility = { 1: true, 2: true };

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

function computeWorkspaceHeight({ viewportH = 0, headerH = 0, simBarH = 0, subtractSimBar = true } = {}) {
    const safeViewport = Number.isFinite(viewportH) ? viewportH : 0;
    const safeHeader   = Number.isFinite(headerH) ? headerH : 0;
    const safeSimbar   = Number.isFinite(simBarH) ? simBarH : 0;
    const simDeduct = subtractSimBar ? safeSimbar : 0;
    return Math.max(0, safeViewport - safeHeader - simDeduct);
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
    const headerH = header?.getBoundingClientRect?.().height ?? header?.offsetHeight ?? 0;
    root.style.setProperty('--header-h', `${Math.max(0, headerH || 0)}px`);

    const simBar = document.getElementById('sim-bar');
    const simBarH = simBar?.getBoundingClientRect?.().height ?? simBar?.offsetHeight ?? 0;
    root.style.setProperty('--simbar-height', `${Math.max(0, simBarH || 0)}px`);

    const supportsDvh = (typeof CSS !== 'undefined') && CSS.supports?.('height: 100dvh');
    if (!supportsDvh) {
        // Fallback for older browsers: calculate workspace height manually.
        const subtractSimBar = true;
        const workspaceH = computeWorkspaceHeight({
            viewportH: height,
            headerH,
            simBarH,
            subtractSimBar
        });
        if (workspaceH || workspaceH === 0) {
            root.style.setProperty('--workspace-h', `${workspaceH}px`);
        }
    } else {
        // Allow CSS 100dvh rule to drive the layout.
        root.style.removeProperty('--workspace-h');
    }

    if (isLayoutDebuggingEnabled()) {
        const check = validateLayoutHeights();
        if (!check.ok) {
            console.warn('Circuit Lab layout check: height mismatch', check);
        }
    }
}

function validateLayoutHeights(tolerance = 3) {
    if (typeof document === 'undefined') return { ok: true, delta: 0, parts: {} };
    const { height: viewportH } = getViewportSize();
    const headerEl = document.querySelector('.site-header');
    const simBarEl = document.getElementById('sim-bar');
    const workspaceEl = document.getElementById('circuit-lab-root')
        || document.querySelector('.lab-main')
        || document.querySelector('.canvas-shell');

    const headerH = headerEl?.getBoundingClientRect?.().height ?? headerEl?.offsetHeight ?? 0;
    const simBarH = simBarEl?.getBoundingClientRect?.().height ?? simBarEl?.offsetHeight ?? 0;
    const workspaceH = workspaceEl?.getBoundingClientRect?.().height ?? workspaceEl?.offsetHeight ?? 0;
    const expectedWorkspace = computeWorkspaceHeight({ viewportH, headerH, simBarH });
    const delta = Math.abs((headerH + simBarH + workspaceH) - viewportH);
    return {
        ok: delta <= tolerance,
        delta,
        parts: { viewportH, headerH, simBarH, workspaceH, expectedWorkspace }
    };
}

function isLayoutDebuggingEnabled() {
    if (typeof document === 'undefined') return false;
    const body = document.body;
    if (!body) return false;
    return body.dataset.debugLayout === 'true' || body.hasAttribute('data-debug-layout');
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
        this.id   = reserveComponentId((this.constructor?.name || 'component').toLowerCase());
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

    shouldSkipDefaultPins() { return false; }

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

        if (this.shouldSkipDefaultPins(mode)) return;

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

/* === COMPONENT CONSTRUCTORS === */

const componentFactoryContext = {
    Component,
    getResColor,
    getPinCenter,
    LABEL_GAP_SMALL,
    LABEL_FONT_MEDIUM,
    LABEL_FONT_SMALL,
    LABEL_GAP_MEDIUM,
    PIN_LABEL_DISTANCE,
    offsetLabelFromPin,
    parseUnit,
    formatUnit,
    SWITCH_TYPES,
    DEFAULT_SWITCH_TYPE,
    getCurrentSwitchType: () => currentSwitchType,
    getWires: () => wires,
    setWires: (next) => { wires = next; },
    LABEL_FONT_BOLD,
    LABEL_OUTSIDE_OFFSET,
    getPinDirection,
    PIN_HEAD_RADIUS,
    LABEL_FONT_MOSFET_TYPE,
    HISTORY_SIZE,
    getSimState: () => ({ isPaused, simError, time })
};

const Resistor = createResistor(componentFactoryContext);
const Potentiometer = createPotentiometer(componentFactoryContext);
const Capacitor = createCapacitor(componentFactoryContext);
const LED = createLED(componentFactoryContext);
const Switch = createSwitch(componentFactoryContext);
const Junction = createJunction(componentFactoryContext);
const MOSFET = createMOSFET(componentFactoryContext);
const LF412 = createLF412(componentFactoryContext);
const VoltageSource = createVoltageSource(componentFactoryContext);
const FunctionGenerator = createFunctionGenerator(componentFactoryContext);
const Ground = createGround(componentFactoryContext);
const Oscilloscope = createOscilloscope(componentFactoryContext);

/* ============================================================
 *  PART 3 – SIMULATION, DRAWING, WIRING & UI
 * ==========================================================*/

/* ---------- SIMULATION CORE (MNA) ---------- */

function checkSimReadiness() {
    if (!components.length) return { ok: true };

    const hasReferenceCandidate = components.some(c =>
        c instanceof Ground || c instanceof VoltageSource || c instanceof FunctionGenerator
    );
    if (!hasReferenceCandidate) {
        return { ok: false, message: 'Add a Ground or tie a source reference before running simulation.' };
    }

    const hasSource = components.some(c =>
        c instanceof VoltageSource || c instanceof FunctionGenerator
    );
    if (!hasSource && !warnedNoSources) {
        console.warn('Circuit Forge: no sources detected; simulation will stay at 0V until a source is added.');
        warnedNoSources = true;
    } else if (hasSource) {
        warnedNoSources = false;
    }

    return { ok: true };
}

function simulate(t) {
    if (!components.length) {
        simError = null;
        return;
    }

    if (typeof solveCircuitWasm !== 'function' || typeof updateCircuitState !== 'function') {
        simError = 'Simulation core not available';
        isPaused = true;
        updatePlayPauseButton();
        return;
    }

    const result = solveCircuitWasm({
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
        console.warn('Simulation halted:', result.error);
        simError = result.error;
        isPaused = true;
        updatePlayPauseButton();
        return;
    }

    const sol = result.solution || [];
    const getNodeIdx = result.getNodeIndex || (() => -1);

    updateCircuitState({
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
            const horizDivs  = getScopeHorizontalDivs();
            const windowTime = tDiv * horizDivs;
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

function mergeCollinear(pts = []) {
    // Keep user bends intact; only drop true duplicates/zero-length segments.
    if (!Array.isArray(pts) || pts.length < 2) return Array.isArray(pts) ? pts.slice() : [];
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = out[out.length - 1];
        const curr = pts[i];
        const next = pts[i + 1];

        const duplicatePrev = (curr.x === prev.x && curr.y === prev.y);
        const duplicateNext = (curr.x === next.x && curr.y === next.y);
        if (duplicatePrev || duplicateNext) continue;

        out.push(curr);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (last.x !== tail.x || last.y !== tail.y) out.push(last);
    return out;
}

function ensureOrthogonalPath(points, preferredOrientation = null) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = out[out.length - 1];
        const curr = points[i];
        if (prev.x !== curr.x && prev.y !== curr.y) {
            const preferH = preferredOrientation === ROUTE_ORIENTATION.H_FIRST;
            const preferV = preferredOrientation === ROUTE_ORIENTATION.V_FIRST;
            let elbow;
            if (preferH && !preferV) {
                elbow = { x: curr.x, y: prev.y };
            } else if (preferV && !preferH) {
                elbow = { x: prev.x, y: curr.y };
            } else {
                const dx = Math.abs(curr.x - prev.x);
                const dy = Math.abs(curr.y - prev.y);
                elbow = (dx >= dy) ? { x: curr.x, y: prev.y } : { x: prev.x, y: curr.y };
            }
            out.push(snapToBoardPoint(elbow.x, elbow.y));
        }
        out.push(curr);
    }
    return out;
}

function orthogonalizeWire(wire) {
    if (!wire || !wire.from?.c || !wire.to?.c) return;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const mids = (wire.vertices || []).map(v => snapToBoardPoint(v.x, v.y));
    const pref = wire.routePref || inferRoutePreference(start, mids, end);
    const path = buildStableWirePath(start, mids, end, { routePref: pref });
    const verts = path.slice(1, Math.max(1, path.length - 1));
    wire.vertices = verts;
    wire.routePref = pref;
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

const ROUTE_ORIENTATION = {
    H_FIRST: 'h-first',
    V_FIRST: 'v-first'
};

function directionToOrientation(dir) {
    if (!dir) return null;
    if (Math.abs(dir.x) >= Math.abs(dir.y)) return ROUTE_ORIENTATION.H_FIRST;
    if (Math.abs(dir.y) > Math.abs(dir.x)) return ROUTE_ORIENTATION.V_FIRST;
    return null;
}

function firstSegmentOrientation(points = []) {
    if (!Array.isArray(points)) return null;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        if (!prev || !curr) continue;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        if (dx === 0 && dy === 0) continue;
        return (Math.abs(dx) >= Math.abs(dy)) ? ROUTE_ORIENTATION.H_FIRST : ROUTE_ORIENTATION.V_FIRST;
    }
    return null;
}

function lastSegmentOrientation(points = []) {
    if (!Array.isArray(points)) return null;
    for (let i = points.length - 1; i > 0; i--) {
        const curr = points[i];
        const prev = points[i - 1];
        if (!curr || !prev) continue;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        if (dx === 0 && dy === 0) continue;
        return (Math.abs(dx) >= Math.abs(dy)) ? ROUTE_ORIENTATION.H_FIRST : ROUTE_ORIENTATION.V_FIRST;
    }
    return null;
}

function inferRoutePreference(start, verts = [], end) {
    const poly = [start, ...(verts || []), end].filter(Boolean);
    return firstSegmentOrientation(poly);
}

function tagWireRoutePreference(wire) {
    if (!wire?.from?.c || !wire?.to?.c) return wire;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    wire.routePref = inferRoutePreference(start, wire.vertices || [], end);
    return wire;
}

function buildTwoPointPath(start, end, orientationHint = null) {
    if (start.x === end.x || start.y === end.y) return [start, end];
    const preferH = orientationHint === ROUTE_ORIENTATION.H_FIRST;
    const preferV = orientationHint === ROUTE_ORIENTATION.V_FIRST;
    let elbow;
    if (preferH && !preferV) {
        elbow = { x: end.x, y: start.y };
    } else if (preferV && !preferH) {
        elbow = { x: start.x, y: end.y };
    } else {
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);
        elbow = (dx >= dy) ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
    }
    const snapElbow = snapToBoardPoint(elbow.x, elbow.y);
    return [start, snapElbow, end];
}

function alignEndpoint(path = [], side = 'start', orientationHint = null) {
    if (!Array.isArray(path) || path.length < 2) return path;
    const anchorIdx = (side === 'end') ? path.length - 1 : 0;
    const neighborIdx = (side === 'end') ? path.length - 2 : 1;
    const anchor = path[anchorIdx];
    const neighbor = { ...(path[neighborIdx] || {}) };
    if (!anchor || neighborIdx < 0 || !isFinite(neighbor.x) || !isFinite(neighbor.y)) return path;
    if (anchor.x === neighbor.x || anchor.y === neighbor.y) {
        path[neighborIdx] = snapToBoardPoint(neighbor.x, neighbor.y);
        return path;
    }
    const preferH = orientationHint === ROUTE_ORIENTATION.H_FIRST;
    const preferV = orientationHint === ROUTE_ORIENTATION.V_FIRST;
    if (preferH && !preferV) {
        neighbor.y = anchor.y;
    } else if (preferV && !preferH) {
        neighbor.x = anchor.x;
    } else {
        const dx = Math.abs(neighbor.x - anchor.x);
        const dy = Math.abs(neighbor.y - anchor.y);
        if (dx >= dy) neighbor.y = anchor.y;
        else neighbor.x = anchor.x;
    }
    path[neighborIdx] = snapToBoardPoint(neighbor.x, neighbor.y);
    return path;
}

function buildStableWirePath(start, midPoints, end, { routePref = null, startOrientation = null, endOrientation = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const s = snap(start);
    const e = snap(end);
    const mids = Array.isArray(midPoints) ? midPoints.map(p => snap(p)) : [];
    const pref = routePref || inferRoutePreference(s, mids, e);
    const path = ensureOrthogonalPath([s, ...mids, e], pref);
    if (path.length === 2) {
        return mergeCollinear(buildTwoPointPath(s, e, pref));
    }
    const orientedStart = startOrientation || pref;
    const orientedEnd = endOrientation || pref;
    alignEndpoint(path, 'start', orientedStart);
    alignEndpoint(path, 'end', orientedEnd);
    return mergeCollinear(path);
}

// Build an orthogonal path that honours user-provided midpoints in sequence and
// uses pin directions to bias stub placement near endpoints.
function routeManhattan(start, midPoints, end, startDir = null, endDir = null, opts = {}) {
    const preferredOrientation = opts.preferredOrientation || null;
    const stickiness = Number.isFinite(opts.stickiness) ? opts.stickiness : 0.6;
    let orientationHint = preferredOrientation;
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
        const orientA = ROUTE_ORIENTATION.H_FIRST;
        const orientB = ROUTE_ORIENTATION.V_FIRST;

        function score(path, orientation) {
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
            if (orientationHint && orientation) {
                if (orientation === orientationHint) s -= stickiness;
                else s += stickiness * 0.25;
            }
            return s;
        }

        const scoreA = score(pathA, orientA);
        const scoreB = score(pathB, orientB);
        const pickA = scoreA <= scoreB;
        const best = pickA ? pathA : pathB;
        const chosenOrientation = pickA ? orientA : orientB;
        if (!orientationHint) orientationHint = chosenOrientation;

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

// When an endpoint moves, only adjust the segments touching that endpoint to keep
// the wire orthogonal; leave interior vertices untouched so user-defined bends stay put.
function adjustWireAnchors(wire, { start, end, startDir = null, endDir = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const poly = [
        snap(start),
        ...(Array.isArray(wire?.vertices) ? wire.vertices.map(v => snap(v)) : []),
        snap(end)
    ];

    function insertElbow(anchorIdx, neighborIdx, dirHint = null) {
        const anchor = poly[anchorIdx];
        const neighbor = poly[neighborIdx];
        if (!anchor || !neighbor) return;
        if (anchor.x === neighbor.x || anchor.y === neighbor.y) return; // already orthogonal

        const preferX = !!(dirHint && dirHint.x);
        const preferY = !!(dirHint && dirHint.y);
        let elbow;
        if (preferX && !preferY) {
            elbow = { x: neighbor.x, y: anchor.y };
        } else if (preferY && !preferX) {
            elbow = { x: anchor.x, y: neighbor.y };
        } else {
            const dx = Math.abs(neighbor.x - anchor.x);
            const dy = Math.abs(neighbor.y - anchor.y);
            elbow = (dx >= dy) ? { x: neighbor.x, y: anchor.y } : { x: anchor.x, y: neighbor.y };
        }
        const snapped = snap(elbow);
        if ((snapped.x === anchor.x && snapped.y === anchor.y) ||
            (snapped.x === neighbor.x && snapped.y === neighbor.y)) {
            return;
        }
        // Place the elbow between anchor and neighbor; index choice keeps vertex order stable.
        const insertIdx = anchorIdx < neighborIdx ? neighborIdx : anchorIdx;
        poly.splice(insertIdx, 0, snapped);
    }

    if (startDir) insertElbow(0, 1, startDir);
    if (endDir) insertElbow(poly.length - 1, poly.length - 2, endDir);

    const cleaned = mergeCollinear(poly);
    return cleaned.slice(1, Math.max(1, cleaned.length - 1));
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

    tagWireRoutePreference(wireA);
    tagWireRoutePreference(wireB);

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
    const startOrientation = directionToOrientation(dir);
    const endOrientation = directionToOrientation(endDir);
    return buildStableWirePath(
        pStart,
        w.vertices || [],
        pEnd,
        {
            routePref: w.routePref || null,
            startOrientation: startOrientation || w.routePref || null,
            endOrientation: endOrientation || w.routePref || null
        }
    );
}

function pruneFloatingJunctions() {
    const connected = new Set();
    wires.forEach(w => {
        connected.add(w.from.c);
        connected.add(w.to.c);
    });
    components = components.filter(c => {
        if (c instanceof Junction && !connected.has(c)) {
            releaseComponentId(c.id);
            return false;
        }
        return true;
    });
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
                releaseComponentId(j.id);
                components = components.filter(c => c !== j);
                changed = true;
            } else if (deg === 1) {
                releaseComponentId(j.id);
                wires = wires.filter(w => !conn.includes(w));
                components = components.filter(c => c !== j);
                changed = true;
            } else if (deg === 2) {
                const [w1, w2] = conn;
                const a = otherEnd(w1, j);
                const b = otherEnd(w2, j);
                const dirFromJ = (wire) => {
                    const poly = getWirePolyline(wire);
                    const start = (wire.from.c === j) ? poly[0] : poly[poly.length - 1];
                    const next = (wire.from.c === j) ? poly[1] : poly[poly.length - 2];
                    if (!start || !next) return null;
                    return { x: Math.sign(next.x - start.x), y: Math.sign(next.y - start.y) };
                };
                const d1 = dirFromJ(w1);
                const d2 = dirFromJ(w2);
                const collinear = d1 && d2 && (
                    (d1.x !== 0 && d2.x !== 0 && d1.y === 0 && d2.y === 0) ||
                    (d1.y !== 0 && d2.y !== 0 && d1.x === 0 && d2.x === 0)
                );
                // Keep intentional corners (90deg) intact; only remove straight-through links.
                if (!collinear) continue;
                const mergedVerts = mergeCollinear(buildWireVertices(a, [], b) || []);
                const newWire = {
                    from: a,
                    to: b,
                    vertices: mergedVerts,
                    v: (w1.v || 0)
                };
                tagWireRoutePreference(newWire);
                wires = wires.filter(w => w !== w1 && w !== w2);
                wires.push(newWire);
                releaseComponentId(j.id);
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
        const prev = pts[i - 1];
        const curr = pts[i];
        const next = pts[i + 1];
        if ((prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y)) {
            continue;
        }
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
        const pts = routeManhattan(
            fromPos,
            activeWire.vertices || [],
            mousePt,
            dir,
            null,
            { preferredOrientation: activeWire.routePref || null }
        );
        const previewOrientation = firstSegmentOrientation(pts);
        if (!activeWire.routePref && previewOrientation) activeWire.routePref = previewOrientation;
        drawWirePolyline(pts, '#ffffff', ACTIVE_WIRE_WIDTH, true);
    }
}

function drawTemplatePreview() {
    if (!activeTemplatePlacement || !templatePreviewOrigin) return;
    const template = activeTemplatePlacement.template;
    const origin = templatePreviewOrigin;
    const { created: tempComponents, center, idMap, indexMap } = instantiateTemplateComponents(template, origin);

    const tempWires = (template.wires || []).map((wire) => {
        const from = mapTemplateEndpoint(wire?.from, idMap, indexMap);
        const to = mapTemplateEndpoint(wire?.to, idMap, indexMap);
        if (!from.comp || !to.comp || typeof from.pin !== 'number' || typeof to.pin !== 'number') return null;
        const mid = (wire.vertices || []).map(v => ({
            x: origin.x + ((v?.x || 0) - center.x),
            y: origin.y + ((v?.y || 0) - center.y)
        }));
        return {
            from: { c: from.comp, p: from.pin },
            to: { c: to.comp, p: to.pin },
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
    const dpr = window.devicePixelRatio || 1;
    const drawW = (scopeCanvas.clientWidth || w / dpr);
    const drawH = (scopeCanvas.clientHeight || scopeCanvas.height / dpr);
    scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const h = drawH;
    const gridCell = (h || 1) / 10;
    const horizontalDivs = getScopeHorizontalDivs(drawW, drawH, { updateCache: true });

    // 1. Clear with BLACK (Hardware look)
    scopeCtx.fillStyle = '#000000';
    scopeCtx.fillRect(0, 0, drawW, h);

    // 2. Draw Grid (Dark Gray)
    scopeCtx.strokeStyle = '#333333';
    scopeCtx.lineWidth   = 1;
    scopeCtx.beginPath();
    for (let i = 1; i < horizontalDivs; i++) {
        const x = i * gridCell;
        scopeCtx.moveTo(x, 0); scopeCtx.lineTo(x, h);
    }
    for (let j = 1; j < 10; j++) {
        const y = j * gridCell;
        scopeCtx.moveTo(0, y); scopeCtx.lineTo(drawW, y);
    }
    scopeCtx.stroke();

    // 3. Draw Axis (Lighter Gray)
    const midY = h / 2;
    scopeCtx.strokeStyle = '#666666';
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, midY); scopeCtx.lineTo(drawW, midY);
    scopeCtx.stroke();

    // 4. Draw Text (WHITE - CRITICAL FIX)
    scopeCtx.fillStyle = '#ffffff';
    scopeCtx.font      = 'bold 12px monospace';
    scopeCtx.textAlign = 'left';
    scopeCtx.fillText('0 V', 6, midY - 6);

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

    const showCursor1 = cursorIsVisible(1);
    const showCursor2 = cursorIsVisible(2);

    function renderChannel(ch) {
        scopeCtx.strokeStyle = ch.color;
        scopeCtx.lineWidth   = 2;
        scopeCtx.beginPath();
        for (let x = 0; x < drawW; x++) {
            const t   = x / drawW;
            const off = Math.floor(t * HISTORY_SIZE);
            const idx = (startIdx + off) % HISTORY_SIZE;
            const v   = ch.data[idx];
            const y   = midY - v * ch.scale;
            if (x === 0) scopeCtx.moveTo(x, y);
            else scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();
    }

    channels.forEach(renderChannel);

    const cursorMetrics = buildCursorMetrics(scope);
    if (cursorMetrics && (showCursor1 || showCursor2)) {
        const drawCursorMarker = (pct, color, values) => {
            const x = (pct / 100) * drawW;
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

        if (showCursor1) drawCursorMarker(cursorMetrics.pctA, '#fcd34d', valuesA);
        if (showCursor2) drawCursorMarker(cursorMetrics.pctB, '#06b6d4', valuesB);
    }

    // keep cursor Δt / ΔV working even when the sim is paused
    updateCursors();
}

/* ---------- UI HELPERS / MODES ---------- */
function resize() {
    if (!canvas) return;
    syncViewportCssVars();
    
    // 1. Get the PARENT container dimensions
    // The CSS flexbox rules determine how big this shell is.
    const container = canvas.parentElement; 
    const rect = container?.getBoundingClientRect?.();
    let w = container ? (container.clientWidth || rect?.width || 0) : 0;
    let h = container ? (container.clientHeight || rect?.height || 0) : 0;

    // Fallback: when overlays are visible some layouts report 0 height; derive from viewport instead.
    if (!w || !h) {
        const { width: vw, height: vh } = getViewportSize();
        const headerH = document.querySelector('.site-header')?.getBoundingClientRect?.().height || 0;
        const simBarH = document.getElementById('sim-bar')?.getBoundingClientRect?.().height || 0;
        w = w || vw || canvasCssWidth || 0;
        h = h || computeWorkspaceHeight({ viewportH: vh, headerH, simBarH }) || canvasCssHeight || 0;
    }

    // 2. Update Canvas Memory (Resolution)
    // Use devicePixelRatio for sharp text on Retinas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    // 3. Update Canvas Display Size (CSS)
    // CRITICAL: Explicitly set style to match container
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // 4. Update Globals
    canvasDisplayWidth = canvas.width;
    canvasDisplayHeight = canvas.height;
    canvasCssWidth = w;
    canvasCssHeight = h;

    // 5. Handle Scope
    if (scopeCanvas && document.getElementById('scope-container')) {
        const sw = document.getElementById('scope-container').clientWidth;
        const sh = document.getElementById('scope-container').clientHeight;
        const dpr = window.devicePixelRatio || 1;
        scopeCanvas.width = Math.max(1, Math.floor(sw * dpr));
        scopeCanvas.height = Math.max(1, Math.floor(sh * dpr));
        scopeCanvas.style.width = `${sw}px`;
        scopeCanvas.style.height = `${sh}px`;
    }

    // Keep layout helpers in sync after size changes
    syncSidebarOverlayState();
    if (scopeMode) {
        setScopeOverlayLayout(scopeDisplayMode);
    }
    updateToolsToggleLabel();
    clampView();
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

    // Determine ink color based on computed background/theme
    const btnStyle = getComputedStyle(btn);
    const bg = btnStyle.backgroundColor || '';
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    const luminance = match ? (0.299 * +match[1] + 0.587 * +match[2] + 0.114 * +match[3]) / 255 : null;
    const isLight = document.body.classList.contains('theme-light') || (luminance !== null && luminance > 0.5);
    const strokeColor = isLight ? '#1e293b' : '#f1f5f9';

    ictx.save();
    ictx.translate(canvas.width / 2, canvas.height / 2 + offsetY);
    ictx.scale(scale, scale);

    ictx.strokeStyle = strokeColor;
    ictx.fillStyle = strokeColor;
    c.drawPhys(ictx);

    const skipPins = (c instanceof MOSFET);
    if (!skipPins && Array.isArray(c.pins)) {
        ictx.strokeStyle = strokeColor;
        ictx.lineWidth = 1.2;
        c.pins.forEach(p => {
            const pos = c.localToWorld(p.x, p.y);
            ictx.beginPath();
            ictx.moveTo(pos.x, pos.y);
            ictx.lineTo(pos.x, pos.y + GRID * 0.25);
            ictx.stroke();
            ictx.fillStyle = strokeColor;
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
    const root = document.getElementById('circuit-lab-root');
    if (!sidebar) return;
    if (isMobileViewport()) {
        if (root && root.classList.contains('sidebar-open')) {
            root.classList.remove('sidebar-open');
        }
        sidebar.classList.remove('collapsed');
        document.body.classList.remove('sidebar-collapsed');
        const open = root?.classList.contains('sidebar-open') || false;
        sidebar.setAttribute('aria-expanded', open ? 'true' : 'false');
        updateToolsToggleLabel(open);
        return;
    }
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
        const root = document.getElementById('circuit-lab-root');
        const isCollapsed = (forceCollapsed != null)
            ? forceCollapsed
            : (sidebar ? sidebar.classList.contains('collapsed') : true);
        const sidebarOpen = isMobileViewport()
            ? (root ? root.classList.contains('sidebar-open') : false)
            : !isCollapsed;
        const shouldOverlay = isMobileViewport() && sidebarOpen && !isCollapsed;
        const canvasShell = document.querySelector('.canvas-panel, .canvas-shell');
        if (canvasShell) {
            canvasShell.setAttribute('aria-hidden', shouldOverlay ? 'true' : 'false');
            canvasShell.classList.toggle('sidebar-obscured', !!shouldOverlay);
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

function copySelection() {
    const targets = selectionGroup.length
        ? selectionGroup.slice()
        : (selectedComponent ? [selectedComponent] : []);
    if (!targets.length) return null;
    clipboardTemplate = serializeTemplate(targets);
    return clipboardTemplate;
}

function cutSelection() {
    const copied = copySelection();
    if (copied) deleteSelected();
}

function pasteClipboard() {
    if (!clipboardTemplate) return;
    const payload = (typeof structuredClone === 'function')
        ? structuredClone(clipboardTemplate)
        : JSON.parse(JSON.stringify(clipboardTemplate));
    queueTemplatePlacement(payload);
}

function rerouteWiresForComponent(c) {
    wires.forEach(w => {
        if (w.from.c !== c && w.to.c !== c) return;

        const startPos = w.from.c.getPinPos(w.from.p);
        const endPos   = w.to.c.getPinPos(w.to.p);
        const startDir = (w.from.c === c) ? getPinDirection(w.from.c, w.from.p) : null;
        const endDir   = (w.to.c === c) ? getPinDirection(w.to.c, w.to.p) : null;
        const updated = adjustWireAnchors(w, {
            start: startPos,
            end: endPos,
            startDir,
            endDir
        });
        const path = buildStableWirePath(
            startPos,
            updated,
            endPos,
            {
                routePref: w.routePref || inferRoutePreference(startPos, updated, endPos),
                startOrientation: directionToOrientation(startDir),
                endOrientation: directionToOrientation(endDir)
            }
        );
        w.vertices = path.slice(1, Math.max(1, path.length - 1));
        tagWireRoutePreference(w);
    });
}

function snapshotWireForDrag(wire, movingSet) {
    const poly = getWirePolyline(wire);
    const start = poly[0];
    const end = poly[poly.length - 1];
    return {
        wire,
        polyline: poly,
        fromMoved: movingSet.has(wire.from.c),
        toMoved: movingSet.has(wire.to.c),
        routePref: wire.routePref || inferRoutePreference(start, poly.slice(1, Math.max(1, poly.length - 1)), end),
        startOrientation: firstSegmentOrientation(poly),
        endOrientation: lastSegmentOrientation(poly)
    };
}

function captureWireSnapshots(movingComponents = []) {
    const movingSet = new Set(movingComponents);
    const snaps = [];
    wires.forEach(w => {
        if (!movingSet.has(w.from.c) && !movingSet.has(w.to.c)) return;
        snaps.push(snapshotWireForDrag(w, movingSet));
    });
    return snaps;
}

function updateWireFromSnapshot(snapshot, deltaMap) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const safeDelta = (comp) => {
        const delta = deltaMap?.get(comp);
        return delta ? delta : { dx: 0, dy: 0 };
    };
    const startDelta = safeDelta(wire.from.c);
    const endDelta = safeDelta(wire.to.c);
    const movedTogether = snapshot.fromMoved && snapshot.toMoved &&
        startDelta.dx === endDelta.dx && startDelta.dy === endDelta.dy;

    const mids = snapshot.polyline.slice(1, Math.max(1, snapshot.polyline.length - 1)).map(p => ({ ...p }));

    if (movedTogether) {
        // Preserve the exact shape when both endpoints move as a group; just translate the midpoints.
        const shifted = mids.map(p => snapToBoardPoint(p.x + startDelta.dx, p.y + startDelta.dy));
        wire.vertices = mergeCollinear(shifted);
        wire.routePref = snapshot.routePref || wire.routePref || inferRoutePreference(start, wire.vertices, end);
        return;
    }

    const adjusted = mids.map((p, idx, arr) => {
        let x = p.x;
        let y = p.y;
        if (snapshot.fromMoved && idx === 0) {
            x += startDelta.dx;
            y += startDelta.dy;
        }
        if (snapshot.toMoved && idx === arr.length - 1) {
            x += endDelta.dx;
            y += endDelta.dy;
        }
        return { x, y };
    });

    const path = buildStableWirePath(
        start,
        adjusted,
        end,
        {
            routePref: snapshot.routePref,
            startOrientation: snapshot.startOrientation,
            endOrientation: snapshot.endOrientation
        }
    );
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = snapshot.routePref || wire.routePref || inferRoutePreference(start, wire.vertices, end);
}

function normalizeWireFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const path = buildStableWirePath(
        start,
        wire.vertices || [],
        end,
        {
            routePref: wire.routePref || snapshot.routePref,
            startOrientation: snapshot.startOrientation,
            endOrientation: snapshot.endOrientation
        }
    );
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = wire.routePref || snapshot.routePref || inferRoutePreference(start, wire.vertices, end);
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
        compsToRemove.forEach(c => releaseComponentId(c.id));
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
    const templates = listTemplates();
    if (templates.length) return templates;
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

function normalizeTemplateComponent(def = {}) {
    return {
        type: def.type || def.kind,
        id: def.id,
        x: def.x || 0,
        y: def.y || 0,
        rotation: def.rotation ?? 0,
        mirrorX: !!def.mirrorX,
        props: def.props || {}
    };
}

function instantiateTemplateComponents(template, origin) {
    const center = getTemplateCenter(template);
    const created = [];
    const idMap = new Map();
    const indexMap = new Map();
    const base = origin || { x: 0, y: 0 };

    (template.components || []).forEach((raw, idx) => {
        const def = normalizeTemplateComponent(raw || {});
        const Ctor = TOOL_COMPONENTS[def.type];
        if (!Ctor) return;
        const c = new Ctor(base.x + (def.x - center.x), base.y + (def.y - center.y));
        c.props = { ...c.props, ...def.props };
        c.rotation = def.rotation ?? 0;
        c.mirrorX = !!def.mirrorX;
        if (c instanceof Switch) {
            const explicitType = SWITCH_TYPES.includes(c.props.Type) ? c.props.Type : null;
            const switchType = explicitType
                || (SWITCH_TYPES.includes(currentSwitchType) ? currentSwitchType : DEFAULT_SWITCH_TYPE);
            c.applyType(switchType, true);
            if (!c.props.Position) c.props.Position = 'A';
        }
        created.push(c);
        if (def.id) idMap.set(def.id, c);
        indexMap.set(idx, c);
    });

    return { created, center, idMap, indexMap };
}

function mapTemplateEndpoint(endpoint, idMap, indexMap) {
    if (!endpoint) return { comp: null, pin: null };
    const idx = endpoint.index ?? endpoint.i;
    const comp = (idx != null) ? indexMap.get(idx) : idMap.get(endpoint.id);
    const pin = endpoint.pin ?? endpoint.p ?? 0;
    return { comp, pin };
}

function serializeTemplate(selection = null) {
    const selected = Array.isArray(selection) && selection.length
        ? selection.slice()
        : components.slice();
    if (!selected.length) return { components: [], wires: [] };

    const minX = Math.min(...selected.map(c => c.x || 0));
    const minY = Math.min(...selected.map(c => c.y || 0));

    const compEntries = [];
    const compIndexMap = new Map();
    selected.forEach((c) => {
        const type = getComponentTypeId(c);
        if (!type) return;
        const idx = compEntries.length;
        compEntries.push({
            type,
            x: (c.x || 0) - minX,
            y: (c.y || 0) - minY,
            rotation: c.rotation ?? 0,
            mirrorX: !!c.mirrorX,
            props: { ...c.props }
        });
        compIndexMap.set(c, idx);
    });

    const normalizeVertex = (v = {}) => snapToBoardPoint((v.x || 0) - minX, (v.y || 0) - minY);
    const serialWires = wires
        .filter(w => compIndexMap.has(w.from.c) && compIndexMap.has(w.to.c))
        .map(w => ({
            from: { index: compIndexMap.get(w.from.c), pin: w.from.p },
            to: { index: compIndexMap.get(w.to.c), pin: w.to.p },
            vertices: (w.vertices || []).map(normalizeVertex)
        }));

    return { components: compEntries, wires: serialWires };
}

function deserializeTemplate(templateObj) {
    if (!templateObj || typeof templateObj !== 'object') throw new Error('Invalid template data');
    const clone = (typeof structuredClone === 'function')
        ? structuredClone(templateObj)
        : JSON.parse(JSON.stringify(templateObj));
    queueTemplatePlacement(clone);
}

function placeTemplate(template, origin) {
    if (!canvas || !template) return [];
    const placementOrigin = origin || { x: 0, y: 0 };
    const { created, center, idMap, indexMap } = instantiateTemplateComponents(template, placementOrigin);

    created.forEach(c => components.push(c));

    (template.wires || []).forEach(wire => {
        const from = mapTemplateEndpoint(wire?.from, idMap, indexMap);
        const to = mapTemplateEndpoint(wire?.to, idMap, indexMap);
        if (!from.comp || !to.comp || typeof from.pin !== 'number' || typeof to.pin !== 'number') return;

        const mid = (wire.vertices || []).map(v => ({
            x: placementOrigin.x + ((v?.x || 0) - center.x),
            y: placementOrigin.y + ((v?.y || 0) - center.y)
        }));
        const verts = buildWireVertices({ c: from.comp, p: from.pin }, mid, { c: to.comp, p: to.pin }) || [];
        const newWire = { from: { c: from.comp, p: from.pin }, to: { c: to.comp, p: to.pin }, vertices: verts, v: 0 };
        tagWireRoutePreference(newWire);
        wires.push(newWire);
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
    const template = loadTemplate(name) || getTemplateLibrary().find(t => t.id === name);
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
        btn.onclick = () => queueTemplatePlacement(loadTemplate(t.id) || t);

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

    resetIdRegistry();
    isRestoringState = true;
    try {
        const created = [];
        (data.components || []).forEach(entry => {
            const Ctor = TOOL_COMPONENTS[entry.type];
            if (!Ctor) return;
            const c = new Ctor(entry.x ?? 0, entry.y ?? 0);
            if (entry.id) reassignComponentId(c, entry.id);
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
            const restoredWire = {
                from: { c: fromComp, p: w.from.p ?? 0 },
                to:   { c: toComp,   p: w.to.p   ?? 0 },
                vertices: Array.isArray(w.vertices)
                    ? w.vertices.map(v => snapToBoardPoint(v.x ?? 0, v.y ?? 0))
                    : [],
                v: 0
            };
            tagWireRoutePreference(restoredWire);
            restoredWires.push(restoredWire);
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
    warnedNoSources = false;
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

function fileTimestamp() {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadTemplateJSON() {
    const target = selectionGroup.length ? selectionGroup : null;
    const payload = serializeTemplate(target);
    if (!payload.components.length) {
        alert('Select at least one component or build a circuit before saving a template.');
        return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-${fileTimestamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleImportTemplate(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            deserializeTemplate(data);
        } catch (err) {
            alert('Could not import template: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function triggerImportTemplateDialog() {
    const input = document.getElementById('import-template-input');
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

function touchDistance(e) {
    if (!e?.touches || e.touches.length < 2) return 0;
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function touchMidpoint(e) {
    if (!e?.touches || e.touches.length < 2) return null;
    const [a, b] = [e.touches[0], e.touches[1]];
    return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
}

function startPinch(e) {
    if (!isMobileViewport() || !canvas || !e?.touches || e.touches.length < 2) return false;
    const dist = touchDistance(e);
    const mid = touchMidpoint(e);
    if (!dist || !mid) return false;
    const anchorWorld = screenToWorld(mid.clientX, mid.clientY);
    const rect = canvas.getBoundingClientRect();
    pinchState = {
        active: true,
        startDist: dist,
        startZoom: zoom,
        anchorWorld,
        rect
    };
    lastMouseWorld = anchorWorld;
    return true;
}

function endPinch() {
    pinchState = null;
}

function updatePinch(e) {
    if (!pinchState?.active || !canvas || !e?.touches || e.touches.length < 2) {
        endPinch();
        return;
    }
    const dist = touchDistance(e);
    const mid = touchMidpoint(e);
    if (!dist || !mid) return;
    const factor = dist / (pinchState.startDist || 1);
    const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchState.startZoom * factor));
    const rect = pinchState.rect || canvas.getBoundingClientRect();
    const scaleX = rect.width ? (canvas.width / rect.width) : 1;
    const scaleY = rect.height ? (canvas.height / rect.height) : 1;

    zoom = targetZoom;
    // Keep the anchor world point under the pinch midpoint for intuitive pan + zoom.
    viewOffsetX = ((mid.clientX - rect.left) * scaleX) / zoom - pinchState.anchorWorld.x;
    viewOffsetY = ((mid.clientY - rect.top)  * scaleY) / zoom - pinchState.anchorWorld.y;
    clampView();
    lastMouseWorld = pinchState.anchorWorld;
    markStateDirty();
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
                        const newWire = {
                            from: { c: component, p: i },
                            to:   { c: other,     p: j },
                            vertices: [],
                            v:    0
                        };
                        tagWireRoutePreference(newWire);
                        wires.push(newWire);
                        markStateDirty();
                    }
                }
            });
        });
    });
}

const wiringApi = createWiringApi({
    GRID,
    ROUTE_ORIENTATION,
    WIRE_HIT_DISTANCE,
    snapToBoardPoint,
    getPinDirection,
    getComponents: () => components,
    setComponents: (next) => { components = next; },
    getWires: () => wires,
    setWires: (next) => { wires = next; },
    Junction,
    distToSegment
});

({
    mergeCollinear,
    ensureOrthogonalPath,
    firstSegmentOrientation,
    lastSegmentOrientation,
    inferRoutePreference,
    tagWireRoutePreference,
    buildTwoPointPath,
    alignEndpoint,
    buildStableWirePath,
    routeManhattan,
    buildWireVertices,
    adjustWireAnchors,
    getWirePolyline,
    splitWireAtPoint,
    pickWireAt,
    captureWireSnapshots,
    updateWireFromSnapshot,
    normalizeWireFromSnapshot,
    rerouteWiresForComponent
} = wiringApi);

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
        if (startPinch(e)) {
            isPanning = false;
            wireDragStart = null;
            attachDragListeners();
            return;
        }
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
                    const newWire = {
                        from,
                        to,
                        vertices,
                        v: 0
                    };
                    tagWireRoutePreference(newWire);
                    wires.push(newWire);
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
        // Shift+click on a wire inserts a junction and starts a new wire from that point.
        if (!activeWire && e.shiftKey) {
            const junction = splitWireAtPoint(wireHit, m);
            activeWire = {
                fromPin: { c: junction, p: 0 },
                vertices: [],
                currentPoint: snapToBoardPoint(m.x, m.y)
            };
            selectedWire = null;
            setSelectedComponent(null);
            markStateDirty();
            cleanupJunctions();
            updateProps();
            return;
        }
        // connect active wire into this wire by creating a junction
        if (activeWire && !activeWire.toPin) {
            const junction = splitWireAtPoint(wireHit, m);
            const from = activeWire.fromPin;
            const to   = { c: junction, p: 0 };
            const vertices = buildWireVertices(from, activeWire.vertices, to);
            if (vertices.length || from.c !== to.c || from.p !== to.p) {
                const newWire = { from, to, vertices, v: 0 };
                tagWireRoutePreference(newWire);
                wires.push(newWire);
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
            verts: [],
            origVerts: (wireHit.vertices || []).map(v => ({ ...v })),
            wasSelected: (selectedWire === wireHit),
            startOrientation: firstSegmentOrientation(getWirePolyline(wireHit)),
            endOrientation: lastSegmentOrientation(getWirePolyline(wireHit)),
            movingIdx: -1,
            insertedIdx: null
        };

        // Insert or grab a bend near the click point to make body dragging predictable.
        const polyline = getWirePolyline(wireHit);
        let best = { idx: 0, dist: Infinity, proj: polyline[0] };
        for (let i = 0; i < polyline.length - 1; i++) {
            const a = polyline[i];
            const b = polyline[i + 1];
            const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
            let t = 0;
            if (l2 > 0) {
                t = ((m.x - a.x) * (b.x - a.x) + (m.y - a.y) * (b.y - a.y)) / l2;
                t = Math.max(0, Math.min(1, t));
            }
            const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
            const d = Math.hypot(m.x - proj.x, m.y - proj.y);
            if (d < best.dist) best = { idx: i, dist: d, proj };
        }
        const snap = snapToBoardPoint(best.proj.x, best.proj.y);
        const verts = draggingWire.origVerts.map(v => ({ ...v }));
        let movingIdx = verts.findIndex(v => Math.hypot(v.x - snap.x, v.y - snap.y) <= GRID * 0.25);
        if (movingIdx === -1) {
            const insertAt = Math.min(best.idx, verts.length);
            verts.splice(insertAt, 0, { ...snap, userPlaced: true });
            movingIdx = insertAt;
            draggingWire.insertedIdx = insertAt;
        }
        draggingWire.verts = verts;
        draggingWire.movingIdx = movingIdx;
        wireHit.vertices = verts;
        wireDragStart = snap;
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
            // Remember user-placed bend explicitly so later cleanup won't drop it.
            activeWire.vertices.push({ ...pt, userPlaced: true });
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
    if (pinchState?.active && (!e?.touches || e.touches.length < 2)) {
        endPinch();
        return;
    }
    if (pinchState?.active && e?.touches && e.touches.length >= 2) {
        if (e.cancelable !== false) e.preventDefault();
        updatePinch(e);
        return;
    }
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
            const movingComponents = draggingComponent.objs.map(entry => entry.obj);
            draggingComponent.wireSnapshots = captureWireSnapshots(movingComponents);
            pendingComponentDrag = null;
        }
    }

    if (draggingComponent) {
        let moved = false;
        const deltas = new Map();
        draggingComponent.objs.forEach(entry => {
            const c = entry.obj;
            const nx = m.x - entry.offsetX;
            const ny = m.y - entry.offsetY;
            const snap = snapToBoardPoint(nx, ny);
            if (c.x !== snap.x || c.y !== snap.y) {
                const prevX = c.x;
                const prevY = c.y;
                c.x = snap.x;
                c.y = snap.y;
                deltas.set(c, { dx: snap.x - prevX, dy: snap.y - prevY });
                moved = true;
            }
        });
        if (moved) {
            if (!draggingComponent.wireSnapshots) {
                const comps = draggingComponent.objs.map(entry => entry.obj);
                draggingComponent.wireSnapshots = captureWireSnapshots(comps);
            }
            draggingComponent.wireSnapshots.forEach(snap => updateWireFromSnapshot(snap, deltas));
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

        const newVerts = draggingWire.verts.map((v, idx) => {
            if (idx !== draggingWire.movingIdx) return { ...v };
            const snapped = snapToBoardPoint(v.x + dx, v.y + dy);
            return { ...snapped, userPlaced: v.userPlaced };
        });
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
    if (pinchState?.active) {
        updatePinch(e);
        return;
    }
    if (draggingComponent || draggingWire || isPanning) return;
    onMove(e);
}

function onUp(e) {
    const m = canvasPoint(e);
    let handled = false;

    if (pinchState?.active) {
        endPinch();
        isPanning = false;
        wireDragStart = null;
        detachDragListeners();
        return;
    }

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
        const movedComponents = draggingComponent.objs.map(entry => entry.obj);
        movedComponents.forEach(autoConnectPins);
        if (draggingComponent.wireSnapshots && draggingComponent.wireSnapshots.length) {
            draggingComponent.wireSnapshots.forEach(normalizeWireFromSnapshot);
        } else {
            movedComponents.forEach(rerouteWiresForComponent);
        }
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
        if (!wireDragMoved && draggingWire.insertedIdx != null) {
            draggingWire.wire.vertices = draggingWire.origVerts;
        }
        const w = draggingWire.wire;
        const start = w.from.c.getPinPos(w.from.p);
        const end = w.to.c.getPinPos(w.to.p);
        if (wireDragMoved) {
            const path = buildStableWirePath(
                start,
                w.vertices || [],
                end,
                {
                    routePref: w.routePref || inferRoutePreference(start, w.vertices || [], end),
                    startOrientation: draggingWire.startOrientation || w.routePref || null,
                    endOrientation: draggingWire.endOrientation || w.routePref || null
                }
            );
            w.vertices = path.slice(1, Math.max(1, path.length - 1));
        }
        tagWireRoutePreference(w);
        if (!wireDragMoved) {
            selectedWire = w;
            setSelectedComponent(null);
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

    if ((e.metaKey || e.ctrlKey) && !isEditable) {
        const key = e.key?.toLowerCase?.() || '';
        if (key === 'c') { e.preventDefault(); copySelection(); return; }
        if (key === 'x') { e.preventDefault(); cutSelection(); return; }
        if (key === 'v') { e.preventDefault(); pasteClipboard(); return; }
    }

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
    return SCOPE_WINDOW_MODE_ENABLED ? 'window' : 'fullscreen';
}

function updateScopeModeButton() {
    const btn  = document.getElementById('scope-mode-btn');
    if (!btn) return;
    const label = btn.querySelector('span');
    const icon  = btn.querySelector('i');
    if (!SCOPE_WINDOW_MODE_ENABLED) {
        btn.classList.add('hidden');
        btn.setAttribute('hidden', 'true');
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('tabindex', '-1');
        btn.disabled = true;
        if (label) label.innerText = 'Full Screen';
        if (icon)  icon.className = 'fas fa-expand';
        return;
    }

    btn.classList.remove('hidden');
    btn.removeAttribute('hidden');
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('tabindex');
    btn.disabled = false;
    btn.title = '';
    btn.style.opacity = '';
    btn.style.cursor = '';

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

function getScopeHorizontalDivs(drawW = null, drawH = null, { updateCache = false } = {}) {
    const canvasEl = scopeCanvas;
    const w = drawW ?? canvasEl?.clientWidth ?? canvasEl?.width ?? 0;
    const h = drawH ?? canvasEl?.clientHeight ?? canvasEl?.height ?? 0;
    if (!w || !h) return scopeHorizontalDivs || 10;
    const gridCell = (h || 1) / 10;
    const divs = Math.max(10, Math.round(w / gridCell));
    if (updateCache) scopeHorizontalDivs = divs;
    return divs;
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
    const horizDivs   = getScopeHorizontalDivs();
    const tDiv        = parseUnit(scope.props.TimeDiv || '1m');
    const totalWindow = tDiv * horizDivs;
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

function cursorIsVisible(id) {
    if (id !== 1 && id !== 2) return false;
    const state = cursorVisibility[id];
    if (typeof state === 'boolean') return state;
    if (typeof document === 'undefined') return false;
    const el = document.getElementById(`cursor-${id}`);
    return !!(el && !el.classList.contains('hidden'));
}

function setCursorVisibility(id, visible) {
    if (id !== 1 && id !== 2) return;
    cursorVisibility[id] = !!visible;
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`cursor-${id}`);
    if (el) el.classList.toggle('hidden', !visible);
}

function syncCursorVisibilityFromDom() {
    if (typeof document === 'undefined') return;
    [1, 2].forEach((id) => {
        const el = document.getElementById(`cursor-${id}`);
        const visible = !(el && el.classList.contains('hidden'));
        cursorVisibility[id] = visible;
    });
}

function computeScopeLayout(mode = scopeDisplayMode || getDefaultScopeMode(), {
    shellRect = null,
    viewport = getViewportSize(),
    headerH = 0,
    simBarH = 0,
    windowPos = scopeWindowPos,
    windowSize = scopeWindowSize
} = {}) {
    const containerW = shellRect?.width ?? Math.max(0, viewport?.width || 0);
    const containerHRaw = shellRect?.height ?? computeWorkspaceHeight({
        viewportH: viewport?.height || 0,
        headerH,
        simBarH
    });
    const maxWindowH = Math.max(0, (viewport?.height || 0) - headerH - 8);
    const containerH = Math.max(0, Math.min(containerHRaw, maxWindowH || containerHRaw));
    const hasStoredPos = Number.isFinite(windowPos?.x) && Number.isFinite(windowPos?.y);

    if (mode === 'fullscreen') {
        const fullH = shellRect?.height ?? containerHRaw;
        return {
            windowed: false,
            width: containerW,
            height: fullH || containerH,
            left: 0,
            top: 0
        };
    }

    const padding = 16;
    const minW = 320;
    const minH = 240;
    const baseW = Math.max(minW, Math.min(windowSize?.width || 560, Math.max(minW, (containerW || minW) - padding * 2)));
    const baseH = Math.max(minH, Math.min(windowSize?.height || 360, Math.max(minH, (containerH || minH) - padding * 2)));
    const safeWidth = Math.max(minW, Math.min(baseW, containerW || baseW));
    const safeHeight = Math.max(minH, Math.min(baseH, containerH || baseH));
    const maxLeft = Math.max(0, containerW - safeWidth - padding);
    const maxTop = Math.max(0, containerH - safeHeight - padding);
    let left = hasStoredPos ? windowPos.x : maxLeft;
    let top = hasStoredPos ? windowPos.y : maxTop;
    left = Math.min(Math.max(left, padding), maxLeft || padding);
    top = Math.min(Math.max(top, padding), maxTop || padding);

    return {
        windowed: true,
        width: safeWidth,
        height: safeHeight,
        left,
        top
    };
}

function setScopeOverlayLayout(mode = scopeDisplayMode || getDefaultScopeMode()) {
    const overlay = document.getElementById('scope-overlay');
    if (!overlay) return;
    const prevMode = SCOPE_WINDOW_MODE_ENABLED ? (scopeDisplayMode || getDefaultScopeMode()) : 'fullscreen';
    const targetMode = (mode === 'window') ? 'window' : 'fullscreen';
    scopeDisplayMode = SCOPE_WINDOW_MODE_ENABLED ? targetMode : 'fullscreen';

    if (scopeDisplayMode === 'fullscreen' && prevMode !== 'fullscreen') {
        scopeWindowSize = {
            width: overlay.offsetWidth || scopeWindowSize.width,
            height: overlay.offsetHeight || scopeWindowSize.height
        };
    }

    const shellRect = overlay.parentElement?.getBoundingClientRect?.() ||
        document.querySelector('.canvas-shell')?.getBoundingClientRect?.() ||
        null;
    const headerH = document.querySelector('.site-header')?.offsetHeight || 0;
    const simBarH = document.getElementById('sim-bar')?.getBoundingClientRect?.().height || 0;
    const layout = computeScopeLayout(scopeDisplayMode, {
        shellRect,
        viewport: getViewportSize(),
        headerH,
        simBarH,
        windowPos: scopeWindowPos,
        windowSize: scopeWindowSize
    });

    if (layout.windowed) {
        scopeWindowPos = { x: layout.left, y: layout.top };
        scopeWindowSize = { width: layout.width, height: layout.height };
    }

    overlay.classList.toggle('scope-window', layout.windowed);
    overlay.classList.toggle('fullscreen', !layout.windowed);
    overlay.style.overflowY = layout.windowed ? 'hidden' : 'hidden';
    overlay.style.position = 'absolute';
    if (layout.windowed) {
        overlay.style.left = `${layout.left}px`;
        overlay.style.top = `${layout.top}px`;
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.width = `${layout.width}px`;
        overlay.style.height = `${layout.height}px`;
        overlay.style.maxHeight = `${layout.height}px`;
    } else {
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.right = '0px';
        overlay.style.bottom = '0px';
        overlay.style.width = `${layout.width}px`;
        overlay.style.height = `${layout.height}px`;
        overlay.style.maxHeight = 'none';
    }
    updateScopeModeButton();
    // Ensure canvas sizes update after layout writes
    requestAnimationFrame(() => {
        if (overlay && layout.windowed) {
            const contentH = overlay.scrollHeight;
            const boundedH = Math.min(layout.height || contentH, contentH);
            overlay.style.height = `${boundedH}px`;
            scopeWindowSize = { width: layout.width, height: boundedH };
        }
        if (scopeCanvas && scopeCanvas.parentElement) {
            const dpr = window.devicePixelRatio || 1;
            const sw = scopeCanvas.parentElement.clientWidth;
            const sh = scopeCanvas.parentElement.clientHeight;
            scopeCanvas.width = Math.max(1, Math.floor(sw * dpr));
            scopeCanvas.height = Math.max(1, Math.floor(sh * dpr));
            scopeCanvas.style.width = `${sw}px`;
            scopeCanvas.style.height = `${sh}px`;
        }
        resize();
        if (scopeMode) drawScope();
    });
}

function toggleScopeDisplayMode() {
    if (!SCOPE_WINDOW_MODE_ENABLED) {
        setScopeOverlayLayout('fullscreen');
        resize();
        if (scopeMode) drawScope();
        return;
    }

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
    scopeDisplayMode = getDefaultScopeMode();
    setScopeOverlayLayout(scopeDisplayMode);
    const overlay = document.getElementById('scope-overlay');
    if (overlay) overlay.classList.remove('hidden');
    syncCursorVisibilityFromDom();
    resize();
    bindScopeDragHandle();
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
        overlay.classList.remove('fullscreen');
    }
}

function toggleCursors() {
    syncCursorVisibilityFromDom();
    const next1 = !cursorIsVisible(1);
    const next2 = !cursorIsVisible(2);
    setCursorVisibility(1, next1);
    setCursorVisibility(2, next2);
    updateCursors();
    if (scopeMode) drawScope();
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

function bindScopeDragHandle() {
    const bar = document.querySelector('.scope-topbar');
    if (!bar || bar._dragHooked) return;
    const startDrag = (e) => startScopeWindowDrag(e);
    bar.addEventListener('mousedown', startDrag);
    bar.addEventListener('touchstart', startDrag, { passive: false });
    bar._dragHooked = true;
    bar.style.cursor = 'grab';
}


function startScopeWindowDrag(e) {
    if (scopeDisplayMode !== 'window') return;
    if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
    const overlay = document.getElementById('scope-overlay');
    const shell = overlay?.parentElement;
    const shellRect = shell?.getBoundingClientRect?.();
    if (!overlay || !shell || !shellRect) return;
    const rect = overlay.getBoundingClientRect();
    const { clientX, clientY } = getPointerXY(e);
    const parsedLeft = parseFloat(overlay.style.left);
    const parsedTop = parseFloat(overlay.style.top);
    const left = Number.isFinite(parsedLeft) ? parsedLeft : (rect.left - shellRect.left);
    const top = Number.isFinite(parsedTop) ? parsedTop : (rect.top - shellRect.top);
    scopeDragStart = {
        pointer: { x: clientX, y: clientY },
        pos: { left, top },
        size: { w: rect.width, h: rect.height },
        bounds: { w: shellRect.width, h: shellRect.height }
    };
    scopeDragBounds = { w: shellRect.width, h: shellRect.height };
    isDraggingScope = true;
    window.addEventListener('mousemove', dragScopeWindow);
    window.addEventListener('mouseup', stopScopeWindowDrag);
    window.addEventListener('touchmove', dragScopeWindow, { passive: false });
    window.addEventListener('touchend', stopScopeWindowDrag);
    if (e && e.cancelable !== false) e.preventDefault();
}

function dragScopeWindow(e) {
    if (!isDraggingScope || !scopeDragStart) return;
    if (e && e.touches && e.cancelable !== false) e.preventDefault();
    const overlay = document.getElementById('scope-overlay');
    const shell = overlay?.parentElement;
    if (!overlay || !shell || !scopeDragStart.bounds) return;

    const w = scopeDragStart.size?.w || overlay.offsetWidth || 0;
    const h = scopeDragStart.size?.h || overlay.offsetHeight || 0;
    const { clientX, clientY } = getPointerXY(e);
    const dx = clientX - scopeDragStart.pointer.x;
    const dy = clientY - scopeDragStart.pointer.y;
    let x = scopeDragStart.pos.left + dx;
    let y = scopeDragStart.pos.top + dy;
    const maxX = Math.max(0, (scopeDragBounds?.w || shell.clientWidth || 0) - w);
    const maxY = Math.max(0, (scopeDragBounds?.h || shell.clientHeight || 0) - h);
    x = Math.min(Math.max(x, 0), maxX);
    y = Math.min(Math.max(y, 0), maxY);

    scopeWindowPos = { x, y };
    overlay.style.left   = `${x}px`;
    overlay.style.top    = `${y}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
}

function stopScopeWindowDrag() {
    isDraggingScope = false;
    scopeDragStart = null;
    scopeDragBounds = null;
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
    const icon = isPaused ? 'fa-play' : 'fa-pause';
    const label = isPaused ? 'Play' : 'Pause';

    const applyState = (btn, { text = label, includeSr = false, iconExtra = '' } = {}) => {
        if (!btn) return;
        const sr = includeSr ? `<span class="sr-only">${label}</span>` : '';
        const iconClass = iconExtra ? `${icon} ${iconExtra}` : icon;
        btn.innerHTML = `<i class="fas ${iconClass}"></i><span class="btn-text">${text}</span>${sr}`;
        btn.setAttribute('aria-pressed', (!isPaused).toString());
        btn.setAttribute('aria-label', label);
        btn.title = label;
    };

    applyState(document.getElementById('play-pause-btn'), { text: label, includeSr: true });
    applyState(document.getElementById('play-pause-btn-hero'), { text: `${label} Sim`, iconExtra: 'mr-2' });
}

function updateViewLabel() {
    const label = document.getElementById('view-label');
    if (!label) return;
    label.innerText = (viewMode === 'physical') ? 'Breadboard View' : 'Schematic View';
}

function updateToolsToggleLabel(forceState = null) {
    const btn = document.getElementById('mobile-tools-toggle');
    const root = document.getElementById('circuit-lab-root');
    const sidebar = document.getElementById('sidebar');
    if (!btn || !root) return;
    const computedOpen = isMobileViewport()
        ? root.classList.contains('sidebar-open')
        : !(sidebar && sidebar.classList.contains('collapsed'));
    const isOpen = (forceState != null) ? forceState : computedOpen;
    const textSpan = btn.querySelector('.btn-text');
    const labelText = isOpen ? 'Hide Menu' : 'Show Menu';
    if (textSpan) textSpan.textContent = labelText;
    else btn.textContent = labelText;
    btn.setAttribute('aria-label', labelText);
    btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
}

function setSimStatusDisplay(state, errorMessage = '') {
    const statusEl = document.getElementById('sim-status');
    if (!statusEl) return;
    const classes = ['sim-status--run', 'sim-status--paused', 'sim-status--error', 'sim-status--clickable'];
    classes.forEach(cls => statusEl.classList.remove(cls));

    let label = 'PAUSED';
    if (state === 'run') label = 'RUN';
    else if (state === 'error') label = 'ERROR';

    statusEl.textContent = label;
    statusEl.dataset.state = state;
    statusEl.classList.add(`sim-status--${state}`);
    const ariaLabel = (state === 'error')
        ? (errorMessage ? `Simulation error: ${errorMessage}` : 'Simulation error')
        : `Simulation ${label.toLowerCase()}`;
    statusEl.setAttribute('aria-label', ariaLabel);
    const clickable = state === 'error' && !!errorMessage;
    statusEl.setAttribute('aria-disabled', clickable ? 'false' : 'true');
    statusEl.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    statusEl.classList.toggle('sim-status--clickable', clickable);
    statusEl.title = clickable ? 'View error details' : '';
}

function openSimErrorDialog() {
    if (!simErrorMessage) return;
    const dialog = document.getElementById('sim-error-dialog');
    if (!dialog) return;
    const detail = document.getElementById('sim-error-details');
    if (detail) detail.textContent = simErrorMessage;

    if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
    } else {
        dialog.setAttribute('open', 'true');
        dialog.setAttribute('data-open', 'true');
        dialog.style.display = 'block';
        dialog.removeAttribute('hidden');
    }
}

function closeSimErrorDialog(silent = false) {
    const dialog = document.getElementById('sim-error-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
        if (dialog.open) dialog.close();
    } else {
        dialog.removeAttribute('data-open');
        dialog.removeAttribute('open');
        dialog.style.display = 'none';
        dialog.setAttribute('hidden', 'true');
    }
    if (!silent) {
        const statusEl = document.getElementById('sim-status');
        statusEl?.focus?.();
    }
}

function refreshSimIndicators() {
    const simTimeEl = document.getElementById('sim-time');
    if (simTimeEl) simTimeEl.innerText = formatUnit(time, 's');
    simErrorMessage = simError ? String(simError) : '';
    const nextState = simError ? 'error' : (isPaused ? 'paused' : 'run');
    setSimStatusDisplay(nextState, simErrorMessage);
    if (!simError) closeSimErrorDialog(true);
}

function attachStatusHandlers() {
    const statusEl = document.getElementById('sim-status');
    if (statusEl && !statusEl._simStatusHooked) {
        statusEl.addEventListener('click', () => {
            if (statusEl.dataset.state === 'error') openSimErrorDialog();
        });
        statusEl.addEventListener('keydown', (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && statusEl.dataset.state === 'error') {
                event.preventDefault();
                openSimErrorDialog();
            }
        });
        statusEl._simStatusHooked = true;
    }

    const dialog = document.getElementById('sim-error-dialog');
    if (dialog && !dialog._simDialogHooked) {
        dialog.addEventListener('click', (event) => {
            const target = event.target;
            if (target === dialog || target?.closest?.('[data-close-error]')) {
                closeSimErrorDialog();
            }
        });
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            closeSimErrorDialog();
        });
        dialog._simDialogHooked = true;
    }
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
    const root = document.getElementById('circuit-lab-root');
    if (!sidebar) return;

    const mobileView = isMobileViewport();

    if (mobileView && root) {
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
            const icon = document.getElementById('sidebar-toggle-icon');
            if (icon) icon.className = 'fas fa-chevron-left';
        }
        const open = root.classList.toggle('sidebar-open');
        sidebar.setAttribute('aria-expanded', open ? 'true' : 'false');
        updateToolsToggleLabel(open);
        syncSidebarOverlayState(false);
        return;
    }

    const collapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const icon = document.getElementById('sidebar-toggle-icon');
    if (icon) icon.className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    if (sidebar) sidebar.setAttribute('aria-expanded', (!collapsed).toString());
    updateToolsToggleLabel(!collapsed);
    syncSidebarOverlayState(collapsed);
    resize();
    requestAnimationFrame(resize);
}

function zoomInButton() { applyZoom(ZOOM_IN_STEP); }
function zoomOutButton() { applyZoom(ZOOM_OUT_STEP); }

function toggleSim() {
    isPaused = !isPaused;
    updatePlayPauseButton();
    refreshSimIndicators();
}

function clearCanvas() {
    resetIdRegistry();
    components = [];
    wires      = [];
    simError   = null;
    warnedNoSources = false;
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
    refreshSimIndicators();
}

/* ---------- MAIN LOOP & INIT ---------- */

function reportInitError(message) {
    console.error(message);
    let banner = document.getElementById('circuit-lab-init-error');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'circuit-lab-init-error';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.zIndex = '1400';
        banner.style.padding = '12px 16px';
        banner.style.background = 'rgba(185, 28, 28, 0.92)';
        banner.style.color = '#fff';
        banner.style.fontWeight = '600';
        banner.style.textAlign = 'center';
        banner.style.fontFamily = 'Inter, system-ui, sans-serif';
        banner.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
        document.body.appendChild(banner);
    }
    banner.textContent = message;
}
  
  function loop() {
      if (!isPaused) {
          const readiness = checkSimReadiness();
          if (!readiness.ok) {
              simError = readiness.message;
              isPaused = true;
              updatePlayPauseButton();
          } else {
              simError = null;
              for (let s = 0; s < SUB_STEPS; s++) {
                  time += DT;
                  simulate(time);
                  if (simError) break;
              }
          }
      }
      draw();
      if (scopeMode) drawScope();

    refreshSimIndicators();
    requestAnimationFrame(loop);
  }
  
  function init() {
      if (initRan) return;
  
      canvas = document.getElementById('circuitCanvas');
      if (!canvas) {
          reportInitError('Circuit canvas (#circuitCanvas) not found; Circuit Forge cannot start.');
          return;
      }
      ctx = canvas.getContext('2d');
      if (!ctx) {
          reportInitError('2D context unavailable for #circuitCanvas; is the browser canvas API disabled?');
          return;
      }
      scopeCanvas = document.getElementById('scopeCanvas');
      scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;
      if (!scopeCanvas) {
          console.warn('Scope canvas not found; oscilloscope overlay disabled.');
      } else if (!scopeCtx) {
          console.warn('Scope canvas context unavailable; oscilloscope overlay disabled.');
      }

      initRan = true;

      const sidebar = document.getElementById('sidebar');
      if (!sidebar) {
          console.warn('Sidebar container (#sidebar) not found; component palette will not render.');
      }
      const simBar = document.getElementById('sim-bar');
      if (!simBar) {
          console.warn('Simulation bar (#sim-bar) not found; transport controls may be missing.');
      }
  
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
    updateToolsToggleLabel();
    attachStatusHandlers();
    syncSidebarOverlayState();
    refreshSimIndicators();
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

const circuitForgeApi = {
    selectTool,
    rotateSelected,
    mirrorSelected,
    deleteSelected,
    copySelection,
    cutSelection,
    pasteClipboard,
    toggleSim,
    downloadCircuitJSON,
    downloadTemplateJSON,
    triggerImportDialog,
    triggerImportTemplateDialog,
    handleImportJSON,
    handleImportTemplate,
    serializeTemplate,
    deserializeTemplate,
    clearCanvas,
    toggleSidebar,
    zoomOutButton,
    zoomInButton,
    toggleView,
    toggleScopeDisplayMode,
    closeScope,
    toggleCursors,
    startScopeWindowDrag,
    startDragCursor,
    renderToolIcons,
    updateBoardThemeColors,
    draw
};

if (typeof window !== 'undefined') {
    Object.assign(window, circuitForgeApi, {
        Component,
        Resistor,
        Potentiometer,
        Capacitor,
        LED,
        Switch,
        Junction,
        MOSFET,
        LF412,
        VoltageSource,
        FunctionGenerator,
        Ground,
        Oscilloscope
    });
}

// Expose a few helpers for tests and tooling without altering runtime behaviour.
export {
    adjustWireAnchors,
    ensureOrthogonalPath,
    mergeCollinear,
    routeManhattan,
    computeWorkspaceHeight,
    validateLayoutHeights,
    computeScopeLayout,
    snapToBoardPoint,
    getPinDirection,
    cursorIsVisible,
    setCursorVisibility
};

function startCircuitForge() {
    try {
        init();
    } catch (err) {
        reportInitError(`Circuit Forge failed to start: ${err?.message || err}`);
        console.error(err);
    }
}

// Start it
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startCircuitForge);
    } else {
        startCircuitForge();
    }
}
