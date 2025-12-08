import { renderSiteHeader as buildHeader, computeRootPrefix } from '../site-header.js';
import { renderSiteFooter as buildFooter, updateFooterYear } from '../site-footer.js';

function setHeaderVars(header) {
  if (!header || !header.getBoundingClientRect) return;
  const { height } = header.getBoundingClientRect();
  if (Number.isFinite(height) && height > 0) {
    document.documentElement.style.setProperty('--nav-height', `${height}px`);
    document.documentElement.style.setProperty('--header-h', `${height}px`);
  }
}

function observeHeader(header) {
  if (!header) return;
  const update = () => setHeaderVars(header);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return ro;
  }
  window.addEventListener('resize', update);
  return null;
}

function resolveRootPrefix(explicit) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if (typeof document !== 'undefined') {
    return computeRootPrefix(window.location?.pathname);
  }
  return '';
}

function renderSiteHeader(options = {}) {
  const headerTarget =
    options.target ??
    document.getElementById('site-header') ??
    document.querySelector('[data-site-header]');
  if (!headerTarget) return null;

  const pageId = options.pageId || options.currentLab || headerTarget.dataset.currentLab;
  const rootPrefix = resolveRootPrefix(options.rootPrefix || headerTarget.dataset.navRoot);
  const showEditToggle = options.showEditToggle ??
    headerTarget.dataset.showEditToggle === 'true';
  const useLocalAnchors = options.useLocalAnchors ?? pageId === 'home';

  headerTarget.id = 'top';
  headerTarget.dataset.siteHeader = 'true';
  headerTarget.dataset.currentLab = pageId || '';
  headerTarget.dataset.navRoot = rootPrefix || '';

  const nav = buildHeader({
    target: headerTarget,
    currentLab: pageId,
    rootPrefix,
    useLocalAnchors,
    showEditToggle
  });

  const headerEl = nav?.closest('[data-site-header]') || headerTarget;
  setHeaderVars(headerEl);
  observeHeader(headerEl);
  return headerEl;
}

function renderSiteFooter(options = {}) {
  const footerTarget =
    options.target ??
    document.getElementById('site-footer') ??
    document.querySelector('[data-site-footer]');
  if (!footerTarget) return null;

  const pageId = options.pageId || options.preset || footerTarget.dataset.footerId;
  const rootPrefix = resolveRootPrefix(options.rootPrefix || footerTarget.dataset.footerRoot);

  footerTarget.dataset.siteFooter = 'true';
  footerTarget.dataset.footerId = pageId || 'home';
  footerTarget.dataset.footerRoot = rootPrefix || '';

  const footer = buildFooter({
    target: footerTarget,
    preset: pageId || 'home',
    rootPrefix
  });
  if (footer) updateFooterYear();
  return footer;
}

function initSiteShell(pageId = 'home', opts = {}) {
  const resolvedId = pageId || document.body?.dataset?.currentLab || 'home';
  const rootPrefix = resolveRootPrefix(opts.rootPrefix);

  renderSiteHeader({
    pageId: resolvedId,
    rootPrefix,
    showEditToggle: opts.showEditToggle,
    useLocalAnchors: opts.useLocalAnchors
  });
  if (resolvedId !== 'circuit-lab') {
    renderSiteFooter({ pageId: resolvedId, rootPrefix });
  }
}

export { initSiteShell, renderSiteFooter, renderSiteHeader };
