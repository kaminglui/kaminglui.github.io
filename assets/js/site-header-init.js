import { renderSiteHeader } from './site-header.js';

function setHeaderHeightVars(header) {
  if (!header || !header.getBoundingClientRect) return;
  const { height } = header.getBoundingClientRect();

  if (Number.isFinite(height) && height > 0) {
    document.documentElement.style.setProperty('--nav-height', `${height}px`);
    document.documentElement.style.setProperty('--header-h', `${height}px`);
  }
}

function attachHeaderHeightObserver(header) {
  if (!header) return;

  const update = () => setHeaderHeightVars(header);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return observer;
  }

  window.addEventListener('resize', update);
  return null;
}

function initializeSiteHeader() {
  try {
    const nav = renderSiteHeader();
    const header = nav?.closest('[data-site-header], .site-header') ??
      document.querySelector('[data-site-header]') ??
      document.querySelector('.site-header');

    if (header) {
      setHeaderHeightVars(header);
      attachHeaderHeightObserver(header);
    }
  } catch (error) {
    console.error('Site header failed to render:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSiteHeader, { once: true });
} else {
  initializeSiteHeader();
}
