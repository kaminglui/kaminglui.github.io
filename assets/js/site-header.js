const NAV_SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'learning', label: 'Learning' },
  { id: 'posts', label: 'Posts' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'contact', label: 'Contact' }
];

const NAV_LABS = [
  { id: 'circuit-lab', label: 'Circuit Lab', href: 'pages/circuit-lab/' },
  { id: 'transformer-lab', label: 'Transformer Lab', href: 'pages/transformer-lab/' },
  { id: 'ml-playground', label: 'ML Playground', href: 'pages/ml-playground/' },
  { id: 'fourier-epicycles', label: 'Fourier Epicycles', href: 'pages/fourier-epicycles/' },
  { id: 'endless-depths', label: 'Endless Depths', href: 'pages/endless-depths/' }
];

const LOGO_TEXT = 'Ka Ming Lui';

function normalizeRootPrefix(prefix) {
  if (!prefix) return '';
  if (prefix === '/') return '/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function computeRootPrefix(pathname = '') {
  const rootAttr =
    document.documentElement?.dataset.navRoot ??
    document.body?.dataset.navRoot ??
    null;

  if (typeof rootAttr === 'string' && rootAttr.trim()) {
    return normalizeRootPrefix(rootAttr.trim());
  }

  const safePath = typeof pathname === 'string' ? pathname : '';
  const cleanPath = safePath.split(/[?#]/)[0].replace(/\\/g, '/');
  const segments = cleanPath.split('/').filter(Boolean);

  if (segments.length && segments[segments.length - 1].includes('.')) {
    segments.pop();
  }

  if (segments.length === 0) return '';

  return '../'.repeat(segments.length);
}

function detectCurrentLabId(pathname = '') {
  const explicit =
    document.body?.dataset.currentLab ??
    document.documentElement?.dataset.currentLab ??
    null;
  if (explicit) return explicit;

  const safePath = typeof pathname === 'string' ? pathname : '';
  const normalized = safePath.toLowerCase().replace(/\\/g, '/');

  const match = NAV_LABS.find((lab) =>
    normalized.includes(`/${lab.id.toLowerCase()}/`)
  );

  return match?.id ?? null;
}

function buildSectionLinks({ rootPrefix, useLocalAnchors }) {
  return NAV_SECTIONS.map(({ id, label }) => {
    const href = useLocalAnchors
      ? `#${id}`
      : `${rootPrefix}index.html#${id}`;
    return `<li><a href="${href}">${label}</a></li>`;
  }).join('');
}

function buildLabLinks({ rootPrefix, currentLabId }) {
  return NAV_LABS.map(({ id, label, href }) => {
    const link = href.startsWith('http')
      ? href
      : `${rootPrefix}${href}`;
    const ariaCurrent = id === currentLabId ? ' aria-current="page"' : '';
    return `<li><a href="${link}"${ariaCurrent}>${label}</a></li>`;
  }).join('');
}

function renderSiteHeader(options = {}) {
  const header =
    options.target ??
    document.querySelector('[data-site-header]') ??
    document.querySelector('.site-header');

  if (!header) return null;

  const hasExistingNav = header.querySelector('.nav');
  const isOptedIn =
    header.hasAttribute('data-site-header') || options.forceRender === true;

  if (!isOptedIn && hasExistingNav) {
    return hasExistingNav;
  }

  if (header.dataset.navRendered === 'true' && hasExistingNav) {
    return hasExistingNav;
  }

  const explicitRoot =
    (typeof options.rootPrefix === 'string' && options.rootPrefix.trim()) ||
    (typeof header?.dataset?.navRoot === 'string' && header.dataset.navRoot.trim());

  const rootPrefix = normalizeRootPrefix(
    explicitRoot ?? computeRootPrefix(window.location?.pathname)
  );
  const useLocalAnchors =
    options.useLocalAnchors ??
    (rootPrefix === '' || header.dataset.useLocalAnchors === 'true');

  const currentLabId =
    options.currentLab ??
    header.dataset.currentLab ??
    detectCurrentLabId(window.location?.pathname);

  const shouldRenderEditToggle =
    options.showEditToggle === true || header.dataset.showEditToggle === 'true';

  const logoHref = useLocalAnchors
    ? '#hero'
    : `${rootPrefix}index.html#hero`;

  const sections = buildSectionLinks({ rootPrefix, useLocalAnchors });
  const labs = buildLabLinks({ rootPrefix, currentLabId });

  const editToggleMarkup = shouldRenderEditToggle
    ? '<button class="edit-toggle" type="button" aria-pressed="false" hidden>Edit mode</button>'
    : '';

  const navMarkup = `
    <div class="container">
      <nav class="nav" aria-label="Primary">
        <a class="logo" href="${logoHref}">${LOGO_TEXT}</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="sr-only">Toggle navigation</span>
        </button>
        <ul class="nav-links" id="primary-navigation" data-visible="false">
          <li class="nav-item nav-item--dropdown">
            <button class="nav-dropdown-toggle nav-pill" type="button" aria-expanded="false" aria-controls="section-menu">
              Sections
              <svg class="nav-dropdown__icon" aria-hidden="true" focusable="false" viewBox="0 0 12 12">
                <path d="M2.47 4.47a.75.75 0 0 1 1.06 0L6 6.94l2.47-2.47a.75.75 0 0 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
            <ul class="nav-dropdown-menu" id="section-menu" hidden>
              ${sections}
            </ul>
          </li>
          <li class="nav-item nav-item--dropdown">
            <button class="nav-dropdown-toggle nav-pill" type="button" aria-expanded="false" aria-controls="labs-menu">
              Labs
              <svg class="nav-dropdown__icon" aria-hidden="true" focusable="false" viewBox="0 0 12 12">
                <path d="M2.47 4.47a.75.75 0 0 1 1.06 0L6 6.94l2.47-2.47a.75.75 0 0 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
            <ul class="nav-dropdown-menu" id="labs-menu" hidden>
              ${labs}
            </ul>
          </li>
        </ul>
        <div class="nav-actions">
          ${editToggleMarkup}
          <button class="theme-toggle" type="button" aria-label="Toggle color theme">
            <span aria-hidden="true">🌙</span>
          </button>
        </div>
      </nav>
    </div>
  `;

  header.innerHTML = navMarkup.trim();
  header.id = header.id || 'top';
  header.classList.add('site-header');
  header.dataset.navRendered = 'true';

  return header.querySelector('.nav');
}

export {
  NAV_LABS,
  NAV_SECTIONS,
  computeRootPrefix,
  renderSiteHeader
};
