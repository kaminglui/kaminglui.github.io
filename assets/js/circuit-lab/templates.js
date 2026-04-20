// Pure template helpers: measurement, serialization, endpoint mapping, and
// the component-dictionary lookup used while instantiating a template. Nothing
// here touches the active circuit state — callers pass the selection + wire
// list in and get plain data back, which makes the helpers equally useful for
// serializing a selection, preparing a template JSON export, or computing a
// placement origin from an imported library entry.

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

function getTemplateBounds(template) {
    const comps = template?.components || [];
    if (!comps.length) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    comps.forEach((c) => {
        const cx = c?.x || 0;
        const cy = c?.y || 0;
        if (cx < x1) x1 = cx;
        if (cy < y1) y1 = cy;
        if (cx > x2) x2 = cx;
        if (cy > y2) y2 = cy;
    });
    return { x1, y1, x2, y2 };
}

function getTemplateCenter(template) {
    const b = getTemplateBounds(template);
    return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}

function mapTemplateEndpoint(endpoint, idMap, indexMap) {
    if (!endpoint) return { comp: null, pin: null };
    const idx = endpoint.index ?? endpoint.i;
    const comp = (idx != null) ? indexMap.get(idx) : idMap.get(endpoint.id);
    const pin = endpoint.pin ?? endpoint.p ?? 0;
    return { comp, pin };
}

// Relative-coordinate serialization used when exporting a template for reuse.
// Wires between selected components keep their vertex list, normalized so the
// bounding box sits at the origin; unselected wires are dropped.
function serializeTemplate({
    selection,
    wires = [],
    getComponentTypeId,
    normalizeVertex = (v) => ({ x: v?.x || 0, y: v?.y || 0 })
}) {
    const selected = Array.isArray(selection) ? selection.slice() : [];
    if (!selected.length) return { components: [], wires: [] };

    const minX = Math.min(...selected.map((c) => c.x || 0));
    const minY = Math.min(...selected.map((c) => c.y || 0));

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

    const shift = (v = {}) => normalizeVertex({ x: (v.x || 0) - minX, y: (v.y || 0) - minY });
    const serialWires = wires
        .filter((w) => compIndexMap.has(w.from.c) && compIndexMap.has(w.to.c))
        .map((w) => ({
            from: { index: compIndexMap.get(w.from.c), pin: w.from.p },
            to:   { index: compIndexMap.get(w.to.c), pin: w.to.p },
            vertices: (w.vertices || []).map(shift)
        }));

    return { components: compEntries, wires: serialWires };
}

// Absolute-coordinate flavour used when bundling a whole circuit into a
// reusable library entry — preserves each component's id and world position
// so the entry round-trips without renumbering.
function serializeTemplateLibrary({ selection, wires = [], getComponentTypeId }) {
    const selected = Array.isArray(selection) ? selection.slice() : [];
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
        .filter((w) => compIndexMap.has(w.from.c) && compIndexMap.has(w.to.c))
        .map((w) => ({
            from: { id: w.from.c?.id, pin: w.from.p, index: compIndexMap.get(w.from.c) },
            to:   { id: w.to.c?.id,   pin: w.to.p,   index: compIndexMap.get(w.to.c) },
            vertices: (w.vertices || []).map((v) => ({ x: v.x || 0, y: v.y || 0 }))
        }));

    return { components: compEntries, wires: serialWires };
}

export {
    normalizeTemplateComponent,
    getTemplateBounds,
    getTemplateCenter,
    mapTemplateEndpoint,
    serializeTemplate,
    serializeTemplateLibrary
};
