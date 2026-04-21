# Architecture

This is a static site hosted on GitHub Pages. No backend, no server-side rendering — every page ships HTML + CSS + ES modules that run in the browser.

## Top-level layout

```
index.html                 — home page
404.html                   — site-wide not-found page
pages/                     — each subdirectory is one "lab" (interactive demo)
  circuit-lab/
  fourier-epicycles/       — built output (gitignored; rebuilt in CI)
  fourier-epicycles-src/   — React + Vite source for the above
  ml-playground/
  transformer-lab/
assets/
  css/
    style.css              — hand-written stylesheet
    tailwind.css           — built from tailwind.src.css (gitignored)
    tailwind.src.css       — @tailwind directives
  js/
    main.js                — home-page interactions + in-browser content editor
    content.js             — default site content (copy, links, timeline entries)
    transformer-lab.js     — transformer-lab UI
    ml-playground.js       — ml-playground UI
    circuitforge.js        — circuit-lab UI entry
    site-header.js         — renders the shared nav into #site-header
    site-footer.js         — renders the shared footer into #site-footer
    nav.js                 — dropdown + mobile nav behavior
    config/                — navigation, footer presets, layout rules
    layout/                — initMainLayout + shared shell helpers
    circuit-lab/           — Circuit Lab modules (see below)
    sim/                   — circuit simulation engine + tests
scripts/                   — Node scripts (e.g. e2e-fourier.mjs)
docs/                      — architecture + testing notes
.github/workflows/         — CI: static.yml (deploy), test.yml (Vitest)
tailwind.config.js
vitest.config.js
```

## Shared site shell

Every HTML page mounts the same header + footer by calling `initMainLayout(pageId, opts)` from [assets/js/layout/mainLayout.js](assets/js/layout/mainLayout.js). That aggregator pulls in [siteShell.js](assets/js/layout/siteShell.js), which:

1. Reads the page id and computes a `rootPrefix` (how deep the page is below the site root) via [rootPrefix.js](assets/js/layout/rootPrefix.js).
2. Calls [site-header.js](assets/js/site-header.js) to render the nav into `#site-header`.
3. Calls [nav.js](assets/js/nav.js) to wire up dropdown + mobile behavior.
4. Calls [theme.js](assets/js/layout/theme.js) for the light/dark toggle.
5. Calls [site-footer.js](assets/js/site-footer.js) to render the footer into `#site-footer`, unless the page is in the opt-out list in [config/layout.js](assets/js/config/layout.js).

Nav items and footer presets live in [config/navigation.js](assets/js/config/navigation.js) and [config/footerPresets.js](assets/js/config/footerPresets.js). Adding a new page means adding one entry there.

All template-literal interpolations in the layout renderers go through `escapeHtml` / `escapeUrl` in [layout/escape.js](assets/js/layout/escape.js).

## Home page (main.js)

[assets/js/main.js](assets/js/main.js) owns the home page:

- Hydrates site content from `localStorage` (falling back to [content.js](assets/js/content.js) defaults); the merge step filters `__proto__` / `prototype` / `constructor` to avoid prototype pollution.
- Renders hero, about, learning, posts, projects, sidebar, experience, education.
- Provides an in-browser preview editor hidden behind `?edit=1`. Two helpers, `bindSimpleEditor` and `bindCollectionEditor`, wire every `<dialog>` form; editors live in a single `editors` map keyed by id (`intro`, `about`, `learning`, `posts`, `projects`, `sidebar`).

Edits save only to the current browser's `localStorage` — nothing is written back to the repo. The real edit workflow is committing to [content.js](assets/js/content.js).

## Circuit Lab

The complexity hotspot. [assets/js/circuitforge.js](assets/js/circuitforge.js) is the UI entry; it uses smaller purpose-named siblings:

| Module | What's in it |
|---|---|
| [circuit-lab/config.js](assets/js/circuit-lab/config.js) | UI / sim constants (grid, time step, colors, timings) |
| [circuit-lab/geometry.js](assets/js/circuit-lab/geometry.js) | Pure wire routing primitives (`snapToBoardPoint`, `mergeCollinear`, `ensureOrthogonalPath`, `routeManhattan`, `adjustWireAnchors`, `distToSegment`) |
| [circuit-lab/scopeLayout.js](assets/js/circuit-lab/scopeLayout.js) | Oscilloscope layout + `computeScopeChannelStats`, `sampleChannelAt` |
| [circuit-lab/units.js](assets/js/circuit-lab/units.js) | SI parse/format + resistor color bands |
| [circuit-lab/persistence.js](assets/js/circuit-lab/persistence.js) | Save payload builder, schema validator, file I/O helpers |
| [circuit-lab/wiring.js](assets/js/circuit-lab/wiring.js) | `createWiringApi`: wire state ops (snapshots, routing with occupancy, junction split). Depends on `getPinDirection` injected by circuitforge |
| [circuit-lab/components/](assets/js/circuit-lab/components/) | One factory per device (resistor, capacitor, MOSFET, op-amp, function generator, oscilloscope, …). Each exports a `createXxx({deps})` factory so components don't directly import UI code |
| [circuit-lab/templateRegistry.js](assets/js/circuit-lab/templateRegistry.js) | Loads + caches canned circuits from [circuit-lab/templates/](assets/js/circuit-lab/templates/) |

Simulation core lives one folder up in [assets/js/sim/](assets/js/sim/): [engine.js](assets/js/sim/engine.js) is the MNA solver; [wasmInterface.js](assets/js/sim/wasmInterface.js) is a thin wrapper that keeps space for a future WASM backend. Tests are in [assets/js/sim/tests/](assets/js/sim/tests/).

## Fourier Epicycles

A separate React + TypeScript + Vite app at [pages/fourier-epicycles-src/](pages/fourier-epicycles-src/) with its own `package.json`, `vite.config.ts`, `vitest.config.ts`.

It builds into `pages/fourier-epicycles/` (gitignored). CI runs the build on every push; locally, run `npm install && npm run build` inside `pages/fourier-epicycles-src/`.

## Tailwind

Circuit Lab, Fourier, and a few root pages use Tailwind utility classes. A single CSS bundle is produced from [assets/css/tailwind.src.css](assets/css/tailwind.src.css) by `tailwindcss` (config in [tailwind.config.js](tailwind.config.js), scan patterns include HTML plus Fourier `.tsx` sources). Output lands in `assets/css/tailwind.css` (gitignored). Run `npm run build:css` locally; CI runs it on every deploy.

## Tests

Vitest + jsdom, configured in [vitest.config.js](vitest.config.js). Tests mirror the source tree (`assets/js/**/*.test.js`). The Fourier app has its own Vitest config.

Two CI workflows:

- [`test.yml`](.github/workflows/test.yml) — runs `npm ci && npm test` on every push/PR to `main`.
- [`static.yml`](.github/workflows/static.yml) — installs deps, builds Fourier, builds Tailwind, stages the site (excluding sources/tests/configs), deploys to GitHub Pages.

## Deploy

`static.yml` runs on push to `main` and on manual dispatch. Pages serves the `_site/` artifact the workflow uploads. Nothing is served directly from the repo — if a file is excluded in the staging rsync, it won't appear on the live site.
