# Layout Audit (Current State)

Last updated: 2025-12-15

This captures how headers, footers, and layout wiring work **before** the standardization refactor. For the target state, see `docs/layout-standard.md`.

## 1) Entry points and routing
- **Stack:** static HTML pages sharing CSS/ES modules in `assets/`; one Vite + React sub-app in `pages/fourier-epicycles-src/` that builds to `pages/fourier-epicycles/`.
- **Entry HTML:** `index.html`, `pages/circuit-lab/index.html`, `pages/transformer-lab/index.html`, `pages/ml-playground/index.html`, `pages/fourier-epicycles/index.html` (build). The Vite source app also has its own `index.html` for dev builds.
- **Routing:** traditional multi-page navigation plus home-page hash anchors. `computeRootPrefix()` derives relative prefixes so links work from nested `/pages/*` locations. No client router.
- **Layout orchestrator:** `assets/js/layout/siteShell.js` (exposed via `assets/js/layout/mainLayout.js`) mounts header/footer, initializes nav behavior, theme controls, and sets `--nav-height` / `--header-h` for pages that measure header height (e.g., Circuit Lab).

## 2) Header inventory
- **Renderer:** `assets/js/site-header.js`
  - Data from `assets/js/config/navigation.js` (`LOGO_TEXT`, `NAV_SECTIONS`, `NAV_LABS`).
  - Computes `rootPrefix` (attribute override or from `window.location`), supports `useLocalAnchors` for home hashes, detects active lab from `currentLab`/path, optional edit toggle, always renders theme toggle.
  - Renders markup into the target placeholder and marks it with `[data-site-header]`.
- **Interactions:** `assets/js/nav.js`
  - Enhances dropdowns (hover on fine pointers, click on touch/coarse), sets `aria-expanded`/`hidden` and `data-open`, closes on outside click/Escape/resize.
  - Mobile menu toggles `aria-expanded`, `data-visible`, and `body.nav-open`; Escape/link click/desktop resize close it.
  - Safe to call multiple times; guards with `navReady`.
- **Measurement:** `assets/js/layout/siteShell.js` observes header height to update CSS vars used by other layouts (notably Circuit Lab).

## 3) Footer inventory
- **Renderer:** `assets/js/site-footer.js`
  - Data from `assets/js/config/footerPresets.js` (`FOOTER_PRESETS`, `DEFAULT_META`); presets for `home`, `ml-playground`, `transformer-lab`.
  - Resolves `rootPrefix` similarly to the header; builds preset actions (absolute/mail/hash respected), meta lines, and back-to-top link.
  - `updateFooterYear()` fills `#year`/`[data-year]`.
- **Orchestration:** `assets/js/layout/siteShell.js` calls footer renderer unless `shouldRenderFooter(pageId)` is false.

## 4) Page-level layout usage
- `index.html`: calls `initMainLayout('home', { showEditToggle: true, useLocalAnchors: true })`; uses shared header/footer plus edit toolbar bindings.
- `pages/transformer-lab/index.html`: calls `initMainLayout('transformer-lab')`; uses transformer footer preset.
- `pages/ml-playground/index.html`: calls `initMainLayout('ml-playground')`; uses ml-playground footer preset.
- `pages/circuit-lab/index.html`: calls `initMainLayout('circuit-lab')`; **no `#site-footer` placeholder** and `shouldRenderFooter` opts out; adds an extra `initThemeControls` call to refresh canvas visuals on theme change.
- `pages/fourier-epicycles/index.html`: built Vite output; contains `#site-header`/`#site-footer` and the bundle dynamically imports `assets/js/layout/siteShell.js` before mounting React, so it still uses the shared shell.
- `pages/fourier-epicycles-src/index.html`: dev entry for the React app; also imports `initMainLayout('fourier-epicycles')` at startup.

## 5) Header/Footer variants

| Component | File path(s) | Where used | Differences / notes |
|---|---|---|---|
| Header (canonical) | `assets/js/site-header.js` | All pages via `initMainLayout`/`initSiteShell` (including Vite bundle import) | Single template; optional edit toggle and anchor-mode option. |
| Footer (canonical with presets) | `assets/js/site-footer.js` + `assets/js/config/footerPresets.js` | All pages except Circuit Lab | Presets swap heading/body/actions/meta; back-to-top link always present. |

## 6) Exceptions (currently justified)
- Footer disabled for `circuit-lab` (HTML omits placeholder; `FOOTER_DISABLED_PAGES` in `assets/js/config/layout.js` contains `'circuit-lab'`).
- Footer preset variants for `ml-playground`, `transformer-lab`; default `home` preset elsewhere.
- Header edit toggle only on the home page (`showEditToggle: true` option).

## 7) Redundancy / inconsistency hotspots
- Nav enhancement runs both from `nav.js` auto-init and from `initMainLayout()` (guarded, but two call sites to maintain).
- Circuit Lab triggers `initThemeControls` twice (shell + page-specific hook) to refresh its canvas—behaviorally correct but a maintenance duplication.
- CSS/JS module locations for layout pieces are split between `assets/js/` and `assets/js/layout/`, making the “site shell” surface area slightly scattered.
