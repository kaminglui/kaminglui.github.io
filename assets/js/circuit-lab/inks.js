// Shared, mutable "ink" colors for Circuit Lab component symbols.
// circuitforge.js updates these on theme toggle; components import the
// `circuitInk` object and read `.primary` when they draw in schematic mode.
// Physical (drawPhys) colors stay hardcoded because they represent actual
// hardware (resistor body, voltage-source casing, etc.).

export const circuitInk = {
  primary: '#ffffff'
};

export function setCircuitInk(next) {
  if (next && typeof next === 'object') {
    Object.assign(circuitInk, next);
  }
}
