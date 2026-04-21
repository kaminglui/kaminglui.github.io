# Ka-Ming Lui's Playground

Static, interactive site of educational machine-learning and EE labs.
Everything runs client-side — no backend, no build step for the lab pages
(except Fourier, which has a Vite source tree under
`pages/fourier-epicycles-src/` that builds into `pages/fourier-epicycles/`).

Live at <https://kaminglui.github.io/>.

## Labs

Grouped into three tiers by what they build on:

### Tier 1 — Foundations
- **Math Foundations Lab** (`pages/math-lab/`) — GD/SGD/Momentum/Simulated
  Annealing on a 2D landscape with 3D isometric view, method-comparison,
  run-to-convergence + adjustable speed; PCA demo; inline SVG figures for
  argmin/argmax, sup/inf, Lagrange tangency, convex vs non-convex, matrix
  transformations, dot-product geometry, and eigenvectors; universal
  approximation + clustering map.
- **Fourier Epicycles** (`pages/fourier-epicycles/`, source in
  `pages/fourier-epicycles-src/`) — sketch a curve, watch stacked circles
  reconstruct it; DFT, FFT (Cooley-Tukey matrix factorisation), 2D Fourier,
  and the SDE / Brownian-motion bridge.

### Tier 2 — Core Machine Learning
- **Machine Learning Lab** (`pages/classical-ml/`) — supervised + unsupervised in one
  place: linear regression (closed-form OLS with residuals + R²), logistic
  regression (GD on cross-entropy with probability heatmap), SVM (hinge +
  subgradient with margin lines and support vectors), K-means and Gaussian
  Mixture Models via EM (hard/soft toggle with responsibility-blended
  colours). Full MLE derivations, Lagrangian dual for SVM, kernels,
  regularisation, bias-variance.

### Tier 3 — Modern deep learning
- **Reinforcement Learning Lab** (`pages/rl-lab/`) — Gaussian multi-armed bandit (ε-greedy /
  UCB1 / Thompson), value + policy iteration on a 1D chain, Monte Carlo
  darts demo, Bayesian coin with live Beta prior / posterior, nine KaTeX
  theory panels (bandits → MDP → Bellman → DP → MC/TD → on/off-policy +
  importance sampling → policy gradient & actor-critic → same-shape
  callout → method families).
- **Transformer Lab** (`pages/transformer-lab/`) — type a sentence and
  watch the transformer tokenise it, project Q/K/V, compute a live
  attention heatmap, and blend values into context vectors. Every number
  is computed from the input.
- **Diffusion Lab** (`pages/diffusion-lab/`) — 2D particle denoiser.
  Particles sampled from a GMM target get noised to 𝒩(0, I) via a DDPM
  forward schedule, then re-assembled using the *analytic* score of the
  target (closed-form, no trained network). KL divergence, VAE ELBO,
  random walks → Brownian motion → SDE, DDPM, score matching, SDE
  unification (VP / VE / PF-ODE), modern tricks (CFG, DDIM, latent,
  flow matching, consistency).

### Separate track
- **Circuit Lab** (`pages/circuit-lab/`) — in-browser SPICE-style analog
  simulator. Resistors, capacitors, inductors, diodes, LEDs, BJTs,
  MOSFETs, op-amps, function generators, oscilloscopes, potentiometers.
  Dark-mode-only; uses Tailwind + a reactive MNA solver.

## Site infrastructure

- **Shared glossary with cross-lab tooltips**
  (`assets/js/lab-glossary.js` + `assets/js/lab-tooltips.js`). Any element
  with `data-g="key"` triggers a hover / focus popup with the definition,
  a row of related-concept chips, and section jump-buttons into any lab
  (e.g. hovering `MLE` anywhere gives direct links into Machine Learning Lab §2, Diffusion
  §2, and Reinforcement Learning §1).
- **Prereq / Continues-in chips** on every lab so readers know what
  reading to do before and what to read after.
- **Home page** is a hero + three-tier Labs map that summarises the
  dependency graph visually. See `index.html`.
- **Click-only nav dropdowns** (`assets/js/nav.js`) — work reliably on
  every platform (mouse, touch, hybrid).
- **Mobile UX baseline** in `assets/css/style.css` — zoom disabled,
  tap-highlight suppressed, text-selection turned off on interactive
  chrome but left on on readable content.
- **KaTeX** renders math in every theory panel via `data-katex` spans.

## Circuit Lab specifics

- Simulation core lives in `assets/js/sim/engine.js` and is shared with
  the UI (`assets/js/circuitforge.js`). Short architecture note:
  `docs/circuit-lab-architecture.md`.
- Component renderers are split one-per-file in
  `assets/js/circuit-lab/components/` and imported by the Circuit Lab UI
  entry.
- Shared templates live in `assets/js/circuit-lab/templates/` as JS
  modules (e.g. `mixer-karaoke.js`) and are cloned through
  `assets/js/circuit-lab/templateRegistry.js`.
- The simulation entry point flows through
  `assets/js/sim/wasmInterface.js`, which wraps the JS solver today and
  leaves hooks for a future WASM backend. More detail:
  `docs/circuit-lab-simulation-architecture.md`.

## Tests

243 Vitest specs cover the simulation engine, Circuit Lab templates, nav
/ layout / theme helpers, and Fourier services. Run the suite with:

```bash
npm install
npm test
```

Specs live under `assets/js/sim/tests/`, `assets/js/layout/tests/`,
`assets/js/circuit-lab/*.test.js`, and
`pages/fourier-epicycles-src/services/__tests__/`.

## Planned work

`PLAN.md` tracks queued educational content: a distributions tour
(Gaussian / Bernoulli / Binomial / Poisson / …, heavy tails, LLN, CLT,
modes of convergence), Laplace ↔ Fourier, set theory + Minkowski sums,
graph theory, CV fundamentals (coordinates, SIFT, optical flow) leading
to world-model inconsistency detection, plus smaller infra (true
dark-mode toggle, concepts index page, search).

## Third-party libraries

- Tailwind CSS (MIT) — used by Circuit Lab only.
- Font Awesome Free (MIT, SIL OFL 1.1, CC BY 4.0 for icons) — Circuit Lab.
- KaTeX 0.16.11 (MIT) — math rendering on every theory panel.
- Google Fonts: Inter + Fira Code.
- Vitest + jsdom for the test suite.
