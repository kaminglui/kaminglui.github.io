import { renderSiteHeader } from './site-header.js';

function initializeSiteHeader() {
  try {
    renderSiteHeader();
  } catch (error) {
    console.error('Site header failed to render:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSiteHeader, { once: true });
} else {
  initializeSiteHeader();
}
