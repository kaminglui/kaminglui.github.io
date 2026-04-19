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
import {
    fileTimestamp,
    validateSaveData,
    serializeCircuitPayload,
    downloadJSON,
    readJSONFile,
    triggerFileInput
} from './circuit-lab/persistence.js';
import {
    computeWorkspaceHeight,
    sampleChannelAt,
    computeScopeChannelStats,
    computeScopeLayout
} from './circuit-lab/scopeLayout.js';
import {
    ROUTE_ORIENTATION,
    snapToGrid,
    snapToBoardPoint,
    directionToOrientation,
    distToSegment,
    dropCollinearVerts,
    routeAStar,
    countPathCrossings
} from './circuit-lab/geometry.js';
import {
    parseUnit,
    formatUnit,
    formatSignedUnit,
    getResColor
} from './circuit-lab/units.js';
import {
    GRID,
    DT,
    SUB_STEPS,
    HISTORY_SIZE,
    PIN_HIT_RADIUS,
    PIN_LEG_LENGTH,
    PIN_HEAD_RADIUS,
    GRID_HOLE_RADIUS,
    WIRE_HIT_DISTANCE,
    WIRE_WIDTH_SELECTED,
    WIRE_WIDTH_HOVER,
    WIRE_WIDTH_DEFAULT,
    WIRE_OUTLINE_PADDING,
    WIRE_CORNER_RADIUS,
    WIRE_DASH_PATTERN,
    ACTIVE_WIRE_WIDTH,
    MARQUEE_DASH_PATTERN,
    SELECTION_DASH_PATTERN,
    SELECTION_PADDING,
    SAVE_SCHEMA_ID,
    SAVE_SCHEMA_VERSION,
    LOCAL_STORAGE_KEY,
    AUTOSAVE_DELAY_MS,
    ZOOM_IN_STEP,
    ZOOM_OUT_STEP,
    DEFAULT_SCOPE_WINDOW_POS,
    SCOPE_WINDOW_MODE_ENABLED,
    EDITABLE_TAGS,
    LABEL_FONT_SMALL,
    LABEL_FONT_MEDIUM,
    LABEL_FONT_BOLD,
    LABEL_FONT_MOSFET_TYPE,
    LABEL_FONT_LARGE,
    LABEL_GAP_SMALL,
    LABEL_GAP_MEDIUM,
    LABEL_OUTSIDE_OFFSET,
    PIN_LABEL_OFFSET,
    PIN_LABEL_DISTANCE,
    CENTER_LABEL_DISTANCE,
    DRAG_DEADZONE,
    TOUCH_SELECTION_HOLD_MS,
    COMPONENT_DELETE_HOLD_MS,
    SWITCH_TYPES,
    DEFAULT_SWITCH_TYPE,
    SCOPE_VDIV_OPTIONS,
    MOBILE_BREAKPOINT,
    BASELINE_NODE_LEAK,
    OPAMP_GAIN,
    OPAMP_INPUT_LEAK,
    OPAMP_OUTPUT_LEAK,
    OPAMP_RAIL_HEADROOM,
    FUNCGEN_REF_RES,
    FUNCGEN_SERIES_RES,
    PROP_UNITS
} from './circuit-lab/config.js';

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
let wireOutlineColor = '#1f2937';
let wireActiveColor = '#ffffff';
let pinHeadColor = '#e5e7eb';

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
let hoveredPin = null;   // { c, p } — pin directly under the cursor (for affordance + "click to connect")
let hoveredComponent = null; // component under the cursor (body, not pin) — drives the value tooltip
// While drawing a wire, what the cursor is currently aimed at. Drives preview color + snap-to-target.
// Shape: { kind: 'pin' | 'wire' | 'component', target, point: {x,y} } or null.
let activeWireHover = null;
let shiftHeldForWire = false;  // when true, invert the preview's auto elbow orientation
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
let quickSelectionIndex = -1;
let quickBarVisible = null;

function safeCall(fn) {
    try {
        if (typeof fn === 'function') fn();
    } catch (_) {
        // Swallow errors in test environments lacking DOM hooks.
    }
}

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
            ctx.fillStyle = pinHeadColor;
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
    const wireOutline = style.getPropertyValue('--wire-outline').trim();
    const wireActive = style.getPropertyValue('--wire-active').trim();
    const pinHead = style.getPropertyValue('--pin-head').trim();

    if (boardBg) boardBgColor = boardBg;
    if (boardHole) gridHoleColor = boardHole;
    if (wireOutline) wireOutlineColor = wireOutline;
    if (wireActive) wireActiveColor = wireActive;
    if (pinHead) pinHeadColor = pinHead;
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
        drawWirePolyline(pts, wireOutlineColor, width + WIRE_OUTLINE_PADDING, false);

        let color = '#3aa86b';
        if (v > 0.01) color = '#34d399';
        else if (v < -0.01) color = '#f87171';
        color = isSelected ? '#facc15' : color;

        drawWirePolyline(pts, color, width, false);
    });
}

// Draw the in-progress wire preview on top of components so it's never buried.
function drawActiveWirePreview() {
    if (!activeWire || activeWire.toPin) return;

    const fromPos = activeWire.fromPin.c.getPinPos(activeWire.fromPin.p);
    const mousePt = activeWire.currentPoint || fromPos;
    const dir = getPinDirection(activeWire.fromPin.c, activeWire.fromPin.p);

    // Shift: invert the auto elbow for this preview so the user can force the other path.
    let preferredOrientation = activeWire.routePref || null;
    if (shiftHeldForWire) {
        const inferred = preferredOrientation
            || inferRoutePreference(fromPos, activeWire.vertices || [], mousePt);
        preferredOrientation = inferred === ROUTE_ORIENTATION.H_FIRST
            ? ROUTE_ORIENTATION.V_FIRST
            : ROUTE_ORIENTATION.H_FIRST;
    }

    const pts = routeManhattan(
        fromPos,
        activeWire.vertices || [],
        mousePt,
        dir,
        null,
        { preferredOrientation }
    );
    const previewOrientation = firstSegmentOrientation(pts);
    if (!activeWire.routePref && !shiftHeldForWire && previewOrientation) {
        activeWire.routePref = previewOrientation;
    }

    // Context-colored preview: green = valid pin target, blue = will auto-junction a wire,
    // red = over a component body (invalid), default ink otherwise.
    let previewColor = wireActiveColor;
    if (activeWireHover?.kind === 'pin') previewColor = '#22c55e';
    else if (activeWireHover?.kind === 'wire') previewColor = '#3b82f6';
    else if (activeWireHover?.kind === 'component') previewColor = '#ef4444';

    drawWirePolyline(pts, previewColor, ACTIVE_WIRE_WIDTH, true);
}

