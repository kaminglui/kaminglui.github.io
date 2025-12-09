# Circuit Lab Architecture

## Where things live
- **UI / editor**: `assets/js/circuitforge.js` (components, wiring UI, scope rendering).
- **Component renderers**: one file per component under `assets/js/circuit-lab/components/`, imported by the UI entry point.
- **Templates and loader**: Template data now ships as JS modules under `assets/js/circuit-lab/templates/` (e.g. `mixer-karaoke.js`) and is cloned via `assets/js/circuit-lab/templateRegistry.js` (which also hydrates `window.CIRCUIT_TEMPLATES` through `circuitforge.templates.js`). Missing templates emit a console warning but no longer break the page load.
- **Template format**: `serializeTemplate`/`deserializeTemplate` expose a compact, ID-free template shape using component indices and relative coordinates (normalized to the selection bounding box) for clipboard and template save/load. Full saves remain unchanged.
- **Headless simulation core**: `assets/js/sim/engine.js` exports `CircuitSim.runSimulation`, `updateComponentState`, and utilities.
- **Simulation interface**: `assets/js/sim/wasmInterface.js` wraps the JS solver today and leaves hooks for a future WASM backend.
- **Shared sim utilities**: `assets/js/sim/utils/` holds reusable helpers (ID registry, waveform analysis) shared by the UI and tests.
- **Automated tests**: `assets/js/sim/tests/` split into `unit/` and `integration/`, all using the shared `testHarness.js`.

## Testing
- Run the full suite with `npm test`.
- Add focused component tests under `assets/js/sim/tests/unit/` and multi-block/template circuits under `assets/js/sim/tests/integration/`.
- Import helpers from `assets/js/sim/tests/testHarness.js`; template-driven tests should load JSON via `assets/js/circuit-lab/templateRegistry.js`.

## Wiring and scope UI
- Wiring helpers live in `assets/js/circuit-lab/wiring.js` and are injected into the UI with `createWiringApi` inside `circuitforge.js`. Snapshots power drag behaviour: both-end moves translate every vertex, while single-end moves only re-anchor the touched side and preserve user bends. Route preferences are cached per wire so the first leg stays stable, and occupancy maps steer new routes (with small offsets if two wires would otherwise sit on the same lane).
- Junction insertion flows through `splitWireAtPoint`, replacing the original wire with two tagged segments so later drags keep their orthogonal legs. UI shift-clicks simply call this helper and start a new active wire from the created junction.
- The oscilloscope overlay is sized by `computeScopeLayout`/`setScopeOverlayLayout` using the canvas shell, header height, and sim bar height. Window mode clamps the top/left inside the shell (defaulting to the top edge); fullscreen uses the shell bounds. Dragging records pointer deltas and applies a clamped translation; the scope canvas is resized after layout writes to keep the waveform aspect ratio accurate.
- When adding UI-facing tests, prefer the Vitest suites under `assets/js/sim/tests/unit/` (e.g. `wiring.behavior.test.js` or `scope.layout.test.js`) so routing/layout assumptions are covered alongside the solver.

## Node and reference handling
- Pins from every component are unioned using the wire list to form connectivity roots.
- A reference node is required. It is detected from any `Ground` component or the negative/COM pin of a voltage source or function generator. If none is found the engine returns a clear error.
- Measurement-only parts (`Oscilloscope`, `Junction`) do not create MNA nodes. Each active node gets a tiny leak to reference to keep floating subgraphs solvable without affecting results.
- The reference node is always index `-1` in the `pinToNode` map. Other nodes are 0-based.

## Stamping overview
- Solver: a small Gaussian elimination over the conductance matrix `G` and RHS vector `I`, with a retry after adding extra leak if the system is singular.
- Resistor / potentiometer: conductance between pins, with a minimum leg resistance to avoid divide-by-zero.
- Capacitor: backward-Euler conductance `C/dt` plus history current using the stored `_lastV`.
- LED: simple diode model with on/off state, small reverse leak, and a Norton-equivalent forward knee (`Vf`, `If`).
- Switch: `getActiveConnections()` defines on-state pairs; off-state uses a very small conductance.
- MOSFET: simple square-law MOS model driven by cached terminal voltages; small leak between drain and source.
- Voltage source: ideal MNA source with an auxiliary current row.
- Function generator: dual voltage sources relative to COM with 1 Ω reference to ground and 1 Ω series impedance per terminal so partially connected hookups stay stable.
- Op-amp (LF412): VCVS with very high gain, input/output leaks, and rail clamping. Supply rails come from pins 7 (VCC+) and 3 (VCC-); if absent, wide default rails are used. Output is clamped to `rails ± headroom`.
- Oscilloscope: never stamped into the matrix; it only reads node voltages so it stays high-impedance.

## Transient behaviour
- `runSimulation` can optionally call `updateComponentState` to persist capacitor voltage, LED conduction state, and MOSFET cached voltages for the next step.
- Time-dependent sources (function generator) use the `time` argument passed to `runSimulation`.

## Simulation entry
- The UI’s `simulate(t)` delegates to `CircuitSim.runSimulation(...)`, then writes results back into wires for colouring and feeds the oscilloscope buffer.
