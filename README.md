# Ka-Ming Lui's Playground

## Structure

- `pages/` contains standalone interactive experiences grouped by lab:
  - `pages/circuit-lab/`
- `pages/transformer-lab/`
- `pages/ml-playground/`
- `pages/endless-depths/`
- `assets/` holds shared styles, scripts, and media used across the site and labs.

## Circuit Lab simulation + tests

- Simulation core lives in `assets/js/sim/engine.js` and is shared with the UI (`assets/js/circuitforge.js`). A short architecture note is in `docs/circuit-lab-architecture.md`.
- Automated, headless tests for all Circuit Lab components are under `pages/circuit-lab/tests/`.
- Run the suite with:

  ```bash
  npm install
  npm test
  ```

## Third-party libraries

This project uses:

- Tailwind CSS (MIT License)
- Font Awesome Free (MIT, SIL OFL 1.1, and CC BY 4.0 for icons)
