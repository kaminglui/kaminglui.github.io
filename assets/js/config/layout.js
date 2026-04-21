const FOOTER_DISABLED_PAGES = new Set(['circuit-lab']);

function shouldRenderFooter(pageId) {
  return !FOOTER_DISABLED_PAGES.has(pageId);
}

export { FOOTER_DISABLED_PAGES, shouldRenderFooter };

