# Plan — queued educational content

Running list of labs / sections / demos to add, grouped by domain.
Items move out of here and into a commit when they ship.

## Math Foundations Lab — extensions

### More visuals (ongoing)
Every math concept should ship with at least one illustrative figure.
Already has visuals: argmin vs min, sup/inf on the real line, Lagrange
tangency, convex / two-wells / plateau landscapes, matrix as
transformation, dot product projection, eigenvectors under a matrix,
six-distribution PMF/PDF grid, distribution family tree, three-panel
CLT tightening.
Still to add: convolution as a sliding kernel, SVD as rotate-scale-
rotate, ReLU piecewise approximation of a curve (ties to §6), Gaussian
PDF with live μ/σ sliders, heatmap of a 2D joint distribution vs its
marginals, error-vs-iteration curve at three convexity regimes (pairs
with the convexity-rates subsection).

### Probability & statistics deep-dive
Phase 1 shipped as §7 (common distributions, family tree, LLN + CLT,
heavy-tail caveat). Remaining:
- **Interactive PDF/PMF visualiser** — pick a family, slide its parameters, overlay the
  density against samples (upgrade the current static figures).
- **Beta distribution** — shipped in §7 Probability. Seventh entry in the "usual
  cast" grid (Beta(2, 5) right-skewed shape) plus a new "Conjugate priors — the
  Bayesian coin flip" subsection with the derivation, Laplace's rule of succession,
  and a live interactive where the user slides prior (α₀, β₀) and logs heads/tails;
  prior + posterior PDFs redraw, posterior parameters and mean / SD update live.
  Pure math in `assets/js/math-lab/beta.js` (Lanczos log-Γ → numerically stable PDF
  for large pseudocounts) with 16 unit tests covering PDF shape properties,
  moment formulas, and the conjugate posterior arithmetic.
- **Gamma distribution** — shipped in §7 after the heavy-tail caveat as "Gamma —
  sums of exponentials, CLT in one picture". Three-polyline overlay figure for
  k = 1, 3, 10 at fixed rate, showing the right-skew melting into a bell as k
  grows (concrete witness for the CLT claim above). Prose names Gamma(1, θ) =
  Exp(θ) and Gamma(k, θ) → 𝒩(kθ, kθ²). Simple example: "wait until the third
  ad click at λ = 0.5/sec is Gamma(3, 2), expected value 6 s".
- **Dirichlet distribution** — shipped in §7 as "Multivariate — the Dirichlet on a
  3-sided die". Live canvas heatmap of the posterior Dir(α) on the 2-simplex (triangle
  with A/B/C corners), symmetric-prior α₀ slider, +1 buttons per outcome, reset, full
  stat readout (counts, α, posterior mean per component). Rendered native 300×260 via
  `putImageData` using log-PDF with max-normalisation for display dynamic range.
  Red dot on the simplex tracks the posterior mean. Pure math in
  `assets/js/math-lab/dirichlet.js` reuses the Lanczos `logGamma` from `beta.js`.
  10 unit tests covering normaliser symmetry, Dir(1,1,1) uniform density,
  permutation invariance, Monte Carlo integration to 1, mean formula, and the
  conjugate posterior arithmetic.
