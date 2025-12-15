# Testing

## What’s in the test suite

### Unit tests (Vitest)
- Root test runner: `vitest` (invoked via `npm test`)
- Coverage includes:
  - Circuit Lab simulation tests under `assets/js/sim/tests/`
  - Site shell/layout tests under `assets/js/layout/tests/` (JSDOM environment)

### Integration/E2E (Puppeteer)
- Fourier Epicycles headless checks: `scripts/e2e-fourier.mjs`
  - Validates the built lab (`pages/fourier-epicycles/`) including header mobile menu behavior, toolbars, KaTeX rendering, and fullscreen/pseudo-fullscreen flows.

## How to run

### Repo-level (recommended)
- Install: `npm install`
- Unit tests: `npm test`
- Fourier end-to-end (requires Chrome/Edge):
  - `npm run test:e2e` (E2E only)
  - `npm run test:fourier` (Fourier unit tests + build + E2E)

### Chrome/Edge requirement for E2E
`puppeteer-core` needs a local browser binary. The E2E script auto-detects common Windows installs, or you can set:
- `CHROME_PATH=<path to chrome.exe or msedge.exe>`

## Test strategy notes
- Layout tests validate the **contract** of the shared site shell:
  - header/footer render
  - Circuit Lab is an explicit **no-footer** exception
  - nav interactions work in touch-mode (click-to-toggle) and remain keyboard closable (Escape)
- Fourier E2E intentionally runs against the built output under `pages/fourier-epicycles/` to catch regressions in the deployable artifact.

