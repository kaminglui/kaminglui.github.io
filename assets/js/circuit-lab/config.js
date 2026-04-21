// Tuning constants for the Circuit Lab UI and embedded simulator.
// Extracted from circuitforge.js; see docs/circuit-lab-architecture.md.

// Grid + simulation time-step
export const GRID         = 20;    // breadboard hole spacing (world units)
export const DT           = 1e-7;  // 0.1 µs
export const SUB_STEPS    = 200;   // 20 µs per frame
export const HISTORY_SIZE = 1200;  // samples in scope history

// UI / interaction constants
export const PIN_HIT_RADIUS        = GRID * 0.4;
export const PIN_LEG_LENGTH        = GRID * 0.3;
export const PIN_HEAD_RADIUS       = 2.2;
export const GRID_HOLE_RADIUS      = 2.6;
export const WIRE_HIT_DISTANCE     = 12;
export const WIRE_WIDTH_SELECTED   = 6;
export const WIRE_WIDTH_HOVER      = 3.2;
export const WIRE_WIDTH_DEFAULT    = 2.2;
export const WIRE_OUTLINE_PADDING  = 2;
export const WIRE_CORNER_RADIUS    = 2;
export const WIRE_DASH_PATTERN     = [4, 4];
export const ACTIVE_WIRE_WIDTH     = 1.5;
export const MARQUEE_DASH_PATTERN  = [5, 3];
export const SELECTION_DASH_PATTERN= [4, 4];
export const SELECTION_PADDING     = 4;

// Persistence
export const SAVE_SCHEMA_ID        = 'circuitforge-state';
export const SAVE_SCHEMA_VERSION   = 1;
export const LOCAL_STORAGE_KEY     = 'circuitforge-save';
export const AUTOSAVE_DELAY_MS     = 450;

// Zoom / scope window
export const ZOOM_IN_STEP          = 1.1;
export const ZOOM_OUT_STEP         = 0.9;
export const DEFAULT_SCOPE_WINDOW_POS = { x: 12, y: 0 };
export const SCOPE_WINDOW_MODE_ENABLED = false; // Disable windowed scope view without removing code paths

// Input filtering
export const EDITABLE_TAGS         = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

// Label typography
export const LABEL_FONT_SMALL      = '8px monospace';
export const LABEL_FONT_MEDIUM     = '10px monospace';
export const LABEL_FONT_BOLD       = 'bold 11px monospace';
export const LABEL_FONT_MOSFET_TYPE= 'bold 13px monospace';
export const LABEL_FONT_LARGE      = '12px monospace';
export const LABEL_GAP_SMALL       = 6;
export const LABEL_GAP_MEDIUM      = 10;
export const LABEL_OUTSIDE_OFFSET  = 14;
export const PIN_LABEL_OFFSET      = 24;
export const PIN_LABEL_DISTANCE    = 16;
export const CENTER_LABEL_DISTANCE = 12;

// Interaction timing
export const DRAG_DEADZONE         = 3;
export const TOUCH_SELECTION_HOLD_MS = 280;
export const COMPONENT_DELETE_HOLD_MS = 650;

// Component defaults
export const SWITCH_TYPES          = ['SPST', 'SPDT', 'DPDT'];
export const DEFAULT_SWITCH_TYPE   = 'SPDT';
export const SCOPE_VDIV_OPTIONS    = ['50m', '100m', '200m', '500m', '1', '2', '5', '10'];

// Responsive
export const MOBILE_BREAKPOINT     = 768;

// Simulator leak / op-amp / function generator tuning
export const BASELINE_NODE_LEAK    = 1e-11;
export const OPAMP_GAIN            = 1e9;
export const OPAMP_INPUT_LEAK      = 1e-15;
export const OPAMP_OUTPUT_LEAK     = 1e-12;
export const OPAMP_RAIL_HEADROOM   = 0.1;
// A bench function generator normally references its output to chassis/ground.
// Keep COM near ground with a low impedance so "floating" hookups (COM not
// explicitly wired) still deliver the configured amplitude instead of letting
// the COM node wander and steal half the signal.
export const FUNCGEN_REF_RES       = 1;     // tie COM solidly to reference
export const FUNCGEN_SERIES_RES    = 1;     // tiny source impedance to keep stacks stable

export const PROP_UNITS = {
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
