# Layout Audit (Pre-Refactor Snapshot)

Last updated: 2025-12-15

Note: This document captures the layout/header/footer state at the start of the refactor. For the final standardized architecture, see `docs/layout-standard.md`.

## 1) App entry points + routing model

### Stack
- **Primary site:** static HTML + shared CSS + shared ES modules under `assets/`.
- **Interactive labs:** each lab is a standalone static page under `pages/<lab>/index.html`.
- **Fourier Epicycles:** has a **Vite + React** source project in `pages/fourier-epicycles-src/` that builds into `pages/fourier-epicycles/`.

### Entry points
- Home: `index.html`
- Labs:
  - `pages/circuit-lab/index.html`
  - `pages/transformer-lab/index.html`
  - `pages/ml-playground/index.html`
  - `pages/fourier-epicycles/index.html` (build output)
  - `pages/endless-depths/index.html`
- Fourier source (dev/build): `pages/fourier-epicycles-src/index.html`

### Routing approach
- No framework router at the top level.
- Navigation is via:
  - traditional multi-page navigation (`pages/<lab>/`)
  - hash anchors on the home page (`index.html#about`, etc.)
  - computed relative prefixes for cross-page links (see `computeRootPrefix()`).

### Where “layouts” live today
There is no server-side/shared template system. Layout is composed by:
- HTML placeholders: `#site-header` and `#site-footer`
- A shared initializer (`initSiteShell`) that injects standardized Header/Footer markup into those placeholders
- A shared nav enhancer (`setupNav`) that wires up dropdown + mobile behavior

Key orchestrator:
- `assets/js/layout/siteShell.js`

## 2) Header inventory (current behavior)

### Canonical header renderer
- `assets/js/site-header.js`
  - **Data sources (static config in-module):**
    - `NAV_SECTIONS`: home section links
    - `NAV_LABS`: lab links
    - `LOGO_TEXT`
  - **Core behavior:**
    - Computes a `rootPrefix` (defaults from `computeRootPrefix(window.location.pathname)`, overrideable via `data-nav-root` / options).
    - Supports `useLocalAnchors`:
      - `true`: section links are `#about`, logo goes to `#hero`
      - `false`: section links are `${rootPrefix}index.html#about`, logo goes to `${rootPrefix}index.html#hero`
    - Marks the active lab link with `aria-current="page"` using `currentLab` (explicit) or by path detection.
    - Optionally renders an **Edit mode toggle** button when `showEditToggle` is enabled.
    - Renders a theme toggle button (`.theme-toggle`) (the theme logic is handled elsewhere).
  - **Rendering model:** string template → `target.innerHTML = …`
  - **State/props:** all via options + `data-*` attributes; no external API calls.

### Header interaction/enhancement
- `assets/js/nav.js`
  - Calls `renderSiteHeader()` (safe/no-op if already rendered) and then enhances the `.nav` element.
  - **Dropdown behavior:**
    - On desktops (hover-capable + fine pointer): opens on hover/focus; closes on pointer leave with a small timeout.
    - On touch/coarse pointers: toggles open/close on click.
    - Uses `aria-expanded`, `aria-controls`, `hidden`, and `data-open` for a11y and styling.
    - Global “click outside” + Escape-to-close behavior.
  - **Mobile nav behavior:**
    - `.nav-toggle` toggles `aria-expanded` and `.nav-links[data-visible]`
    - Toggles `body.nav-open`
    - Closes on Escape, link click, and when resizing above the mobile breakpoint.

### Layout/measurement behavior
- `assets/js/layout/siteShell.js`
  - Measures header height and sets CSS vars `--nav-height` and `--header-h` (via `ResizeObserver` when available).
  - This is used by pages such as Circuit Lab which compute their internal viewport height using `--header-h`.

### Additional (currently unused) init scripts (at time of audit)
- `assets/js/site-header-init.js` existed and duplicated header-height observer logic, but was not referenced by any HTML entry point in this repo (removed during refactor).

## 3) Footer inventory (current behavior)

### Canonical footer renderer
- `assets/js/site-footer.js`
  - **Data sources (static config in-module):** `FOOTER_PRESETS`
  - **Presets today:**
    - `home`:
      - Renders “contact” area using `data-content="contact.*"` bindings + a `[data-contact-actions]` placeholder.
      - Always appends a default meta line containing `#year`.
    - `ml-playground`, `transformer-lab`, `endless-depths`:
      - Provide explicit heading/body/actions/meta for each lab.
  - **Back-to-top:** always renders a `.back-to-top` link to `#top`.
  - **Year:** `updateFooterYear()` fills `#year` (or `[data-year]`) with the current year.
  - **Rendering model:** string template → `target.innerHTML = …`

### Footer orchestration
- `assets/js/layout/siteShell.js`
  - Calls `renderSiteFooter({ pageId, rootPrefix })` for most pages.
  - **Exception:** skips the footer entirely for `pageId === 'circuit-lab'`.

