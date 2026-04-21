// Minimap widget: draws a miniature of the full board with component dots,
// wire polylines, and a viewport rectangle that tracks the current camera.
// Clicking or dragging on the minimap re-centres the main canvas viewport.
// Factory takes getters for everything it needs to read — components, wires,
// camera, board extents — plus a setCamera callback to move the view.

const DEFAULT_PAD = 120;

function createMinimap({
    minimapCanvas,
    minimapPanel,
    getComponents,
    getWires,
    getCamera,
    setCamera,
    getViewportSize,
    getBoardSize,
    pad = DEFAULT_PAD
} = {}) {
    if (!minimapCanvas) return null;
    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) return null;

    function worldBounds() {
        const { w, h } = getBoardSize();
        return { x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 };
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = minimapCanvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (minimapCanvas.width !== w * dpr || minimapCanvas.height !== h * dpr) {
            minimapCanvas.width = w * dpr;
            minimapCanvas.height = h * dpr;
        }
    }

    const categoryColor = (c) => {
        const k = (c && c.kind) || '';
        if (k === 'voltagesource' || k === 'ground' || k === 'functiongenerator') return '#fbbf24';
        if (k === 'oscilloscope') return '#38bdf8';
        if (k === 'lf412') return '#a78bfa';
        if (k === 'led') return '#f87171';
        return '#cbd5e1';
    };

    function draw() {
        resize();
        const dpr = window.devicePixelRatio || 1;
        const W = minimapCanvas.width;
        const H = minimapCanvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const bounds = worldBounds();
        const board = getBoardSize();
        const sx = W / bounds.w;
        const sy = H / bounds.h;
        const mapX = (wx) => (wx - bounds.x) * sx;
        const mapY = (wy) => (wy - bounds.y) * sy;

        ctx.fillStyle = 'rgba(35, 45, 60, 0.55)';
        ctx.fillRect(mapX(0), mapY(0), board.w * sx, board.h * sy);
        ctx.strokeStyle = 'rgba(120, 140, 170, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX(0), mapY(0), board.w * sx, board.h * sy);

        const wires = getWires() || [];
        if (wires.length) {
            ctx.strokeStyle = 'rgba(140, 180, 210, 0.55)';
            ctx.lineWidth = Math.max(1, 1 * dpr);
            ctx.beginPath();
            wires.forEach((w) => {
                try {
                    const poly = (typeof w.getPolyline === 'function') ? w.getPolyline() : null;
                    const pts = Array.isArray(poly) && poly.length
                        ? poly
                        : [w.from?.c?.getPinPos?.(w.from.p), w.to?.c?.getPinPos?.(w.to.p)].filter(Boolean);
                    if (pts.length < 2) return;
                    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
                    for (let i = 1; i < pts.length; i += 1) {
                        ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
                    }
                } catch { /* skip malformed */ }
            });
            ctx.stroke();
        }

        const components = getComponents() || [];
        components.forEach((c) => {
            const r = 2 * dpr;
            ctx.fillStyle = categoryColor(c);
            ctx.beginPath();
            ctx.arc(mapX(c.x), mapY(c.y), r, 0, Math.PI * 2);
            ctx.fill();
        });

        const camera = getCamera();
        const vp = getViewportSize();
        const viewW = (vp.w || 0) / (camera.zoom || 1);
        const viewH = (vp.h || 0) / (camera.zoom || 1);
        const vx = -camera.offsetX;
        const vy = -camera.offsetY;
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
        ctx.strokeRect(mapX(vx), mapY(vy), viewW * sx, viewH * sy);
        ctx.fillStyle = 'rgba(96, 165, 250, 0.10)';
        ctx.fillRect(mapX(vx), mapY(vy), viewW * sx, viewH * sy);
    }

    function panToClient(clientX, clientY) {
        const rect = minimapCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = worldBounds();
        const mx = ((clientX - rect.left) / rect.width) * bounds.w + bounds.x;
        const my = ((clientY - rect.top) / rect.height) * bounds.h + bounds.y;
        const camera = getCamera();
        const vp = getViewportSize();
        const viewW = (vp.w || 0) / (camera.zoom || 1);
        const viewH = (vp.h || 0) / (camera.zoom || 1);
        setCamera({
            offsetX: -(mx - viewW / 2),
            offsetY: -(my - viewH / 2)
        });
    }

    function attachHandlers() {
        if (!minimapPanel) return;
        let dragging = false;
        minimapPanel.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            panToClient(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            panToClient(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', () => { dragging = false; });
        minimapPanel.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            if (!t) return;
            e.preventDefault();
            dragging = true;
            panToClient(t.clientX, t.clientY);
        }, { passive: false });
        minimapPanel.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (!t || !dragging) return;
            e.preventDefault();
            panToClient(t.clientX, t.clientY);
        }, { passive: false });
        minimapPanel.addEventListener('touchend', () => { dragging = false; });
    }

    return { draw, attachHandlers };
}

export { createMinimap };
