/* Chrome breakpoints shared between JS-side width checks and CSS @media
   queries. Source of truth is :root in assets/css/style.css (--bp-nav-collapse,
   --bp-side-nav). JS reads them via getComputedStyle so changing a value in
   CSS automatically propagates; the fallback constants guard against the CSS
   not being loaded yet (e.g. when init runs before the stylesheet parses). */

const FALLBACKS = {
  '--bp-nav-collapse': 800,
  '--bp-side-nav': 900
};

export function readBreakpointPx(name) {
  const fallback = FALLBACKS[name] ?? 0;
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
