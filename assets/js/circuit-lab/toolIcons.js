// Tool-icon renderer. Paints a miniature physical-view preview of each
// component into its sidebar button so users can recognize it at a glance
// without relying on word labels alone. createToolIconPainter returns a
// factory closed over its defaults (GRID pitch, skip-pins predicate) so the
// caller just passes { selector, ComponentClass, setup, offsetY } per button.

function createToolIconPainter({
    GRID = 20,
    iconWidth = 56,
    iconHeight = 42,
    padding = 18,
    pinStub = 0.25,
    skipPins = () => false
} = {}) {
    return function paintToolIcon(selector, ComponentClass, setupFn, offsetY = 0) {
        const btn = document.querySelector(selector);
        if (!btn) return null;

        const oldIcon = btn.querySelector('i');
        if (oldIcon) oldIcon.style.display = 'none';

        let canvas = btn.querySelector('canvas.tool-icon');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'tool-icon';
            canvas.width = iconWidth;
            canvas.height = iconHeight;
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto 4px';
            btn.insertBefore(canvas, btn.firstChild);
        }
        const ictx = canvas.getContext('2d');
        ictx.clearRect(0, 0, canvas.width, canvas.height);

        const c = new ComponentClass(0, 0);
        c.x = 0;
        c.y = 0;
        c.rotation = 0;
        c.mirrorX = false;
        if (setupFn) setupFn(c);

        const targetW = (c.w || 40) + padding;
        const targetH = (c.h || 40) + padding;
        const scale = Math.min(
            (canvas.width - 6) / targetW,
            (canvas.height - 6) / targetH,
            1
        );

        // Ink color depends on the button's rendered background so dark sidebars
        // get light ink and vice versa — works with or without the site theme.
        const btnStyle = getComputedStyle(btn);
        const bg = btnStyle.backgroundColor || '';
        const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        const luminance = match
            ? (0.299 * +match[1] + 0.587 * +match[2] + 0.114 * +match[3]) / 255
            : null;
        const isLight = document.body?.classList?.contains('theme-light')
            || (luminance !== null && luminance > 0.5);
        const strokeColor = isLight ? '#1e293b' : '#f1f5f9';

        ictx.save();
        ictx.translate(canvas.width / 2, canvas.height / 2 + offsetY);
        ictx.scale(scale, scale);

        ictx.strokeStyle = strokeColor;
        ictx.fillStyle = strokeColor;
        if (typeof c.drawPhys === 'function') c.drawPhys(ictx);

        if (!skipPins(c) && Array.isArray(c.pins)) {
            ictx.strokeStyle = strokeColor;
            ictx.lineWidth = 1.2;
            c.pins.forEach((p) => {
                const pos = typeof c.localToWorld === 'function'
                    ? c.localToWorld(p.x, p.y)
                    : { x: p.x, y: p.y };
                ictx.beginPath();
                ictx.moveTo(pos.x, pos.y);
                ictx.lineTo(pos.x, pos.y + GRID * pinStub);
                ictx.stroke();
                ictx.fillStyle = strokeColor;
                ictx.beginPath();
                ictx.arc(pos.x, pos.y, 2.1, 0, Math.PI * 2);
                ictx.fill();
            });
        }

        ictx.restore();
        return canvas;
    };
}

export { createToolIconPainter };
