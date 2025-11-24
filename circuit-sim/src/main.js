/**
 * Entry point wiring together schematic editor, solver, and scope.
 */
import { Schematic } from './ui/schematic.js';
import { Scope } from './ui/scope.js';
import { renderToolbar, renderSimControls, updateProperties } from './ui/panels.js';
import { buildSolverFromNetlist } from './sim/netlist.js';

const logEl = document.getElementById('log');
function log(msg) {
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

const schematicCanvas = document.getElementById('schematic');
const schematic = new Schematic(schematicCanvas, log);
const scope = new Scope(document.getElementById('scope'));
let running = false;
let solver = null;

renderToolbar(document.getElementById('toolbar'), schematic, (tool) => {
  log(`Tool: ${tool}`);
});

renderSimControls(document.getElementById('sim-controls'), {
  dc: () => runDC(),
  run: () => startTransient(),
  stop: () => stopSim()
});

schematicCanvas.addEventListener('click', () => {
  updateProperties(document.getElementById('prop-content'), schematic.selected, () => {});
});

function populateNodeSelectors(nodes) {
  const ch1 = document.getElementById('ch1-node');
  const ch2 = document.getElementById('ch2-node');
  [ch1, ch2].forEach((sel) => {
    sel.innerHTML = '';
    nodes.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `${n.id}: ${n.name}`;
      sel.appendChild(opt);
    });
  });
  ch1.value = 1;
  ch2.value = 2;
}

function defaultCircuit() {
  const vin = schematic.addComponent('VAC', { x: 120, y: 200 }, { vPeak: 1, freq: 1e3 });
  const r1 = schematic.addComponent('R', { x: 220, y: 200 }, { R: 1000 });
  const c1 = schematic.addComponent('C', { x: 320, y: 200 }, { C: 1e-6 });
  const gnd = schematic.addComponent('GND', { x: 120, y: 260 });
  schematic.wires.push(
    { points: [vin.pins[0], r1.pins[0]] },
    { points: [r1.pins[1], c1.pins[0]] },
    { points: [c1.pins[1], gnd.pins[0]] },
    { points: [vin.pins[1], gnd.pins[0]] }
  );
  schematic.draw();
}

defaultCircuit();

function buildSolver() {
  const netlist = schematic.currentNetlist();
  populateNodeSelectors(netlist.nodes);
  solver = buildSolverFromNetlist(netlist);
  return solver;
}

function runDC() {
  buildSolver();
  const result = solver.runDC();
  schematic.updateNodeVoltages(solver);
  log(`DC operating point ${result.converged ? 'converged' : 'failed'} in ${result.iterations} iterations.`);
}

function startTransient() {
  if (!solver) buildSolver();
  running = true;
  loop();
}

function stopSim() {
  running = false;
}

function loop() {
  if (!running) return;
  const dt = parseFloat(document.getElementById('dt').value || '1e-4');
  const tDiv = parseFloat(document.getElementById('time-div').value || '1e-3');
  scope.setScales({ vDiv: parseFloat(document.getElementById('v-div').value || '1'), tDiv });
  solver.dt = dt;
  const ok = solver.stepTransient(solver.time);
  if (!ok) log('Transient step failed to converge.');
  const ch1 = parseInt(document.getElementById('ch1-node').value || '1', 10);
  const ch2 = parseInt(document.getElementById('ch2-node').value || '0', 10);
  const v1 = ch1 === 0 ? 0 : solver.solution[ch1 - 1] || 0;
  const v2 = ch2 === 0 ? 0 : solver.solution[ch2 - 1] || 0;
  scope.sample(solver.time, v1, v2);
  schematic.updateNodeVoltages(solver);
  scope.draw();
  requestAnimationFrame(loop);
}

runDC();
scope.draw();