// Draw a hover ring on any pin the cursor is near. Larger + green when a wire is being drawn
// and the pin is a valid target, so "click to connect" is visually obvious.
function drawPinAffordance() {
    const activeTarget = activeWire && activeWireHover?.kind === 'pin' ? activeWireHover.target : null;
    const pinToHighlight = activeTarget || hoveredPin;
    if (!pinToHighlight) return;

    const comp = pinToHighlight.c;
    const pinIdx = pinToHighlight.p;
    const pos = comp.getPinPos(pinIdx);
    const isValidWireTarget = !!activeTarget;
    const ringColor = isValidWireTarget ? '#22c55e' : '#60a5fa';

    ctx.save();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = isValidWireTarget ? 2 : 1.4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, PIN_HIT_RADIUS * (isValidWireTarget ? 1.35 : 1.15), 0, Math.PI * 2);
    ctx.stroke();

    // Pin role label (e.g. "G", "Out", "CH1"). Only shown when the component declares
    // meaningful pin names; otherwise the plain hover ring already tells you it's a pin.
    const label = Array.isArray(comp.pinNames) ? comp.pinNames[pinIdx] : null;
    if (label) {
        const dir = getPinDirection(comp, pinIdx) || { x: 0, y: 1 };
        const offset = PIN_LABEL_OFFSET;
        const tx = pos.x + dir.x * offset;
        const ty = pos.y + dir.y * offset;
        ctx.font = LABEL_FONT_BOLD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(label);
        const padX = 5;
        const padY = 3;
        const w = metrics.width + padX * 2;
        const h = 14 + padY * 2 - 6;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)'; // slate-900, nearly opaque
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const r = 3;
        const x0 = tx - w / 2;
        const y0 = ty - h / 2;
        ctx.moveTo(x0 + r, y0);
        ctx.lineTo(x0 + w - r, y0);
        ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
        ctx.lineTo(x0 + w, y0 + h - r);
        ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
        ctx.lineTo(x0 + r, y0 + h);
        ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
        ctx.lineTo(x0, y0 + r);
        ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText(label, tx, ty);
    }
    ctx.restore();
}

// Short "value" string shown in the hover tooltip. Uses whichever props make
// the component identifiable at a glance: R/C/V/If/frequency/etc.
function summarizeComponent(comp) {
    if (!comp) return null;
    const kind = (comp.kind || comp.constructor?.name || '').toLowerCase();
    const p = comp.props || {};
    if (kind.includes('resistor') || comp instanceof Resistor) return `R = ${p.R || '?'}Ω`;
    if (kind.includes('potentiometer') || comp instanceof Potentiometer) return `${p.R || '?'}Ω · ${p.Turn || 50}%`;
    if (kind.includes('capacitor') || comp instanceof Capacitor) return `C = ${p.C || '?'}F`;
    if (comp instanceof VoltageSource) return `${p.Vdc || '?'} V DC`;
    if (comp instanceof FunctionGenerator) {
        const wave = (p.Wave || 'sine').toLowerCase();
        return `${wave} · ${p.Vpp || '?'}Vpp · ${p.Freq || '?'}Hz`;
    }
    if (comp instanceof LED) return `LED · ${p.Color || 'red'} · Vf=${p.Vf || '?'}V`;
    if (comp instanceof MOSFET) {
        const t = (p.Type || 'NMOS').toUpperCase();
        return `${t} · Vth=${p.Vth || '0.7'}V`;
    }
    if (comp instanceof Switch) return `${p.Type || 'SPST'} · pos ${p.Position || 'A'}`;
    if (comp instanceof Oscilloscope) return 'Oscilloscope';
    if (comp instanceof Ground) return 'Ground';
    if (comp instanceof LF412) return 'LF412 · dual op-amp';
    return null;
}

function drawComponentTooltip() {
    if (!hoveredComponent) return;
    const label = summarizeComponent(hoveredComponent);
    if (!label) return;

    const bb = typeof hoveredComponent.getBoundingBox === 'function'
        ? hoveredComponent.getBoundingBox()
        : null;
    // Anchor the tooltip just above the component's top edge.
    const anchorX = bb ? (bb.x1 + bb.x2) / 2 : hoveredComponent.x;
    const anchorY = bb ? bb.y1 - 8 : (hoveredComponent.y - 24);

    ctx.save();
    ctx.font = LABEL_FONT_BOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const metrics = ctx.measureText(label);
    const padX = 6;
    const padY = 3;
    const w = metrics.width + padX * 2;
    const h = 16;
    const x0 = anchorX - w / 2;
    const y0 = anchorY - h;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    const r = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x0 + w - r, y0);
    ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    ctx.lineTo(x0 + w, y0 + h - r);
    ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    ctx.lineTo(x0 + r, y0 + h);
    ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    ctx.lineTo(x0, y0 + r);
    ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(label, anchorX, anchorY - padY);
    ctx.restore();
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
    drawPinAffordance();
    drawComponentTooltip();
    drawActiveWirePreview();

    syncQuickBarVisibility();

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
    syncQuickSelectionIndex(c);
    syncQuickBarVisibility();
    updateQuickControlsVisibility();
    syncQuickPotSlider(c);
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

    updateQuickControlsVisibility();
    syncQuickPotSlider(selectedComponent);
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

function serializeTemplateLibrary(selection = null) {
    const selected = Array.isArray(selection) && selection.length
        ? selection.slice()
        : components.slice();
    if (!selected.length) return { components: [], wires: [] };

    const compEntries = [];
    const compIndexMap = new Map();
    selected.forEach((c) => {
        const type = getComponentTypeId(c);
        if (!type) return;
        const idx = compEntries.length;
        compEntries.push({
            id: c.id,
            type,
            x: c.x || 0,
            y: c.y || 0,
            rotation: c.rotation ?? 0,
            mirrorX: !!c.mirrorX,
            props: { ...c.props }
        });
        compIndexMap.set(c, idx);
    });

    const serialWires = wires
        .filter(w => compIndexMap.has(w.from.c) && compIndexMap.has(w.to.c))
        .map(w => ({
            from: { id: w.from.c?.id, pin: w.from.p, index: compIndexMap.get(w.from.c) },
            to: { id: w.to.c?.id, pin: w.to.p, index: compIndexMap.get(w.to.c) },
            vertices: (w.vertices || []).map(v => ({ x: v.x || 0, y: v.y || 0 }))
        }));

    return { components: compEntries, wires: serialWires };
}