- **Defer-list** — Student-t, Cauchy (as the CLT counter-example already named in
  §7's heavy-tail caveat), Log-normal, Chi-squared. Useful but nothing else on the
  site currently refers to them, so not priority.
- **Modes of convergence** — in distribution / in probability / almost surely / in L²;
  which implies which, with a worked non-example for each direction.
- **Convergence/divergence tests** — Borel-Cantelli, dominated/monotone convergence,
  when an infinite series of random variables converges.
- **Estimation theory** — bias, variance, MSE, Fisher information, Cramér-Rao bound.
  Machine Learning Lab says "MLE is the best estimator" but never quantifies *best*.
- **Sampling / MCMC** — Metropolis-Hastings, Gibbs, HMC, Langevin dynamics. Langevin in
  particular *is* the score-based-diffusion sampler — the diffusion lab uses it without
  naming the MCMC pedigree.
- **Stochastic processes** — Markov chains (discrete time), Poisson process, Brownian
  motion, basic ergodicity, stationary distributions. Ties to the existing Bellman
  iteration (contraction) and diffusion Lab's Brownian motion.

### Information theory
Shipped as §8 (binary-entropy curve, interactive two-Gaussian KL visualiser with live
KL / H / overlap readouts, stacked-bar cross-entropy = H(p) + KL, mutual information)
and §9 (mode-covering vs mode-seeking: forward-KL moment-match fit side-by-side with
reverse-KL gradient descent on a bimodal target; three local minima visible by
initialising at different μ₀). Remaining:
- **Richer targets** — let the user add a third mode or pick a skewed target to show
  reverse-KL's mode-seeking failure more dramatically.
- **Symmetric-vs-asymmetric KL side-by-side number race** — a single diagram plotting
  KL(p‖q) and KL(q‖p) as q slides through parameter space, to make the asymmetry
  quantitative rather than just "they differ".

### Convexity & convergence rates
- **Why GD actually works.** The GD/SGD demo runs but never states *why* GD on a convex
  function reaches the minimum, or how fast. Cover O(1/k) for convex, O(1/k²) for Nesterov,
  linear for strongly-convex, pairs with the error-vs-iteration figure queued under
  "More visuals".

### Numerical stability
- **Floating-point, log-sum-exp, why softmax subtracts the max, why we store log-probs.**
  One short article would unblock every "why does my loss go NaN" question and feeds the
  Transformer Lab (softmax denominator) and Diffusion Lab (noise-schedule precision).

### Causality vs correlation
- One short page on do-calculus, confounders, why Machine Learning is prediction not causation. Short
  but frequently asked.

### Transforms
- **Laplace transform** — relationship to Fourier (Fourier = Laplace on the imaginary
  axis; Laplace converges for signals Fourier doesn't). Use cases: ODE solving, control
  theory, stability analysis. Region of convergence.
- **Z-transform** — discrete analogue, used in signal processing.

### Set theory & algebra
- Basic axioms, union/intersection/complement, cardinality, countability (ℕ vs ℝ).
- Ordered vs unordered, power set, Cartesian product.
- **Minkowski sum/difference of sets** — used in image processing morphology, motion
  planning, computational geometry.
- Groups, rings, fields at a surface level (what "closure under addition" means, why
  fields give us linear algebra).

### Graph theory
- Vertices, edges, directed vs undirected, weighted.
- Adjacency matrix / list.
- Shortest path (Dijkstra, Bellman-Ford), spanning trees, topological sort.
- Centrality measures (degree, betweenness, eigenvector).
- Connection to Reinforcement Learning (MDP transition graph), neural nets (computation graph),
  transformers (attention as graph).

### PCA demo upgrades
- **Scree plot + reconstruction framing** — shipped. Added an inline SVG scree bar
  chart to the PCA sidebar that tracks λ₁ / λ₂ live, renamed the projection button
  to "Reconstruct with k = 1" to make the dimensionality-reduction story explicit,
  and updated the hint paragraph to call out that the purple bar is the fraction of
  variance lost when you drop PC2.

## Computer vision mini-lab

- **Coordinate systems** — image coordinates, camera coordinates, world coordinates,
  homogeneous coordinates, how OpenCV and graphics APIs differ.
- **Classical features** — Harris corner detector, SIFT, ORB. Scale-space construction,
  keypoint descriptors, matching by nearest neighbour.
- **Morphological operations** — erosion, dilation, opening, closing, **skeletonisation**.
  Connect to Minkowski sums in set theory.
- **Optical flow** — Lucas-Kanade, Horn-Schunck. How an algorithm "tracks" a point
  between two frames by finding the warp that minimises intensity difference.
- **SLAM basics** — feature matching across frames, pose estimation, bundle adjustment
  at a conceptual level.
- **World-model lead-in** — how a generative model predicts the next frame, and uses
  the discrepancy between prediction and observation as a supervision signal (= KL /
  prediction error); ties to diffusion, transformers, and Reinforcement Learning reward shaping.

## Math Lab — GD/SGD demo further work

- **True 3D WebGL surface view** — three.js landscape the user can rotate with mouse
  and see the trajectory carved into. The current pseudo-3D is isometric canvas only.
- **Learnable step-size schedules** — adaptive learning rate (Adam parameters β₁, β₂,
  ε), cosine schedule, warmup. Show why Adam often dominates in deep nets.
- **Trust-region methods** — Newton with line search, L-BFGS visualised as contours.
- **Batch-size vs noise trade-off** — if we simulate mini-batches, show how batch size
  inversely scales SGD noise.

## Reinforcement Learning Lab — extensions

- **Monte Carlo Tree Search (MCTS).** Shipped as Reinforcement Learning Lab §8 "Monte Carlo Tree
  Search — planning with a model", between §7 Policy gradients and §9 Same-shape.
  Prose covers the four-stage loop (select/expand/rollout/backup), UCT with the
  c·√(ln N / n) exploration term, and AlphaZero's PUCT variant. Two SVG figures:
  a labelled four-stage loop diagram with coloured stage boxes and a return
  arrow, and an annotated mid-search tree (root + 2 actions + 4 grandchildren)
  with N/Q per node showing how visits concentrate on the higher-Q subtree.
  Remaining: interactive MCTS-on-1D-chain demo so readers can compare MCTS's
  convergence to value iteration on the chain they already saw, plus a
  value-vs-simulation-count sweep across c values. Those are their own follow-up.
- **Bayesian coin-flip interactive** — shipped earlier in RL Lab §1 theory panel
  (prior + likelihood + posterior over bias p with Beta-Bernoulli updating).
- **Thompson sampling interactive** — shipped in RL Lab §1 theory panel as a new
  three-arm Beta-Bernoulli demo. Three arm tiles each render their live
  Beta(α, β) posterior PDF with a ground-truth dashed line and the last Thompson
  sample as a red dot; controls for true p per arm, Step / Run 50 / Run 500 /
  Reset / Hide true p; live counts, reward, regret vs best arm, and % pulls on
  the best arm. Uses the new Marsaglia–Tsang Gamma sampler in `beta.js`
  (`sampleGamma`, `sampleBeta`) with 5 additional unit tests.

## Fourier Lab — 2D extension

- **2D DFT figure** — shipped. Four-panel composite inside the "Higher dimensions · 2D
  FFT" article: 16×16 filled-disc original, log-magnitude spectrum (DC-centred),
  reconstruction from the top-5 magnitudes, reconstruction from the top-20. Pixel data
  precomputed offline (hex-encoded, ~2KB total), rendered to `<canvas>` at load via a
  tiny inline script. `image-rendering: pixelated` keeps the tiles crisp when scaled
  up. Makes the JPEG intuition visible — most visual information lives in a handful of
  low-frequency coefficients.

## Polish / infra

- **True dark-mode support** on every lab (only Circuit Lab is dark-only today; the
  rest use theme-light). A single toggle in the header.
- **Concepts index page** at `/concepts/` — reverse-glossary listing every concept and
  which labs cover it, rendered from `lab-glossary.js` for single source of truth.
- **Search across all labs** — small client-side search over glossary + section titles.
- **More section IDs** in Transformer / Machine Learning Lab / Fourier so cross-lab tooltip jumps
  land precisely (currently they fall back to page root for those three).
- **Reduced-motion honouring** — most SVGs are static so this is low stakes, but the
  Circuit Lab animations and any future CLT animation should respect
  `prefers-reduced-motion`.
- **Print / export mode** — a reader who wants to save a lab as PDF currently gets the
  navigation rail on the page. A `@media print` block to hide side-nav + header would fix
  it for ~zero effort.
- **Per-lab "last updated" meta** — date derived from git commit touching the page,
  surfaced in the footer. Signals freshness without manual bookkeeping.

## Transformer Lab full 9-panel upgrade — shipped

Nine theory panels appended after the live-attention demo, each with a kid-version
opener, a worked concrete example (practice problem where it fits), a KaTeX-formalised
equation, and a figure where one earns its place. Panels: §1 Tokens (BPE, practice
problems), §2 Embeddings (2-D cluster figure, cosine similarity intuition, word
arithmetic), §3 Q/K/V (library analogy, pronoun-resolution walkthrough), §4 Scaled
dot-product attention (worked 3-token d=2 example with exact softmax arithmetic),
§5 Multi-head (what specific heads actually learn in BERT, Clark et al. 2019), §6
Positional encoding (three-clock analogy + sinusoidal-waves figure), §7 Block
architecture (attention + FFN + residual + LayerNorm + depth stats for GPT/Llama),
§8 Encoder/decoder/causal masking (6×6 triangular-mask figure, parallel-training
justification), §9 Clustering map (four families: encoder-only, decoder-only,
encoder-decoder, multimodal, with model lists). Page now loads KaTeX via the
centralised loader (withKaTeX: true).