### Additional (currently unused) init scripts (at time of audit)
- `assets/js/site-footer-init.js` existed but was not referenced by any HTML entry point in this repo (removed during refactor).

## 4) Page-level layout differences (current evidence)

### Pages using the shared site shell directly
- `index.html`
  - Calls `initSiteShell('home', { showEditToggle: true, useLocalAnchors: true })`.
  - Loads `assets/js/nav.js` and `assets/js/main.js`.
- `pages/transformer-lab/index.html`
  - Calls `initSiteShell('transformer-lab')`.
  - Loads `assets/js/nav.js`.
- `pages/ml-playground/index.html`
  - Calls `initSiteShell('ml-playground')`.
  - Loads `assets/js/nav.js` and `assets/js/main.js`.
- `pages/endless-depths/index.html`
  - Calls `initSiteShell('endless-depths')`.
  - Loads `assets/js/nav.js`.
  - Also includes an **extra inline theme/year script** that duplicates (and potentially conflicts with) `assets/js/layout/theme.js` and `assets/js/site-footer.js` year handling.
- `pages/circuit-lab/index.html`
  - Calls `initSiteShell('circuit-lab')`.
  - Does **not** include a `#site-footer` placeholder (and `siteShell` also skips the footer for this page id).
  - Also calls `initThemeControls({ onChange })` separately to trigger Circuit Lab redraws on theme change.

### Pages not directly using the shared site shell at runtime
- `pages/fourier-epicycles/index.html` (Vite build output)
  - Contains `#site-header` and `#site-footer` placeholders.
  - Does **not** load `assets/js/layout/siteShell.js` or `assets/js/nav.js` explicitly.
  - Instead, the Vite bundle (`pages/fourier-epicycles/assets/index-*.js`) currently **inlines/bundles copies** of:
    - header/footer renderers
    - theme controls
    - nav enhancer logic
  - This is functionally similar but creates **redundant implementations** inside the built output.

## 5) Header/Footer variants table (current state)

| Variant | File path(s) | Where used | Differences / notes |
|---|---|---|---|
| Header (canonical) | `assets/js/site-header.js` | All pages (directly or via `siteShell` + `nav.js`) | Single template source of truth: logo + dropdown menus + theme toggle; supports `useLocalAnchors` and optional edit toggle. |
| Header (bundled copy) | `pages/fourier-epicycles/assets/index-*.js` | `pages/fourier-epicycles/index.html` | Generated by Vite build; duplicates canonical header logic in the output bundle. |
| Footer (canonical) | `assets/js/site-footer.js` | All pages except circuit lab | Preset-driven footer; `home` uses content bindings, other lab presets are explicit. |
| Footer (bundled copy) | `pages/fourier-epicycles/assets/index-*.js` | `pages/fourier-epicycles/index.html` | Generated by Vite build; duplicates canonical footer logic in the output bundle. |

## 6) Exception pages (based on repo evidence)

These are the only exceptions that are explicitly justified by existing code:
- `pages/circuit-lab/index.html`: **no footer** (HTML omits `#site-footer`; `initSiteShell` also skips footer for `pageId === 'circuit-lab'`).
- Footer content variants (explicit presets in `assets/js/site-footer.js`):
  - `pages/ml-playground/index.html` → preset `ml-playground`
  - `pages/transformer-lab/index.html` → preset `transformer-lab`
  - `pages/endless-depths/index.html` → preset `endless-depths`
- Header “Edit mode” toggle is enabled only on `index.html` via `showEditToggle: true`.

## 7) Redundancy + inconsistency hotspots (targets for refactor)

- **Bundled duplicate site shell logic** in `pages/fourier-epicycles/assets/index-*.js` vs canonical modules under `assets/js/`.
- **Theme duplication/conflict** on `pages/endless-depths/index.html` (extra inline handler + different storage key than `assets/js/layout/theme.js`).
- **Theme initialization duplication** on `pages/circuit-lab/index.html` (`initSiteShell` calls theme init, then the page calls `initThemeControls` again for redraw hooks).
- **Unused init modules**: `assets/js/site-header-init.js` and `assets/js/site-footer-init.js` appear unused by any current HTML entry point.
- **Year update duplication**: multiple places write `#year` (e.g., `assets/js/site-footer.js` and `assets/js/main.js`, plus Endless Depths inline script).

## 8) Refactor outcomes (implemented)
- Header/nav config extracted to `assets/js/config/navigation.js`.
- Footer presets extracted to `assets/js/config/footerPresets.js`.
- Footer opt-out allowlist centralized in `assets/js/config/layout.js`.
- Nav initialization standardized by calling `setupNav()` from `assets/js/layout/siteShell.js` (pages no longer need to load `assets/js/nav.js` directly).
- Endless Depths inline theme/year script removed; theme/year now come from the shared site shell modules.
- Fourier Epicycles build no longer bundles Header/Footer/Nav/Theme logic; the React entry initializes the shared site shell at runtime (`pages/fourier-epicycles-src/index.tsx`).
- Removed unused `assets/js/site-header-init.js` and `assets/js/site-footer-init.js`.
