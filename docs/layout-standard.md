# Layout Standard (Post-Refactor)

Last updated: 2025-12-15

## Goal
Provide a single, canonical site shell so every page shares the same Header/Footer by default, with a small, explicit list of opt-outs/variants.

## Canonical layout pattern

### HTML contract
Pages opting into the shared shell render placeholders:
- Header mount: `<div id="site-header"></div>`
- Footer mount: `<div id="site-footer"></div>` (omit only for approved exceptions)

### Single initializer
Use `assets/js/layout/mainLayout.js`, which exposes `initMainLayout` (alias of `initSiteShell` in `assets/js/layout/siteShell.js`).

`initMainLayout(pageId, opts)` does the shared work:
- Renders the header via `assets/js/site-header.js`
- Enhances nav interactions via `assets/js/nav.js`
- Initializes theme controls via `assets/js/layout/theme.js`
- Renders the footer via `assets/js/site-footer.js` when `shouldRenderFooter(pageId)` returns true
- Computes root prefixes with `assets/js/layout/rootPrefix.js` to keep cross-page links correct

## Exceptions (explicit allowlist)

Footer opt-out is centralized:
- `assets/js/config/layout.js`
  - `FOOTER_DISABLED_PAGES` (currently: `circuit-lab`)
  - `shouldRenderFooter(pageId)`

Footer variants are preset-driven:
- `assets/js/config/footerPresets.js` (`FOOTER_PRESETS` for `transformer-lab`, `ml-playground`, and the `home` default)

## Shared configuration sources
- Header/nav links: `assets/js/config/navigation.js` (`NAV_SECTIONS`, `NAV_LABS`, `LOGO_TEXT`)
- Footer presets: `assets/js/config/footerPresets.js`
- Layout exceptions: `assets/js/config/layout.js`
- Root prefix helpers: `assets/js/layout/rootPrefix.js`

## How pages opt in

### Static pages
Call the shared initializer with the page id:
- `index.html` → `initMainLayout('home', { showEditToggle: true, useLocalAnchors: true })`
- `pages/<lab>/index.html` → `initMainLayout('<lab-id>')`

### Vite/React sub-app (Fourier Epicycles)
`pages/fourier-epicycles-src/index.tsx` dynamically imports `initMainLayout('fourier-epicycles')` before mounting React so the React build reuses the shared shell.

## Notes on behavior
- The site remains a multi-page static site; no routes were changed.
- Nav dropdowns adapt to pointer capabilities (hover/fine vs. touch/coarse) inside `assets/js/nav.js`.
- Header height is observed to set `--nav-height` / `--header-h`, which downstream layouts (e.g., Circuit Lab) rely on for viewport sizing.
