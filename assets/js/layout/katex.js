/* Centralised KaTeX loader. Replaces the 12-line boilerplate that used to
   live at the bottom of every math-heavy lab page. Labs opt in via
   `initMainLayout(pageId, { withKaTeX: true })`.

   Why split out: same vendor CSS + script + render loop was copy-pasted into
   five labs with per-lab version drift (rl-lab CSS 0.16.9 vs JS 0.16.11).
   One source of truth here; every lab now gets the same KaTeX.

   Idempotency: re-entering initKatex() is safe. `katex.render(tex, el, …)`
   parses `tex` from the data attribute each time and overwrites the element,
   so multiple renders of the same node don't accumulate markup. */

const KATEX_VERSION = '0.16.11';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;

function ensureStylesheet() {
  if (document.querySelector('link[data-katex-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${CDN_BASE}/katex.min.css`;
  link.dataset.katexCss = 'true';
  document.head.appendChild(link);
}

function ensureScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.katex) return Promise.resolve();
  const existing = document.querySelector('script[data-katex-js]');
  if (existing) {
    return new Promise((resolve) => {
      if (window.katex) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `${CDN_BASE}/katex.min.js`;
    script.defer = true;
    script.dataset.katexJs = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

function renderAll() {
  if (!window.katex) return;
  document.querySelectorAll('[data-katex]').forEach((el) => {
    const tex = el.getAttribute('data-katex');
    if (!tex) return;
    const displayMode = el.hasAttribute('data-katex-display');
    window.katex.render(tex, el, { throwOnError: false, displayMode });
  });
}

export async function initKatex() {
  if (typeof document === 'undefined') return;
  ensureStylesheet();
  await ensureScript();
  renderAll();
}