const QUICK_CONTROL_GROUPS = [
    { key: 'switch', aliases: ['switch'] },
    { key: 'potentiometer', aliases: ['potentiometer'] },
    { key: 'resistor', aliases: ['resistor'] },
    { key: 'capacitor', aliases: ['capacitor'] },
    { key: 'oscilloscope', aliases: ['oscilloscope'] },
    { key: 'funcgen', aliases: ['funcgen', 'functiongenerator'] }
];
const QUICK_CONTROL_ALIAS_SET = new Set(
    QUICK_CONTROL_GROUPS.flatMap(group => group.aliases)
);
const RESISTOR_SUFFIXES = ['', 'm', 'k', 'M', 'G', 'u', 'n', 'p'];
const CAPACITOR_SUFFIXES = ['p', 'n', 'u', 'm'];
const FUNCGEN_FREQ_SUFFIXES = ['', 'k', 'M'];
const FUNCGEN_VPP_SUFFIXES = ['', 'm', 'u'];

function compKind(c) {
    return (c?.kind || '').toLowerCase();
}

function matchesKind(c, group) {
    const k = compKind(c);
    return group.aliases.includes(k);
}

function isQuickControllable(comp) {
    return QUICK_CONTROL_ALIAS_SET.has(compKind(comp));
}

function buildQuickList() {
    const list = [];
    QUICK_CONTROL_GROUPS.forEach((group) => {
        const bucket = components
            .filter(c => matchesKind(c, group))
            .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        bucket.forEach(c => list.push(c));
    });
    return list;
}

function buildSelectableQuickList() {
    return buildQuickList().filter(c => compKind(c) !== 'oscilloscope');
}

function syncQuickSelectionIndex(target) {
    const list = buildSelectableQuickList();
    quickSelectionIndex = (target && isQuickControllable(target) && compKind(target) !== 'oscilloscope')
        ? list.indexOf(target)
        : -1;
}

function clampPercent(val) {
    return Math.min(100, Math.max(0, val));
}

function getQuickPotSlider() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('quick-pot-slider');
}

function getQuickPotValueLabel() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('quick-pot-value');
}

function splitValueSuffix(rawValue, rawSuffix, allowed = ['']) {
    const m = String(rawValue ?? '').trim().match(/^(-?[\d.]+)\s*([a-zA-Zµμ]*)$/);
    let value = String(rawValue ?? '0').trim() || '0';
    let suffix = String(rawSuffix ?? '').trim();
    if (m) {
        value = m[1] || '0';
        suffix = m[2] || suffix;
    }
    if (!allowed.includes(suffix)) {
        suffix = allowed.includes('') ? '' : allowed[0];
    }
    return { value, suffix };
}

function getQuickValueElements(kind) {
    if (typeof document === 'undefined') return { input: null, suffix: null };
    return {
        input: document.getElementById(`quick-${kind}-value`),
        suffix: document.getElementById(`quick-${kind}-suffix`)
    };
}

function syncQuickValueFields(kind, propKey, allowed) {
    const { input, suffix } = getQuickValueElements(kind);
    if (!input || !suffix) return;
    const comp = selectedComponent && compKind(selectedComponent) === kind
        ? selectedComponent
        : findComponentByKind(kind);
    if (!comp) return;
    const { value, suffix: suf } = splitValueSuffix(comp.props?.[propKey] || '', suffix.value, allowed);
    input.value = value;
    suffix.value = suf;
}

function getQuickFuncGenElements() {
    if (typeof document === 'undefined') return {};
    return {
        freqInput: document.getElementById('quick-fg-freq-value'),
        freqSuffix: document.getElementById('quick-fg-freq-suffix'),
        vppInput: document.getElementById('quick-fg-vpp-value'),
        vppSuffix: document.getElementById('quick-fg-vpp-suffix')
    };
}

function listScopes() {
    return components.filter(c => compKind(c) === 'oscilloscope');
}

function getScopeCenter(scope) {
    if (!scope) return { x: 0, y: 0 };
    if (typeof scope.getBoundingBox === 'function') {
        const b = scope.getBoundingBox();
        return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
    }
    return { x: scope.x || 0, y: scope.y || 0 };
}

function describeScopePosition(scopes) {
    const centers = scopes.map(getScopeCenter);
    if (!centers.length) return [];
    const xs = centers.map(c => c.x);
    const ys = centers.map(c => c.y);
    const xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const counts = new Map();

    return scopes.map((s, idx) => {
        const c = centers[idx];
        const horiz = c.x < xMid - 10 ? 'left' : (c.x > xMid + 10 ? 'right' : 'middle');
        const vert = c.y < yMid - 10 ? 'top' : (c.y > yMid + 10 ? 'bottom' : 'middle');
        const key = `${horiz}-${vert}`;
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);
        const hv = (horiz === 'middle' && vert === 'middle')
            ? 'middle'
            : [horiz, vert].filter(v => v !== 'middle').join('/');
        const suffix = n > 1 ? ` ${n}` : '';
        const label = `${s.id || `Scope ${idx + 1}`} (${hv}${suffix})`;
        return { scope: s, label, center: c, hv, order: n };
    });
}

function syncQuickScopeSelect() {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('quick-scope-select');
    if (!select || typeof document.createElement !== 'function') return;
    const wasOpen = select.dataset?.open === 'true';
    const scopes = listScopes();
    const descriptors = describeScopePosition(scopes);
    select.innerHTML = '';
    descriptors.forEach(({ scope: s, label }, idx) => {
        const opt = document.createElement('option');
        opt.value = s.id || `scope-${idx}`;
        opt.textContent = label;
        select.appendChild(opt);
    });
    const nextSize = Math.min(Math.max(descriptors.length, 1), 6);
    select.size = nextSize;
    if (!descriptors.length) {
        select.dataset = select.dataset || {};
        select.dataset.open = 'false';
        select.classList?.add?.('hidden');
        select.hidden = true;
        if (select.style) select.style.display = 'none';
        return;
    }
    if (wasOpen) {
        select.dataset = select.dataset || {};
        select.dataset.open = 'true';
        select.classList?.remove?.('hidden');
        select.hidden = false;
        if (select.style) select.style.display = 'block';
    } else {
        select.classList?.add?.('hidden');
        select.hidden = true;
        if (select.style) select.style.display = 'none';
        if (select.dataset) select.dataset.open = 'false';
    }
    const active = activeScopeComponent && scopes.includes(activeScopeComponent)
        ? activeScopeComponent
        : scopes[0];
    if (active) {
        activeScopeComponent = active;
        select.value = active.id;
    }
}

