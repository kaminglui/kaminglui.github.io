// Pure pin + label geometry helpers. Every function is side-effect free and
// only reads from a component's pins / rotation / mirrorX / x / y, so any UI
// module can reuse them without pulling in the rest of the Circuit Lab
// runtime. getPinCenter averages a component's pin positions; getPinDirection
// snaps a pin's outward axis to the nearest cardinal; offsetLabelFromPin
// pushes a label outward from the pin by a given distance.

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

function offsetLabelFromPin(comp, pinIdx, distance, fallbackDir = { x: 0, y: 1 }) {
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

// Snaps a pin's rotated / mirrored direction to the nearest ±x or ±y axis,
// so callers can place cardinal-aligned labels without worrying about which
// orientation the parent component is in.
function getPinDirection(comp, pinIdx) {
    const pin = comp?.pins?.[pinIdx];
    if (!pin) return null;
    let px = pin.x;
    let py = pin.y;
    for (let r = 0; r < (comp.rotation || 0); r += 1) {
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

// Inverse of Component.localToWorld — maps a world-space point back into the
// component's local coordinate frame. Handy for hit-testing against the
// geometry a component draws in its own rotated / mirrored space.
function worldToLocal(comp, x, y) {
    let px = x - (comp.x || 0);
    let py = y - (comp.y || 0);
    if (comp.mirrorX) px = -px;
    for (let r = comp.rotation || 0; r > 0; r -= 1) {
        const tx = px;
        px = py;
        py = -tx;
    }
    return { x: px, y: py };
}

export { getPinCenter, offsetLabelFromPin, getPinDirection, worldToLocal };
