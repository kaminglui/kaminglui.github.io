// Viewport + layout measurement helpers. Shared across any page that needs to
// read the effective visual-viewport size, sync CSS custom properties for
// header / sim-bar heights, or audit vertical stacking against the viewport
// height in tests. Implementation is environment-guarded so node-based tests
// can import without a DOM.

const DEFAULT_MOBILE_BREAKPOINT = 768;

function getViewportSize() {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const vv = window.visualViewport;
    const fallbackW = Math.round(window.screen?.width || 0);
    const fallbackH = Math.round(window.screen?.height || 0);
    const width = Math.round(
        vv?.width
        || window.innerWidth
        || (typeof document !== 'undefined' ? document.documentElement.clientWidth : 0)
        || fallbackW
    );
    const height = Math.round(
        vv?.height
        || window.innerHeight
        || (typeof document !== 'undefined' ? document.documentElement.clientHeight : 0)
        || fallbackH
    );
    return { width, height };
}

function isMobileViewport(breakpoint = DEFAULT_MOBILE_BREAKPOINT) {
    const { width } = getViewportSize();
    return width > 0 && width <= breakpoint;
}

function isLayoutDebuggingEnabled() {
    if (typeof document === 'undefined') return false;
    const body = document.body;
    if (!body) return false;
    return body.dataset.debugLayout === 'true' || body.hasAttribute('data-debug-layout');
}

// Measure the rendered heights of the site header, sim bar, and workspace,
// then compare their sum against the viewport. Useful in tests and dev-time
// layout audits to catch overlap or gap regressions early.
function validateLayoutHeights({
    computeWorkspaceHeight,
    workspaceSelectors = ['#circuit-lab-root', '.lab-main', '.canvas-shell'],
    headerSelector = '.site-header',
    simBarSelector = '#sim-bar',
    tolerance = 3
} = {}) {
    if (typeof document === 'undefined') return { ok: true, delta: 0, parts: {} };
    const { height: viewportH } = getViewportSize();
    const headerEl = document.querySelector(headerSelector);
    const simBarEl = document.querySelector(simBarSelector);
    const workspaceEl = workspaceSelectors
        .map((sel) => document.querySelector(sel))
        .find(Boolean) || null;
    const measure = (el) => el?.getBoundingClientRect?.().height ?? el?.offsetHeight ?? 0;
    const headerH = measure(headerEl);
    const simBarH = measure(simBarEl);
    const workspaceH = measure(workspaceEl);
    const expectedWorkspace = (typeof computeWorkspaceHeight === 'function')
        ? computeWorkspaceHeight({ viewportH, headerH, simBarH })
        : null;
    const delta = Math.abs((headerH + simBarH + workspaceH) - viewportH);
    return {
        ok: delta <= tolerance,
        delta,
        parts: { viewportH, headerH, simBarH, workspaceH, expectedWorkspace }
    };
}

// Push measured heights to CSS custom properties so layouts that can't rely
// on 100dvh (older browsers, embedded webviews) have something to calc
// against. The caller supplies a workspace-height formula so this helper
// stays agnostic about which page's math to use.
function syncViewportCssVars({
    computeWorkspaceHeight,
    headerSelector = '.site-header',
    simBarSelector = '#sim-bar',
    workspaceHeightVar = '--workspace-h',
    debug = false
} = {}) {
    if (typeof document === 'undefined') return null;
    const root = document.documentElement;
    const { width, height } = getViewportSize();
    if (width)  root.style.setProperty('--viewport-w', `${width}px`);
    if (height) root.style.setProperty('--viewport-h', `${height}px`);

    const headerEl = document.querySelector(headerSelector);
    const headerH = headerEl?.getBoundingClientRect?.().height ?? headerEl?.offsetHeight ?? 0;
    root.style.setProperty('--header-h', `${Math.max(0, headerH || 0)}px`);

    const simBarEl = document.querySelector(simBarSelector);
    const simBarH = simBarEl?.getBoundingClientRect?.().height ?? simBarEl?.offsetHeight ?? 0;
    root.style.setProperty('--simbar-height', `${Math.max(0, simBarH || 0)}px`);

    const supportsDvh = (typeof CSS !== 'undefined') && CSS.supports?.('height: 100dvh');
    if (!supportsDvh && typeof computeWorkspaceHeight === 'function') {
        const workspaceH = computeWorkspaceHeight({
            viewportH: height,
            headerH,
            simBarH,
            subtractSimBar: true
        });
        if (workspaceH || workspaceH === 0) {
            root.style.setProperty(workspaceHeightVar, `${workspaceH}px`);
        }
    } else {
        root.style.removeProperty(workspaceHeightVar);
    }

    return {
        width,
        height,
        headerH,
        simBarH,
        debugEnabled: !!debug && isLayoutDebuggingEnabled()
    };
}

export {
    DEFAULT_MOBILE_BREAKPOINT,
    getViewportSize,
    isMobileViewport,
    isLayoutDebuggingEnabled,
    validateLayoutHeights,
    syncViewportCssVars
};
