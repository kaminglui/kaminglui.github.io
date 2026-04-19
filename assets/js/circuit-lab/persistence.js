// Pure save/load helpers for Circuit Lab.
// circuitforge.js composes these; state mutation stays there.

export function fileTimestamp(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function validateSaveData(data, { schemaId, schemaVersion }) {
    if (!data || typeof data !== 'object') throw new Error('Invalid save data');
    if (data.schema !== schemaId) throw new Error('File is not a Circuit Forge save.');
    if (typeof data.version !== 'number') throw new Error('Missing save version.');
    if (data.version > schemaVersion) {
        throw new Error('Save file requires a newer version of Circuit Forge.');
    }
    return data;
}

export function serializeCircuitPayload({
    schemaId,
    schemaVersion,
    metadata,
    components,
    wires,
    getComponentTypeId
}) {
    return {
        schema: schemaId,
        version: schemaVersion,
        metadata,
        components: components
            .map((c) => ({
                id: c.id,
                type: getComponentTypeId(c),
                x: c.x,
                y: c.y,
                rotation: c.rotation,
                mirrorX: !!c.mirrorX,
                props: { ...c.props }
            }))
            .filter((entry) => entry.type !== null),
        wires: wires
            .map((w) => ({
                from: { id: w.from?.c?.id, p: w.from?.p },
                to: { id: w.to?.c?.id, p: w.to?.p },
                vertices: (w.vertices || []).map((v) => ({ x: v.x, y: v.y }))
            }))
            .filter((w) => w.from.id != null && w.to.id != null)
    };
}

export function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function readJSONFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                resolve(JSON.parse(e.target.result));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

export function triggerFileInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = '';
    input.click();
}
