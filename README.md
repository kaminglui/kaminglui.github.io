# Ka-Ming Lui's Playground

## Structure

- `pages/` contains standalone interactive experiences grouped by lab:
  - `pages/circuit-lab/`
- `pages/transformer-lab/`
- `pages/ml-playground/`
- `pages/fourier-epicycles/`
- `pages/endless-depths/`
- The Fourier Epicycles source lives in `pages/fourier-epicycles-src/` and builds into `pages/fourier-epicycles/`.
- `assets/` holds shared styles, scripts, and media used across the site and labs.

## Circuit Lab simulation + tests

- Simulation core lives in `assets/js/sim/engine.js` and is shared with the UI (`assets/js/circuitforge.js`). A short architecture note is in `docs/circuit-lab-architecture.md`.
- Visual component renderers are split one-per-file in `assets/js/circuit-lab/components/` and imported by the Circuit Lab UI entry.
- Shared templates live in `assets/js/circuit-lab/templates/` as JS modules (e.g., `mixer-karaoke.js`) and are cloned through `assets/js/circuit-lab/templateRegistry.js` (which also sets `window.CIRCUIT_TEMPLATES`).
- Open the lab via `pages/circuit-lab/index.html` (or `https://<your-gh-pages-root>/pages/circuit-lab/`); everything runs client-side with no backend.
- The simulation entry point now flows through `assets/js/sim/wasmInterface.js`, which wraps the JS solver today and leaves hooks for a future WASM backend. More detail: `docs/circuit-lab-simulation-architecture.md`.
- Automated, headless tests for all Circuit Lab components are under `assets/js/sim/tests/` (`unit/` and `integration/`), all using `assets/js/sim/tests/testHarness.js`.
- Run the suite with:

  ```bash
  npm install
  npm test
  ```

## Third-party libraries

This project uses:

- Tailwind CSS (MIT License)
- Font Awesome Free (MIT, SIL OFL 1.1, and CC BY 4.0 for icons)