function getActiveQuickKind() {
    const selectedKind = compKind(selectedComponent);
    if (selectedComponent && isQuickControllable(selectedComponent) && compKind(selectedComponent) !== 'oscilloscope') {
        return selectedKind;
    }
    const list = buildSelectableQuickList();
    const target = list[(quickSelectionIndex >= 0 && quickSelectionIndex < list.length) ? quickSelectionIndex : 0];
    return compKind(target) || null;
}

function syncQuickPotSlider(target = selectedComponent) {
    const slider = getQuickPotSlider();
    const label = getQuickPotValueLabel();
    if (!slider) return;
    const pot = (compKind(target) === 'potentiometer')
        ? target
        : buildQuickList().find(c => compKind(c) === 'potentiometer');
    if (!pot) {
        slider.value = '0';
        if (label) label.innerText = '0%';
        return;
    }
    const next = clampPercent(parseFloat(pot.props?.Turn ?? '0') || 0);
    slider.value = String(next);
    if (label) label.innerText = `${Math.round(next)}%`;
}

function updateQuickControlsVisibility() {
    const groups = (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function')
        ? Array.from(document.querySelectorAll('.quick-group'))
        : [];
    if (!groups.length) return;
    const availableKinds = new Set(buildQuickList().map(compKind));
    if (!availableKinds.size) {
        groups.forEach(el => el.classList.add('hidden'));
        return;
    }
    const active = getActiveQuickKind();
    groups.forEach((el) => {
        const kind = (el.dataset?.kind || '').toLowerCase();
        const forceShow = kind === 'oscilloscope';
        const show = availableKinds.has(kind) && (kind === active || forceShow);
        el.classList.toggle('hidden', !show);
    });
    if (active === 'potentiometer') syncQuickPotSlider();
    if (active === 'resistor') syncQuickValueFields('resistor', 'R', RESISTOR_SUFFIXES);
    if (active === 'capacitor') syncQuickValueFields('capacitor', 'C', CAPACITOR_SUFFIXES);
    if (active === 'funcgen') syncQuickFuncGenFields();
    syncQuickScopeSelect();
}

function quickSelect(delta) {
    const list = buildSelectableQuickList();
    if (!list.length) return;
    quickSelectionIndex = (quickSelectionIndex + delta + list.length) % list.length;
    const target = list[quickSelectionIndex];
    setSelectedComponent(target);
    // setSelectedComponent resets the index; restore it for cycling
    quickSelectionIndex = list.indexOf(target);
    selectionGroup = target ? [target] : [];
    safeCall(updateProps);
    safeCall(draw);
    updateQuickControlsVisibility();
}

function quickSelectPrev() { quickSelectionIndex = quickSelectionIndex < 0 ? 0 : quickSelectionIndex; quickSelect(-1); }
function quickSelectNext() { quickSelectionIndex = quickSelectionIndex < 0 ? -1 : quickSelectionIndex; quickSelect(1); }

function findComponentByKind(kindAlias) {
    const aliases = Array.isArray(kindAlias) ? kindAlias : [kindAlias];
    return components.find(c => aliases.includes(compKind(c)));
}

function quickToggleSwitchPosition() {
    const sw = selectedComponent && compKind(selectedComponent) === 'switch'
        ? selectedComponent
        : findComponentByKind('switch');
    if (!sw) return;
    sw.props = sw.props || {};
    sw.props.Position = sw.props.Position === 'B' ? 'A' : 'B';
    setSelectedComponent(sw);
    selectionGroup = [sw];
    safeCall(markStateDirty);
    safeCall(updateProps);
    updateQuickControlsVisibility();
}

function quickAdjustPot(delta) {
    const pot = selectedComponent && compKind(selectedComponent) === 'potentiometer'
        ? selectedComponent
        : findComponentByKind('potentiometer');
    if (!pot) return;
    const current = parseFloat(pot.props?.Turn ?? '0') || 0;
    const next = clampPercent(current + delta);
    pot.props = pot.props || {};
    pot.props.Turn = String(next);
    setSelectedComponent(pot);
    selectionGroup = [pot];
    safeCall(markStateDirty);
    safeCall(updateProps);
    syncQuickPotSlider(pot);
    updateQuickControlsVisibility();
}

function quickSetPotTurn(val) {
    const pot = selectedComponent && compKind(selectedComponent) === 'potentiometer'
        ? selectedComponent
        : findComponentByKind('potentiometer');
    if (!pot) return;
    const num = clampPercent(parseFloat(val) || 0);
    pot.props = pot.props || {};
    pot.props.Turn = String(num);
    setSelectedComponent(pot);
    selectionGroup = [pot];
    safeCall(markStateDirty);
    safeCall(updateProps);
    syncQuickPotSlider(pot);
    updateQuickControlsVisibility();
}

function quickSetComponentValue(kind, propKey, allowedSuffixes) {
    const { input, suffix } = getQuickValueElements(kind);
    if (!input || !suffix) return;
    const comp = selectedComponent && compKind(selectedComponent) === kind
        ? selectedComponent
        : findComponentByKind(kind);
    if (!comp) return;
    const { value, suffix: suf } = splitValueSuffix(input.value, suffix.value, allowedSuffixes);
    input.value = value;
    suffix.value = suf;
    comp.props = comp.props || {};
    comp.props[propKey] = `${value}${suf}`;
    setSelectedComponent(comp);
    selectionGroup = [comp];
    safeCall(markStateDirty);
    safeCall(updateProps);
    updateQuickControlsVisibility();
}

function quickSetResistorValue() {
    quickSetComponentValue('resistor', 'R', RESISTOR_SUFFIXES);
}

function quickSetCapacitorValue() {
    quickSetComponentValue('capacitor', 'C', CAPACITOR_SUFFIXES);
}

function quickSetFuncGenValue(propKey, inputEl, suffixEl, allowedSuffixes) {
    const fg = selectedComponent && ['funcgen', 'functiongenerator'].includes(compKind(selectedComponent))
        ? selectedComponent
        : findComponentByKind(['funcgen', 'functiongenerator']);
    if (!fg || !inputEl || !suffixEl) return;
    const { value, suffix } = splitValueSuffix(inputEl.value, suffixEl.value, allowedSuffixes);
    inputEl.value = value;
    suffixEl.value = suffix;
    fg.props = fg.props || {};
    fg.props[propKey] = `${value}${suffix}`;
    fg.sampleAccum = 0;
    setSelectedComponent(fg);
    selectionGroup = [fg];
    safeCall(markStateDirty);
    safeCall(updateProps);
    updateQuickControlsVisibility();
}

function syncQuickFuncGenFields() {
    const fg = selectedComponent && ['funcgen', 'functiongenerator'].includes(compKind(selectedComponent))
        ? selectedComponent
        : findComponentByKind(['funcgen', 'functiongenerator']);
    if (!fg) return;
    const { freqInput, freqSuffix, vppInput, vppSuffix } = getQuickFuncGenElements();
    if (freqInput && freqSuffix) {
        const { value, suffix } = splitValueSuffix(fg.props?.Freq || '', freqSuffix.value, FUNCGEN_FREQ_SUFFIXES);
        freqInput.value = value;
        freqSuffix.value = suffix;
    }
    if (vppInput && vppSuffix) {
        const { value, suffix } = splitValueSuffix(fg.props?.Vpp || '', vppSuffix.value, FUNCGEN_VPP_SUFFIXES);
        vppInput.value = value;
        vppSuffix.value = suffix;
    }
}

function quickSetFuncGenFreqValue() {
    const { freqInput, freqSuffix } = getQuickFuncGenElements();
    quickSetFuncGenValue('Freq', freqInput, freqSuffix, FUNCGEN_FREQ_SUFFIXES);
}

function quickSetFuncGenVppValue() {
    const { vppInput, vppSuffix } = getQuickFuncGenElements();
    quickSetFuncGenValue('Vpp', vppInput, vppSuffix, FUNCGEN_VPP_SUFFIXES);
}

function setActiveScopeById(id) {
    const scopes = listScopes();
    const match = scopes.find(s => s.id === id) || scopes[0];
    if (match) {
        activeScopeComponent = match;
        if (scopeMode) {
            syncScopeControls();
            drawScope();
            updateCursors();
        }
    }
}

function quickSelectScope(id) {
    setActiveScopeById(id);
    if (!scopeMode && activeScopeComponent) safeCall(openScope);
    syncQuickScopeSelect();
}

let quickScopeMenuClickHandler = null;
let quickScopeMenuKeyHandler = null;
let quickScopeMenuResizeHandler = null;

function closeQuickScopeMenu() {
    const select = (typeof document !== 'undefined') ? document.getElementById('quick-scope-select') : null;
    if (!select) return;
    select.dataset = select.dataset || {};
    select.dataset.open = 'false';
    select.classList?.add?.('hidden');
    select.hidden = true;
    if (select.style) select.style.display = 'none';
    select.size = 1;
    if (quickScopeMenuClickHandler && typeof document !== 'undefined') {
        document.removeEventListener('click', quickScopeMenuClickHandler);
    }
    if (quickScopeMenuKeyHandler && typeof window !== 'undefined') {
        window.removeEventListener('keydown', quickScopeMenuKeyHandler);
    }
    if (quickScopeMenuResizeHandler && typeof window !== 'undefined') {
        window.removeEventListener('resize', quickScopeMenuResizeHandler);
    }
    quickScopeMenuClickHandler = null;
    quickScopeMenuKeyHandler = null;
    quickScopeMenuResizeHandler = null;
}

function openQuickScopeMenu() {
    const select = (typeof document !== 'undefined') ? document.getElementById('quick-scope-select') : null;
    const scopes = listScopes();
    if (!select || !scopes.length) return;
    syncQuickScopeSelect();
    select.dataset = select.dataset || {};
    select.dataset.open = 'true';
    select.classList?.remove?.('hidden');
    select.hidden = false;
    if (select.style) select.style.display = 'block';
    select.size = Math.min(scopes.length, 6);
    if (typeof select.showPicker === 'function') {
        try { select.showPicker(); } catch (_) {}
    } else {
        select.focus?.();
    }

    quickScopeMenuClickHandler = (e) => {
        if (!e?.target?.closest || !e.target.closest('.scope-pair')) closeQuickScopeMenu();
    };
    quickScopeMenuKeyHandler = (e) => {
        if (e?.key === 'Escape') closeQuickScopeMenu();
    };
    quickScopeMenuResizeHandler = () => closeQuickScopeMenu();
    if (typeof document !== 'undefined') document.addEventListener('click', quickScopeMenuClickHandler);
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', quickScopeMenuKeyHandler);
        window.addEventListener('resize', quickScopeMenuResizeHandler);
    }
}

