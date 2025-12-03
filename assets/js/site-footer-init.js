import { renderSiteFooter, updateFooterYear } from './site-footer.js';

function initializeSiteFooter() {
  try {
    const footer = renderSiteFooter();
    if (footer) {
      updateFooterYear();
    }
  } catch (error) {
    console.error('Site footer failed to render:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSiteFooter, { once: true });
} else {
  initializeSiteFooter();
}
