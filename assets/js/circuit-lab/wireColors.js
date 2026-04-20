// Wire voltage heatmap. Given a voltage v and a peak magnitude vMax,
// wireColorForVoltage returns a CSS color along a diverging teal-blue (cold)
// to amber-red (warm) ramp, with a neutral grey band around zero. wireVoltage-
// Range picks a stable vMax by snapping up to the nearest familiar rail
// voltage so small-signal circuits don't shimmer as colors re-normalize each
// frame.

function wireVoltageRange(wires) {
    let peak = 0;
    const list = wires || [];
    for (const w of list) {
        const mag = Math.abs(w?.v || 0);
        if (mag > peak) peak = mag;
    }
    if (peak < 1) return 1;
    if (peak < 5) return 5;
    if (peak < 12) return 12;
    if (peak < 24) return 24;
    return Math.ceil(peak);
}

function wireColorForVoltage(v, vMax) {
    const n = Math.max(-1, Math.min(1, (v || 0) / (vMax || 1)));
    if (Math.abs(n) < 0.015) return '#6b7280';
    if (n > 0) {
        const t = n;
        const r = Math.round(250 + (-30) * t);
        const g = Math.round(200 + (-160) * t);
        const b = Math.round(30 + (10) * t);
        return `rgb(${r}, ${g}, ${b})`;
    }
    const t = -n;
    const r = Math.round(45 + (-10) * t);
    const g = Math.round(212 + (-130) * t);
    const b = Math.round(191 + (44) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

function createHeatmapToggle({
    initial = true,
    buttonId = 'heatmap-btn',
    activeClass = 'active-tool',
    legendId = 'heatmap-legend',
    legendVisibleClass = 'is-visible',
    legendRangeId = 'legend-range',
    legendRangePosId = 'legend-range-pos'
} = {}) {
    let enabled = !!initial;
    const syncUi = () => {
        if (typeof document === 'undefined') return;
        const btn = document.getElementById(buttonId);
        if (btn) btn.classList.toggle(activeClass, enabled);
        const legend = document.getElementById(legendId);
        if (legend) legend.classList.toggle(legendVisibleClass, enabled);
    };
    syncUi();

    // Update the small range label next to the legend so users can see which
    // rail the color ramp is currently normalizing against.
    function updateLegendRange(vMax) {
        if (typeof document === 'undefined') return;
        const formatted = vMax >= 1 ? Math.round(vMax) : vMax.toPrecision(2);
        const neg = document.getElementById(legendRangeId);
        const pos = document.getElementById(legendRangePosId);
        if (neg) neg.textContent = String(formatted);
        if (pos) pos.textContent = String(formatted);
    }

    return {
        toggle(force) {
            enabled = (typeof force === 'boolean') ? force : !enabled;
            syncUi();
            return enabled;
        },
        isEnabled: () => enabled,
        updateLegendRange
    };
}

export { wireVoltageRange, wireColorForVoltage, createHeatmapToggle };