function quickScopeDropdownAction() {
    const select = (typeof document !== 'undefined') ? document.getElementById('quick-scope-select') : null;
    if (!select) return;
    if (select.dataset?.open === 'true') {
        closeQuickScopeMenu();
    } else {
        openQuickScopeMenu();
    }
}

function quickScopeToggleMain() {
    const scopes = listScopes();
    if (!scopes.length) return;
    const target = activeScopeComponent || scopes[0];
    setActiveScopeById(target.id);
    if (scopeMode) safeCall(closeScope);
    else safeCall(openScope);
}

function quickToggleScopeOverlay() {
    if (scopeMode) safeCall(closeScope);
    else safeCall(openScope);
    updateQuickControlsVisibility();
}

function quickToggleViewMode() {
    safeCall(toggleView);
    updateQuickControlsVisibility();
}

function quickSetFuncGenFreq(freq) {
    const fg = selectedComponent && ['funcgen', 'functiongenerator'].includes(compKind(selectedComponent))
        ? selectedComponent
        : findComponentByKind(['funcgen', 'functiongenerator']);
    if (!fg) return;
    fg.props = fg.props || {};
    fg.props.Freq = String(freq);
    fg.sampleAccum = 0;
    setSelectedComponent(fg);
    selectionGroup = [fg];
    safeCall(markStateDirty);
    safeCall(updateProps);
    updateQuickControlsVisibility();
}

function quickSetFuncGenVpp(vpp) {
    const fg = selectedComponent && ['funcgen', 'functiongenerator'].includes(compKind(selectedComponent))
        ? selectedComponent
        : findComponentByKind(['funcgen', 'functiongenerator']);
    if (!fg) return;
    fg.props = fg.props || {};
    fg.props.Vpp = String(vpp);
    fg.sampleAccum = 0;
    setSelectedComponent(fg);
    selectionGroup = [fg];
    safeCall(markStateDirty);
    safeCall(updateProps);
    updateQuickControlsVisibility();
}

