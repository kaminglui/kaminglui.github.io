import { DEFAULT_META, FOOTER_PRESETS } from './config/footerPresets.js';
import { normalizeRootPrefix, resolveRootPrefix } from './layout/rootPrefix.js';
import { escapeHtml, escapeUrl } from './layout/escape.js';

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
      return `<a class="${classes.join(' ')}" href="${escapeUrl(resolvedHref)}">${escapeHtml(label)}</a>`;
    })
    .filter(Boolean)
    .join('');
}

function buildMetaMarkup(meta = []) {
  if (!Array.isArray(meta) || meta.length === 0) return '';
  return meta.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
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
  const backToTopLabel = preset.backToTopLabel || 'Back to top';

  // Footer has been simplified to a single "Back to top" link. Preset
  // content (contact headings, actions, meta lines) is intentionally
  // dropped — keeps every page's bottom edge uniform and uncluttered.
  footer.innerHTML = `
    <div class="container footer__layout footer__layout--minimal">
      <a class="back-to-top" href="#top">${escapeHtml(backToTopLabel)}</a>
    </div>
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
