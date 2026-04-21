// Voltmeter probe mode. Given canvas-space hit-testing helpers and a simulator
// snapshot reader, follows the cursor over pins and wires and shows the live
// node voltage in a floating readout div. createProbe() returns { toggle,
// isActive, hover, updateReadout } so the host just has to fire hover() on
// mousemove and updateReadout() on each draw.

function formatVoltage(v) {
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs < 1e-3) return `${(v * 1e6).toFixed(1)} µV`;
    if (abs < 1)    return `${(v * 1e3).toFixed(1)} mV`;
    return `${v.toFixed(3)} V`;
}

function createProbe({
    canvas,
    probeReadout,
    canvasShellSelector = '.canvas-shell',
    probeButtonId = 'probe-btn',
    screenToWorld,
    findPinAt,
    pickWireAt,
    wireHitDistance = 8,
    getSim,
    formatLabel = (pin) => `${(pin.c.id || pin.c.kind)}·${pin.p}`
} = {}) {
    let active = false;
    let hover = null; // { kind: 'pin'|'wire', screen, voltage, label }

    function readVoltageForPin(c, pinIdx) {
        const sim = getSim();
        if (!c || !sim?.getNodeIndex) return null;
        const n = sim.getNodeIndex(c, pinIdx);
        if (n === -1 || n == null) return 0;
        const sol = sim.solution;
        return (sol && Number.isFinite(sol[n])) ? sol[n] : null;
    }

    function readVoltageForWire(w) {
        const sim = getSim();
        if (!w || !sim?.getNodeIndex) return null;
        const n = sim.getNodeIndex(w.from?.c, w.from?.p);
        if (n === -1 || n == null) return 0;
        const sol = sim.solution;
        return (sol && Number.isFinite(sol[n])) ? sol[n] : null;
    }

    function toggle(forceOn) {
        active = (typeof forceOn === 'boolean') ? forceOn : !active;
        const shell = document.querySelector(canvasShellSelector);
        if (shell) shell.classList.toggle('probe-mode', active);
        const btn = document.getElementById(probeButtonId);
        if (btn) btn.classList.toggle('active-tool', active);
        if (!active) {
            hover = null;
            if (probeReadout) probeReadout.classList.add('hidden');
        }
    }

    function updateHover(clientX, clientY) {
        if (!active || !canvas) {
            hover = null;
            return;
        }
        const m = screenToWorld(clientX, clientY);
        const pin = typeof findPinAt === 'function' ? findPinAt(m) : null;
        let wireHit = null;
        if (!pin && typeof pickWireAt === 'function') {
            wireHit = pickWireAt(m, wireHitDistance);
        }
        if (pin) {
            hover = {
                kind: 'pin',
                screen: { x: clientX, y: clientY },
                voltage: readVoltageForPin(pin.c, pin.p),
                label: formatLabel(pin)
            };
        } else if (wireHit) {
            hover = {
                kind: 'wire',
                screen: { x: clientX, y: clientY },
                voltage: readVoltageForWire(wireHit),
                label: 'wire'
            };
        } else {
            hover = null;
        }
    }

    function updateReadout() {
        if (!probeReadout) return;
        if (!active || !hover) {
            probeReadout.classList.add('hidden');
            return;
        }
        const { screen, voltage, label } = hover;
        probeReadout.classList.remove('hidden');
        // When the simulator hasn't produced a solution yet, every probed pin
        // reads null — tell the user that explicitly instead of showing "—"
        // with no context so they know to press Play.
        const sim = getSim();
        const simReady = !!sim?.getNodeIndex && !!sim?.solution;
        probeReadout.textContent = simReady
            ? `${label}  ${formatVoltage(voltage)}`
            : `${label}  — (press Play to simulate)`;
        const shell = document.querySelector(canvasShellSelector);
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        probeReadout.style.left = `${Math.round(screen.x - rect.left + 14)}px`;
        probeReadout.style.top  = `${Math.round(screen.y - rect.top + 14)}px`;
    }

    return {
        toggle,
        isActive: () => active,
        updateHover,
        updateReadout
    };
}

export { createProbe, formatVoltage };
