import { computeRootPrefix } from './site-header.js';

const DEFAULT_META =
  '&copy; <span id="year"></span> Ka Ming Lui. Built with accessibility and performance in mind.';

const FOOTER_PRESETS = {
  home: {
    id: 'home',
    layoutClass: 'footer__layout',
    useContentBindings: true,
    backToTopLabel: 'Back to top'
  },
  'ml-playground': {
    layoutClass: 'footer__layout',
    heading: 'Want to explore more ML demos?',
    body: 'Try the transformer lab or reach out to share your favorite visualization ideas.',
    actions: [
      { label: 'Visit Transformer Lab', href: 'pages/transformer-lab/', variant: 'primary' },
      { label: 'Email Ka-Ming', href: 'mailto:contact@kaminglui.com', variant: 'ghost' }
    ],
    meta: [
      'Curious how this playground works? Inspect the source on GitHub to tweak the algorithm.',
      DEFAULT_META
    ]
  },
  'transformer-lab': {
    layoutClass: 'footer__layout',
    heading: 'Ready for more machine learning stories?',
    body:
      'Head back to the main site to explore projects, journal entries, and the learning roadmap behind this transformer lab.',
    actions: [
      { label: 'View projects', href: 'index.html#projects', variant: 'primary' },
      { label: 'Get in touch', href: 'index.html#contact', variant: 'ghost' }
    ],
    meta: [
      'Enjoyed the walkthrough? Share it with fellow ML explorers.',
      DEFAULT_META
    ]
  },
  'endless-depths': {
    layoutClass: 'footer__layout',
    heading: 'Back to the main site?',
    body: 'Check out projects, posts, and the ML roadmap that inspired this mini-game.',
    actions: [
      { label: 'View projects', href: 'index.html#projects', variant: 'primary' },
      { label: 'Get in touch', href: 'index.html#contact', variant: 'ghost' }
    ],
    meta: [
      'Progress saves to your browser so you can pick up where you left off.',
      '&copy; <span id="year"></span> Ka Ming Lui. Built for performance and accessibility.'
    ]
  }
};

function normalizeRootPrefix(prefix) {
  if (!prefix) return '';
  if (prefix === '/') return '/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function resolveRootPrefix(footer, explicitPrefix) {
  if (typeof explicitPrefix === 'string' && explicitPrefix.trim()) {
    return normalizeRootPrefix(explicitPrefix.trim());
  }

  const attr = footer?.dataset?.footerRoot || footer?.dataset?.navRoot;
  if (typeof attr === 'string' && attr.trim()) {
    return normalizeRootPrefix(attr.trim());
  }

  return normalizeRootPrefix(computeRootPrefix(window.location?.pathname));
}

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
  const rootPrefix = resolveRootPrefix(footer, options.rootPrefix);
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
