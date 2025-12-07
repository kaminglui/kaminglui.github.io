# Circuit Lab Architecture

## Where things live
- **UI / editor**: `assets/js/circuitforge.js` (components, wiring UI, scope rendering).
- **Component renderers**: one file per component under `assets/js/circuit-lab/components/`, imported by the UI entry point.
- **Templates and loader**: JSON definitions live under `assets/js/circuit-lab/templates/` and are loaded via `assets/js/circuit-lab/templateRegistry.js` (which also hydrates `window.CIRCUIT_TEMPLATES` through `circuitforge.templates.js`).
- **Headless simulation core**: `assets/js/sim/engine.js` exports `CircuitSim.runSimulation`, `updateComponentState`, and utilities.
- **Shared sim utilities**: `assets/js/sim/utils/` holds reusable helpers (ID registry, waveform analysis) shared by the UI and tests.
- **Automated tests**: `assets/js/sim/tests/` split into `unit/` and `integration/`, all using the shared `testHarness.js`.

## Testing
- Run the full suite with `npm test`.
- Add focused component tests under `assets/js/sim/tests/unit/` and multi-block/template circuits under `assets/js/sim/tests/integration/`.
- Import helpers from `assets/js/sim/tests/testHarness.js`; template-driven tests should load JSON via `assets/js/circuit-lab/templateRegistry.js`.

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
