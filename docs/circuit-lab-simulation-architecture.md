# Circuit Lab Simulation Architecture

## Current JS solver
- Browser-native ES modules; core lives in `assets/js/sim/engine.js`, orchestrated by the UI in `assets/js/circuitforge.js`.
- Modified nodal analysis with a small Gaussian elimination (retrying with extra leak if singular).
- Reference detection prefers Ground components, then negative/COM pins of sources; measurement-only parts do not create MNA nodes.
- Stability aids: baseline leak to reference for every node, diode iteration cap, op-amp headroom clamp, and function-generator reference/series resistances.
- Stateful parts (capacitors, LEDs, MOSFET caches) update via `updateComponentState` each step.

## Known limits
- JS number math and the simple solver struggle with extremely stiff or huge matrices.
- Oscilloscope history and SUB_STEPS loops are single-threaded; very dense scenes can eat a frame budget.
- No SIMD/parallelism; larger transient sweeps will feel sluggish on low-end devices.

## JS/TS vs WASM (client-only)
- JavaScript / TypeScript
  - Pros: zero build tooling at runtime, easy debugging, flexible dynamic checks, already wired into the UI.
  - Cons: slower numeric kernels, weaker type guarantees unless using TS/JSDoc, single-threaded unless we move work into a Worker.
- WebAssembly (Rust/C++)
  - Pros: near-native numeric performance, better control over memory layout, easier to add SIMD or threading (with proper headers).
  - Cons: extra build step, harder debugging, still need JS/TS glue for DOM and canvas, and must be fetched/instantiated on page load.

## Future architecture sketch
- Core solver in Rust/C++ compiled to a `solver.wasm` alongside a tiny JS shim.
- UI (still JS/TS) builds a netlist `{ nodes, components, sources }` and calls `solveCircuitWasm(netlist, time, dt)`.
- Results (node voltages, device currents) flow back to the UI for coloring and scope buffers; the WASM module exposes a single `solve` entry point.
- `assets/js/sim/wasmInterface.js` becomes the seam: `loadSolverWasm(url)` fetches/instantiates the module, `solveCircuitWasm` delegates to WASM when ready or falls back to the JS solver (current behavior).
- Remains 100% static: `.wasm` is served like any other asset and loaded with `fetch` + `WebAssembly.instantiateStreaming`.

## Implementation breadcrumbs
- Wrapper stub: `assets/js/sim/wasmInterface.js` already exports `loadSolverWasm`, `solveCircuitWasm`, `updateCircuitState`, and readiness helpers, forwarding to the JS solver today.
- Hook point: the UI now calls the wrapper from `circuitforge.js`, so swapping in a real WASM backend only touches the wrapper.
- Keep tests pointed at both paths: reuse the same netlist shape for JS and WASM solvers to avoid duplicate harnesses.