function syncQuickBarVisibility() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('mobile-quick-bar');
    if (!bar) return;
    const hasQuickTargets = buildQuickList().length > 0;
    const hasScope = components.some(c => compKind(c) === 'oscilloscope');
    const shouldShow = hasQuickTargets || hasScope;
    if (quickBarVisible === shouldShow) return;
    quickBarVisible = shouldShow;
    if (!shouldShow) quickSelectionIndex = -1;
    bar.classList.toggle('hidden', !shouldShow);
    bar.setAttribute('aria-hidden', (!shouldShow).toString());
    if (shouldShow) {
        updateQuickControlsVisibility();
        syncQuickPotSlider();
    }
}

function __testSetComponents(list = []) {
    components = list;
    quickSelectionIndex = -1;
    selectedComponent = null;
    selectionGroup = [];
}

function __testGetSelected() {
    return selectedComponent;
}

function __testSetSelected(c) {
    setSelectedComponent(c);
}

function __testSetScope(scope) {
    activeScopeComponent = scope;
    scopeCanvas = scopeCanvas || {};
    scopeCtx = scopeCtx || {};
}

function __testGetActiveScope() {
    return activeScopeComponent;
}

function __testIsPaused() {
    return isPaused;
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
    return serializeCircuitPayload({
        schemaId: SAVE_SCHEMA_ID,
        schemaVersion: SAVE_SCHEMA_VERSION,
        metadata: {
            savedAt: new Date().toISOString(),
            viewMode,
            zoom,
            viewOffset: { x: viewOffsetX, y: viewOffsetY }
        },
        components,
        wires,
        getComponentTypeId
    });
}

function applySerializedState(data) {
    validateSaveData(data, { schemaId: SAVE_SCHEMA_ID, schemaVersion: SAVE_SCHEMA_VERSION });

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
    downloadJSON(serializeState(), 'circuitforge-save.json');
}

function handleImportJSON(file) {
    readJSONFile(file).then((data) => {
        applySerializedState(data);
        saveStateToLocalStorage();
    }).catch((err) => {
        alert('Could not import file: ' + err.message);
    });
}

function triggerImportDialog() {
    triggerFileInput('import-json-input');
}

function downloadTemplateJSON() {
    const target = selectionGroup.length ? selectionGroup : null;
    const payload = serializeTemplateLibrary(target);
    if (!payload.components.length) {
        alert('Select at least one component or build a circuit before saving a template.');
        return;
    }
    const stamp = fileTimestamp();
    const defaultId = payload.id || `template-${stamp}`;
    const id = prompt('Template ID (used as filename)', defaultId);
    if (!id) return;
    payload.id = id;
    const label = prompt('Template label (shown in gallery)', payload.label || id) || id;
    payload.label = label;
    payload.icon = payload.icon || 'fas fa-puzzle-piece';
    downloadJSON(payload, `${id}.json`);
}

function handleImportTemplate(file) {
    readJSONFile(file).then((data) => {
        deserializeTemplate(data);
    }).catch((err) => {
        alert('Could not import template: ' + err.message);
    });
}

