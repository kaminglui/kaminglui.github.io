// Pure layout + sampling math for the Circuit Lab oscilloscope.
// circuitforge.js composes these with DOM state.

export function computeWorkspaceHeight({
    viewportH = 0,
    headerH = 0,
    simBarH = 0,
    subtractSimBar = true
} = {}) {
    const safeViewport = Number.isFinite(viewportH) ? viewportH : 0;
    const safeHeader   = Number.isFinite(headerH) ? headerH : 0;
    const safeSimbar   = Number.isFinite(simBarH) ? simBarH : 0;
    const simDeduct = subtractSimBar ? safeSimbar : 0;
    return Math.max(0, safeViewport - safeHeader - simDeduct);
}

export function sampleChannelAt(arr, startIdx, pct, historySize) {
    const pos = (pct / 100) * historySize;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const i1 = (startIdx + idx) % historySize;
    const i2 = (startIdx + idx + 1) % historySize;
    const v1 = arr[i1];
    const v2 = arr[i2];
    return v1 + (v2 - v1) * frac;
}

export function computeScopeChannelStats(scope, historySize) {
    if (!scope || !scope.data) return null;
    const { ch1 = [], ch2 = [] } = scope.data;
    const reduceStats = (arr) => {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < Math.min(arr.length, historySize); i++) {
            const v = arr[i];
            if (!isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = 0;
        return { min, max, vpp: max - min };
    };
    return { ch1: reduceStats(ch1), ch2: reduceStats(ch2) };
}

export function computeScopeLayout(mode, {
    shellRect = null,
    viewport = { width: 0, height: 0 },
    headerH = 0,
    simBarH = 0,
    windowPos = { x: 0, y: 0 },
    windowSize = { width: 560, height: 360 }
} = {}) {
    const containerW = shellRect?.width ?? Math.max(0, viewport?.width || 0);
    const containerHRaw = shellRect?.height ?? computeWorkspaceHeight({
        viewportH: viewport?.height || 0,
        headerH,
        simBarH
    });
    const maxWindowH = Math.max(0, (viewport?.height || 0) - headerH - 8);
    const containerH = Math.max(0, Math.min(containerHRaw, maxWindowH || containerHRaw));
    const hasStoredPos = Number.isFinite(windowPos?.x) && Number.isFinite(windowPos?.y);

    if (mode === 'fullscreen') {
        const fullH = shellRect?.height ?? containerHRaw;
        return {
            windowed: false,
            width: containerW,
            height: fullH || containerH,
            left: 0,
            top: 0
        };
    }

    const padding = 0;
    const minW = 320;
    const minH = 240;
    const baseW = Math.max(minW, Math.min(windowSize?.width || 560, Math.max(minW, (containerW || minW) - padding * 2)));
    const baseH = Math.max(minH, Math.min(windowSize?.height || 360, Math.max(minH, (containerH || minH) - padding * 2)));
    const safeWidth = Math.max(minW, Math.min(baseW, containerW || baseW));
    const safeHeight = Math.max(minH, Math.min(baseH, containerH || baseH));
    const maxLeft = Math.max(0, containerW - safeWidth - padding);
    const maxTop = Math.max(0, containerH - safeHeight - padding);
    let left = hasStoredPos ? windowPos.x : maxLeft;
    let top = hasStoredPos ? windowPos.y : maxTop;
    left = Math.min(Math.max(left, padding), maxLeft || padding);
    top = Math.min(Math.max(top, padding), maxTop || padding);

    return {
        windowed: true,
        width: safeWidth,
        height: safeHeight,
        left,
        top
    };
}
