# Contributing

## Prerequisites

- Node 20+
- A Chromium-based browser installed somewhere the Fourier e2e script can find it (Chrome, Edge, Brave) — only needed if you run the Fourier end-to-end tests.

## Setup

```bash
npm install
npm install --prefix pages/fourier-epicycles-src   # only if you'll touch the Fourier app
```

## Running things locally

| What | How |
|---|---|
| View the home page | Open `index.html` in a browser, or run any static file server (`npx serve .`) |
| Rebuild the Tailwind bundle | `npm run build:css` (or `npm run build:css:watch`) |
| Rebuild the Fourier app | `npm run build --prefix pages/fourier-epicycles-src` |
| Preview the home edit toolbar | Append `?edit=1` to the URL |

## Tests

```bash
npm test                    # Vitest: layout + circuit-lab + sim suites
npm --prefix pages/fourier-epicycles-src test   # Fourier unit tests
npm run test:e2e            # Fourier puppeteer run (needs Chrome/Edge installed)
npm run test:fourier        # Fourier unit + build + e2e in sequence
```

CI runs `npm test` on every push and PR to `main`; failing tests block the deploy.

## Editing site content

Site copy — hero, about, posts, projects, sidebar, timeline — lives in [assets/js/content.js](assets/js/content.js). The in-browser edit toolbar (enabled with `?edit=1`) writes only to the current browser's `localStorage`; it's a preview helper, not a CMS. To publish a change, edit `content.js` directly.

## Adding a new lab / page

1. Create `pages/<your-lab>/index.html`.
2. Mount the shared shell by including:

   ```html
   <div id="site-header"></div>
   <main>...</main>
   <div id="site-footer"></div>
   <script type="module">
     import { initMainLayout } from '../../assets/js/layout/mainLayout.js';
     initMainLayout('<your-lab>');
   </script>
   ```

3. Add your lab to [assets/js/config/navigation.js](assets/js/config/navigation.js) so it shows up in the nav.
4. If you need a custom footer, add a preset to [assets/js/config/footerPresets.js](assets/js/config/footerPresets.js) and reference it by `pageId`.
5. If the lab needs Tailwind, it's already picked up — the Tailwind scan globs cover `pages/**/*.html`.

## Code style

- ES modules throughout. No bundler at the root — browsers load `.js` files directly.
- Pure helpers go in the smallest module that needs them (e.g. Circuit Lab math lives in `assets/js/circuit-lab/`, not in `circuitforge.js`).
- Any template literal that interpolates into HTML must pass strings through `escapeHtml` / `escapeUrl` from [assets/js/layout/escape.js](assets/js/layout/escape.js).
- Pass secrets / API keys only through Vite `define` or `import.meta.env` in the Fourier app; never commit them.

## Deploying

Pushing to `main` triggers [`.github/workflows/static.yml`](.github/workflows/static.yml), which installs deps, builds the Fourier app, builds Tailwind, stages the site with `rsync` (excluding `.github`, `docs`, `scripts`, `pages/fourier-epicycles-src`, tests, and package manifests), and publishes the artifact to GitHub Pages.

If the deploy ever fails, the most common causes are:
- Fourier build broke (run `npm run build --prefix pages/fourier-epicycles-src` locally and fix)
- Tailwind build broke (run `npm run build:css` locally)
- A test failed on the CI-side `npm test` that passed locally because dev deps weren't in sync — re-run `npm ci` locally to match