function triggerImportTemplateDialog() {
    triggerFileInput('import-template-input');
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
function findPinAt(m, radius = PIN_HIT_RADIUS) {
    for (const c of components) {
        for (let i = 0; i < c.pins.length; i++) {
            const p = c.getPinPos(i);
            if (Math.hypot(m.x - p.x, m.y - p.y) < radius) {
                return { c, p: i };
            }
        }
    }
    return null;
}

// Refreshes `hoveredPin`, `hoverWire`, and (when wiring) `activeWireHover`, plus
// snaps the active wire's current point to the aimed target. Called from onMove/onUp.
function updatePointerContext(m) {
    const busy = draggingComponent || draggingWire || selectionBox || isPanning || pendingComponentDrag;
    if (busy) {
        hoveredPin = null;
        hoverWire = null;
        hoveredComponent = null;
        activeWireHover = null;
        if (canvas) canvas.style.cursor = '';
        return;
    }

    // Slightly larger pick radius when actively wiring so the snap feels forgiving.
    const pinRadius = activeWire ? PIN_HIT_RADIUS * 1.3 : PIN_HIT_RADIUS;
    hoveredPin = findPinAt(m, pinRadius);
    hoverWire = hoveredPin ? null : pickWireAt(m, WIRE_HIT_DISTANCE);
    // Component body hover (for the value tooltip) — only when we're NOT hovering a
    // pin or a wire, and not in the middle of drawing a wire.
    hoveredComponent = (!hoveredPin && !hoverWire && !activeWire)
        ? components.find((c) => c.isInside(m.x, m.y)) || null
        : null;

    if (activeWire && !activeWire.toPin) {
        const sameAsStart = hoveredPin
            && hoveredPin.c === activeWire.fromPin.c
            && hoveredPin.p === activeWire.fromPin.p;

        if (hoveredPin && !sameAsStart) {
            const pt = hoveredPin.c.getPinPos(hoveredPin.p);
            activeWireHover = { kind: 'pin', target: hoveredPin, point: pt };
            activeWire.currentPoint = pt;
        } else if (hoverWire) {
            activeWireHover = { kind: 'wire', target: hoverWire, point: snapToBoardPoint(m.x, m.y) };
            activeWire.currentPoint = activeWireHover.point;
        } else {
            const compHit = components.find(c => c !== activeWire.fromPin.c && c.isInside(m.x, m.y));
            if (compHit) {
                activeWireHover = { kind: 'component', target: compHit, point: snapToBoardPoint(m.x, m.y) };
                activeWire.currentPoint = activeWireHover.point;
            } else {
                activeWireHover = null;
                activeWire.currentPoint = snapToBoardPoint(m.x, m.y);
            }
        }
    } else {
        activeWireHover = null;
    }

    // Cursor affordance: pointer on a pin, crosshair while drawing, default otherwise.
    if (canvas) {
        if (hoveredPin) canvas.style.cursor = 'pointer';
        else if (activeWire) canvas.style.cursor = 'crosshair';
        else canvas.style.cursor = '';
    }
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

const {
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
} = wiringApi;

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

        // If the click lands on an existing vertex, drag just that one (free move).
        // Otherwise, grab the whole segment: both endpoints (if they're vertices) translate
        // together on the axis perpendicular to the segment, so the grabbed line stays
        // parallel to itself. Pin-connected ends stay pinned; routeManhattan inserts a
        // one-grid stub so the wire re-anchors cleanly (Cadence/Multisim style).
        let movingIdx = verts.findIndex(
            v => Math.hypot(v.x - snap.x, v.y - snap.y) <= GRID * 0.4
        );
        let movedIndices = [];
        let segmentOrientation = null;

        if (movingIdx >= 0) {
            movedIndices = [movingIdx];
        } else {
            const segStart = polyline[best.idx];
            const segEnd = polyline[best.idx + 1];
            const horizontal = segStart.y === segEnd.y && segStart.x !== segEnd.x;
            const vertical = segStart.x === segEnd.x && segStart.y !== segEnd.y;
            segmentOrientation = horizontal ? 'H' : (vertical ? 'V' : null);

            // polyline[0] is the from-pin, polyline[n] is the to-pin; everything between
            // maps to wire.vertices by index-1.
            const startVertIdx = best.idx - 1;
            const endVertIdx = best.idx;
            if (startVertIdx >= 0 && startVertIdx < verts.length) movedIndices.push(startVertIdx);
            if (endVertIdx >= 0 && endVertIdx < verts.length) movedIndices.push(endVertIdx);

            if (movedIndices.length === 0) {
                // Pin-to-pin segment with no interior vertices: fall back to the old
                // "insert a vertex at click" behaviour so a straight wire is still draggable.
                const insertAt = Math.min(best.idx, verts.length);
                verts.splice(insertAt, 0, { ...snap, userPlaced: true });
                movingIdx = insertAt;
                movedIndices = [insertAt];
                draggingWire.insertedIdx = insertAt;
                segmentOrientation = null;
            } else {
                movingIdx = movedIndices[0];
            }
        }

        draggingWire.verts = verts;
        draggingWire.movingIdx = movingIdx;
        draggingWire.movedIndices = movedIndices;
        draggingWire.segmentOrientation = segmentOrientation;
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
        let dx = m.x - wireDragStart.x;
        let dy = m.y - wireDragStart.y;
        // Segment drags lock to the perpendicular axis so the grabbed line translates
        // without tilting. Vertex drags (segmentOrientation === null) stay free.
        if (draggingWire.segmentOrientation === 'H') dx = 0;
        else if (draggingWire.segmentOrientation === 'V') dy = 0;

        const moved = Math.hypot(dx, dy) > 0;
        wireDragMoved = wireDragMoved || moved;

        if (moved) {
            const indices = draggingWire.movedIndices || [draggingWire.movingIdx];
            const movedSet = new Set(indices);
            const newVerts = draggingWire.verts.map((v, idx) => {
                if (!movedSet.has(idx)) return { ...v };
                const snapped = snapToBoardPoint(v.x + dx, v.y + dy);
                // Mark the user's drag targets so dropCollinearVerts won't erase them later.
                return { ...snapped, userPlaced: true };
            });

            // Route through routeManhattan so pin-connected ends get a one-grid stub, then
            // strip router-added stubs that are collinear with their neighbours so the wire
            // state doesn't accumulate noise across repeated drags.
            const wire = draggingWire.wire;
            const startPos = wire.from.c.getPinPos(wire.from.p);
            const endPos = wire.to.c.getPinPos(wire.to.p);
            const startDir = getPinDirection(wire.from.c, wire.from.p);
            const endDir = getPinDirection(wire.to.c, wire.to.p);

            // Shift-held inverts the router's L preference so the user can flip an
            // awkward elbow without breaking grip on the segment.
            let preferredOrientation = wire.routePref || null;
            if (shiftHeldForWire) {
                const inferred = preferredOrientation
                    || inferRoutePreference(startPos, newVerts, endPos);
                preferredOrientation = inferred === ROUTE_ORIENTATION.H_FIRST
                    ? ROUTE_ORIENTATION.V_FIRST
                    : ROUTE_ORIENTATION.H_FIRST;
            }

            // Feed component bounding boxes as obstacles so routeManhattan prefers the
            // L orientation whose elbow doesn't land inside another component's body.
            // Endpoint components are excluded because their bodies legitimately host
            // the wire's pins on their edges.
            const obstacles = components
                .filter(c => c !== wire.from.c && c !== wire.to.c && typeof c.getBoundingBox === 'function')
                .map(c => c.getBoundingBox());

            let routedPath = routeManhattan(
                startPos,
                newVerts,
                endPos,
                startDir,
                endDir,
                { preferredOrientation, obstacles }
            );

            // If the L router still can't clear the obstacles (large components between
            // start and end), fall back to A* and keep whichever path has fewer crossings.
            if (obstacles.length) {
                const routedCrossings = countPathCrossings(routedPath, obstacles);
                if (routedCrossings > 0) {
                    const astar = routeAStar(startPos, endPos, { obstacles });
                    if (astar && astar.length >= 2 && countPathCrossings(astar, obstacles) < routedCrossings) {
                        routedPath = astar;
                    }
                }
            }

            const routedMids = routedPath.slice(1, Math.max(1, routedPath.length - 1));
            wire.vertices = dropCollinearVerts(routedMids, startPos, endPos);
        }
    }

    updatePointerContext(m);
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

    updatePointerContext(m);

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

    // While drawing a wire, Backspace drops the last waypoint instead of deleting
    // the selected component. Lets the user "take back" corners before committing.
    if (e.key === 'Backspace' && !isEditable && activeWire && !activeWire.toPin) {
        e.preventDefault();
        if (activeWire.vertices && activeWire.vertices.length > 0) {
            activeWire.vertices.pop();
            if (activeWire.vertices.length === 0) activeWire.routePref = null;
        } else {
            activeWire = null;
        }
        return;
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
        const helpDialog = document.getElementById('help-overlay');
        if (helpDialog?.open) { helpDialog.close(); return; }

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
    // ? toggles the keyboard reference overlay. Capture 'shift+/' too since that's
    // the raw keystroke on US layouts when the user presses the ? glyph.
    if (!isEditable && (e.key === '?' || (e.key === '/' && e.shiftKey))) {
        e.preventDefault();
        const dialog = document.getElementById('help-overlay');
        if (dialog) {
            if (dialog.open) dialog.close();
            else if (typeof dialog.showModal === 'function') dialog.showModal();
        }
    }
    // A autoscales the scope's V/div on both channels.
    if (!isEditable && e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) {
        if (typeof autoscaleScopeVoltage === 'function') {
            e.preventDefault();
            autoscaleScopeVoltage();
        }
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
        va: sampleChannelAt(ch.data, startIdx, pctA, HISTORY_SIZE),
        vb: sampleChannelAt(ch.data, startIdx, pctB, HISTORY_SIZE)
    }));

    const stats = computeScopeChannelStats(scope, HISTORY_SIZE);
    const diffA = channels[0].va - channels[1].va;
    const diffB = channels[0].vb - channels[1].vb;

    return {
        pctA,
        pctB,
        tA,
        tB,
        deltaT,
        freq,
        channels,
        diff: {
            va: diffA,
            vb: diffB,
            dv: diffB - diffA
        },
        stats
    };
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

    const diffAEl = document.getElementById('chd-va');
    const diffBEl = document.getElementById('chd-vb');
    const diffDEl = document.getElementById('chd-dv');
    if (diffAEl) diffAEl.innerText = formatSignedUnit(metrics.diff?.va || 0, 'V');
    if (diffBEl) diffBEl.innerText = formatSignedUnit(metrics.diff?.vb || 0, 'V');
    if (diffDEl) diffDEl.innerText = formatSignedUnit(metrics.diff?.dv || 0, 'V');

    const { stats } = metrics;
    const ch1Max = document.getElementById('ch1-max');
    const ch1Min = document.getElementById('ch1-min');
    const ch2Max = document.getElementById('ch2-max');
    const ch2Min = document.getElementById('ch2-min');
    const chMaxDiff = document.getElementById('ch-max-diff');
    const chMinDiff = document.getElementById('ch-min-diff');
    const ch1Span = document.getElementById('ch1-span');
    const ch2Span = document.getElementById('ch2-span');
    if (stats?.ch1 && ch1Max) ch1Max.innerText = formatSignedUnit(stats.ch1.max, 'V');
    if (stats?.ch1 && ch1Min) ch1Min.innerText = formatSignedUnit(stats.ch1.min, 'V');
    if (stats?.ch2 && ch2Max) ch2Max.innerText = formatSignedUnit(stats.ch2.max, 'V');
    if (stats?.ch2 && ch2Min) ch2Min.innerText = formatSignedUnit(stats.ch2.min, 'V');
    if (stats?.ch1 && chMaxDiff) chMaxDiff.innerText = formatSignedUnit(stats.ch1.max - stats.ch1.min, 'V');
    if (stats?.ch2 && chMinDiff) chMinDiff.innerText = formatSignedUnit(stats.ch2.max - stats.ch2.min, 'V');
    if (stats?.ch1 && ch1Span) ch1Span.innerText = formatSignedUnit(stats.ch1.max - stats.ch1.min, 'V');
    if (stats?.ch2 && ch2Span) ch2Span.innerText = formatSignedUnit(stats.ch2.max - stats.ch2.min, 'V');
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
    const autoBtn = document.getElementById('scope-autoscale-btn');

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

    if (autoBtn && !autoBtn._scopeHooked) {
        autoBtn.addEventListener('click', autoscaleScopeVoltage);
        autoBtn._scopeHooked = true;
    }
}

