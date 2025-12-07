import { runSimulation, updateComponentState } from './engine.js';

let wasmSolver = null;
let wasmLoadError = null;

/**
 * Placeholder loader. In the future this can fetch and instantiate a WASM module,
 * then set `wasmSolver` to an object exposing a `solve` method.
 */
async function loadSolverWasm(_options = {}) {
  wasmSolver = null;
  wasmLoadError = 'WASM solver not bundled; using JS solver instead.';
  return { ok: false, error: wasmLoadError };
}

function isWasmSolverReady() {
  return !!wasmSolver;
}

function getWasmLoadError() {
  return wasmLoadError;
}

function solveCircuitWasm(options) {
  if (wasmSolver && typeof wasmSolver.solve === 'function') {
    return wasmSolver.solve(options);
  }
  return runSimulation(options);
}

function updateCircuitState(options) {
  if (wasmSolver && typeof wasmSolver.updateState === 'function') {
    return wasmSolver.updateState(options);
  }
  return updateComponentState(options);
}

export {
  getWasmLoadError,
  isWasmSolverReady,
  loadSolverWasm,
  solveCircuitWasm,
  updateCircuitState
};
