# Layout Standard (Post-Refactor)

Last updated: 2025-12-15

## Goal
Provide a single, canonical “site shell” that renders the same Header/Footer by default across the site, with a small and explicit set of exceptions.

## Canonical layout pattern

### HTML contract
Pages that opt into the standard layout provide placeholders:
- Header mount: `<div id="site-header"></div>`
- Footer mount: `<div id="site-footer"></div>` (unless explicitly disabled for the page)

### Single initializer (“MainLayout” equivalent)
`assets/js/layout/siteShell.js` is the canonical entry point.

`initSiteShell(pageId, opts)` does the shared work:
- Renders the standardized header via `assets/js/site-header.js`
- Enhances header navigation interactions via `assets/js/nav.js`
- Initializes theme controls via `assets/js/layout/theme.js`
- Renders the standardized footer via `assets/js/site-footer.js` (unless the page is an explicit no-footer exception)

## Exceptions (explicit allowlist)

Footer opt-out is centralized:
- `assets/js/config/layout.js`
  - `FOOTER_DISABLED_PAGES` (currently: `circuit-lab`)
  - `shouldRenderFooter(pageId)`

Pages with custom footer content use preset overrides:
- `assets/js/config/footerPresets.js`
  - `FOOTER_PRESETS` (e.g. `transformer-lab`, `ml-playground`, `endless-depths`)

## Shared configuration sources

- Header/nav links: `assets/js/config/navigation.js`
  - `NAV_SECTIONS` (home anchors)
  - `NAV_LABS` (lab routes)
  - `LOGO_TEXT`
- Footer presets: `assets/js/config/footerPresets.js`
- Layout exceptions: `assets/js/config/layout.js`

## How pages opt in

### Static pages
Each static page calls the site shell with a page id:
- `index.html` → `initSiteShell('home', { showEditToggle: true, useLocalAnchors: true })`
- `pages/<lab>/index.html` → `initSiteShell('<lab-id>')`

### Vite/React sub-app (Fourier Epicycles)
`pages/fourier-epicycles-src/index.tsx` initializes the site shell at runtime before mounting React.
This keeps header/footer behavior sourced from the shared modules under `assets/js/` while preserving the existing Vite build/deploy workflow.

## Notes on behavior
- No routes/URLs were changed; the site remains a multi-page static site.
- The nav dropdown behavior adapts to pointer capabilities (hover/fine pointer vs touch/coarse pointer) inside `assets/js/nav.js`.