function pickScopeVScale(targetVpp) {
    const perDivNeeded = targetVpp / 10;
    let choice = SCOPE_VDIV_OPTIONS[SCOPE_VDIV_OPTIONS.length - 1];
    for (const opt of SCOPE_VDIV_OPTIONS) {
        if (parseUnit(opt) >= perDivNeeded) {
            choice = opt;
            break;
        }
    }
    return choice;
}

function autoscaleScopeVoltage() {
    const scope = activeScopeComponent || components.find(c => c instanceof Oscilloscope);
    if (!scope || !scope.data) return;
    const stats = computeScopeChannelStats(scope, HISTORY_SIZE);
    if (!stats) return;
    const maxVpp = Math.max(stats.ch1.vpp, stats.ch2.vpp);
    if (!isFinite(maxVpp) || maxVpp <= 0) return;
    const nextVdiv = pickScopeVScale(maxVpp);
    scope.props.VDiv1 = nextVdiv;
    scope.props.VDiv2 = nextVdiv;
    scope.sampleAccum = 0;
    safeCall(syncScopeControls);
    safeCall(drawScope);
    safeCall(updateCursors);
    markStateDirty();
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

function canvasIsEmpty() {
    return (!components || components.length === 0) && (!wires || wires.length === 0);
}

function enforcePauseWhenEmpty() {
    if (!canvasIsEmpty()) return false;
    if (!isPaused) {
        isPaused = true;
        updatePlayPauseButton();
    }
    return true;
}

function toggleSim() {
    if (enforcePauseWhenEmpty()) {
        refreshSimIndicators();
        return;
    }
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
      if (enforcePauseWhenEmpty()) {
          draw();
          if (scopeMode) drawScope();
          refreshSimIndicators();
          requestAnimationFrame(loop);
          return;
      }
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
    syncQuickBarVisibility();
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

    // Help overlay close button
    const helpClose = document.getElementById('help-close');
    if (helpClose) {
        helpClose.addEventListener('click', () => {
            document.getElementById('help-overlay')?.close();
        });
    }
    // Track Shift live so the wire preview can flip its elbow on demand while a wire is being drawn.
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !shiftHeldForWire) shiftHeldForWire = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') shiftHeldForWire = false;
    });

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
    autoscaleScopeVoltage,
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
        Oscilloscope,
        quickSelectPrev,
        quickSelectNext,
        quickToggleSwitchPosition,
        quickAdjustPot,
        quickToggleScopeOverlay,
        quickToggleViewMode,
        quickSetFuncGenFreq,
        quickSetFuncGenVpp,
        quickSetPotTurn,
        quickSetResistorValue,
        quickSetCapacitorValue,
        quickSetFuncGenFreqValue,
        quickSetFuncGenVppValue,
        quickSelectScope,
        quickScopeDropdownAction,
        quickScopeToggleMain,
        autoscaleScopeVoltage
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
    setCursorVisibility,
    updateCursors,
    buildCursorMetrics,
    computeScopeChannelStats,
    // Test helpers
    syncQuickBarVisibility,
    quickSelectPrev,
    quickSelectNext,
    quickToggleSwitchPosition,
    quickAdjustPot,
    quickToggleScopeOverlay,
    quickToggleViewMode,
    quickSetFuncGenFreq,
    quickSetFuncGenVpp,
    safeCall,
    __testSetComponents,
    __testGetSelected,
    __testSetSelected,
    updateQuickControlsVisibility,
    quickSetPotTurn,
    quickSetResistorValue,
    quickSetCapacitorValue,
    quickSelectScope,
    quickSetFuncGenFreqValue,
    quickSetFuncGenVppValue,
    quickScopeDropdownAction,
    quickScopeToggleMain,
    autoscaleScopeVoltage,
    __testSetScope,
    __testGetActiveScope,
    __testIsPaused,
    toggleSim
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
