# Testing

Last updated: 2025-12-15

## Tooling
- **Unit/integration:** [Vitest](https://vitest.dev/) with the `jsdom` environment (`vitest.config.js` includes all tests under `assets/js/**/*.test.js`).
- **Headless browser/E2E (Fourier lab):** `scripts/e2e-fourier.mjs` (driven via Puppeteer) invoked by `npm run test:e2e` or `npm run test:fourier`.

## Commands
- Root layout + shared JS tests: `npm test`
- Watch mode: `npm run test:watch`
- Fourier Epicycles sub-app tests (from repo root): `npm --prefix pages/fourier-epicycles-src test`
- Full Fourier pipeline (sub-app tests + build + e2e): `npm run test:fourier`

## Coverage focus (current suite)
- Header/Footer rendering via `initMainLayout` across home/lab/exception pages.
- Navigation responsiveness: mobile toggle, dropdown toggles, keyboard access (ArrowDown focus, Escape close).
- Root prefix utilities to keep cross-page links correct from nested `/pages/*` routes.
- Footer presets, back-to-top link, and footer opt-out allowlist behavior.

## Notes
- Tests rely on jsdom; avoid accessing `window`/`document` outside guarded contexts in modules to preserve SSR-safety.
- Module state (e.g., nav initialization flags) is reset between tests via `vi.resetModules()` in the suite helpers.
