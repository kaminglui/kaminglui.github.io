import { DEFAULT_META, FOOTER_PRESETS } from './config/footerPresets.js';
import { normalizeRootPrefix, resolveRootPrefix } from './layout/rootPrefix.js';

function resolvePreset(footer, presetId) {
  const id = presetId || footer?.dataset?.footerId || footer?.dataset?.footerPreset || 'home';
  return FOOTER_PRESETS[id] || FOOTER_PRESETS.home;
}

function buildActionMarkup(actions = [], rootPrefix = '') {
  if (!Array.isArray(actions) || actions.length === 0) return '';

  const safePrefix = normalizeRootPrefix(rootPrefix);
  return actions
    .map(({ label, href, variant }) => {
      if (!label || !href) return '';
      const isAbsolute = /^(https?:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('#');
      const resolvedHref = isAbsolute ? href : `${safePrefix}${href}`;
      const classes = ['button'];
      if (variant === 'primary') classes.push('button--primary');
      if (variant === 'ghost') classes.push('button--ghost');
      return `<a class="${classes.join(' ')}" href="${resolvedHref}">${label}</a>`;
    })
    .filter(Boolean)
    .join('');
}

function buildMetaMarkup(meta = []) {
  if (!Array.isArray(meta) || meta.length === 0) return '';
  return meta.map((line) => `<p>${line}</p>`).join('');
}

function renderSiteFooter(options = {}) {
  const footer =
    options.target ??
    document.querySelector('[data-site-footer]') ??
    document.querySelector('.site-footer');

  if (!footer) return null;
  if (footer.dataset.footerRendered === 'true') return footer;
  if (!footer.hasAttribute('data-site-footer') && options.forceRender !== true) {
    return footer;
  }

  const preset = resolvePreset(footer, options.preset);
  const rootPrefix = resolveRootPrefix({
    explicitPrefix: options.rootPrefix,
    element: footer,
    fallbackPathname: window.location?.pathname
  });
  const layoutClass = preset.layoutClass || 'footer__layout';

  let headingMarkup = '';
  let bodyMarkup = '';
  let actionsMarkup = '';
  let metaMarkup = '';

  if (preset.useContentBindings) {
    headingMarkup = '<h2 data-content="contact.title"></h2>';
    bodyMarkup = '<p data-content="contact.body"></p>';
    actionsMarkup = '<div class="footer__actions" data-contact-actions></div>';
    metaMarkup = '<p data-content="contact.meta"></p>' + buildMetaMarkup([DEFAULT_META]);
  } else {
    headingMarkup = preset.heading ? `<h2>${preset.heading}</h2>` : '';
    bodyMarkup = preset.body ? `<p>${preset.body}</p>` : '';
    actionsMarkup = `<div class="footer__actions">${buildActionMarkup(preset.actions, rootPrefix)}</div>`;
    metaMarkup = buildMetaMarkup(preset.meta || [DEFAULT_META]);
  }

  const backToTopLabel = preset.backToTopLabel || 'Back to top';

  footer.innerHTML = `
    <div class="container ${layoutClass}">
      <div>
        ${headingMarkup}
        ${bodyMarkup}
        ${actionsMarkup}
      </div>
      <div class="footer__meta">
        ${metaMarkup}
      </div>
    </div>
    <a class="back-to-top" href="#top">${backToTopLabel}</a>
  `.trim();

  footer.classList.add('site-footer');
  footer.dataset.footerRendered = 'true';
  return footer;
}

function updateFooterYear() {
  const yearEl = document.getElementById('year') || document.querySelector('[data-year]');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
}

export { FOOTER_PRESETS, renderSiteFooter, updateFooterYear };
