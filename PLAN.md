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
- **Dirichlet distribution** — secondary. Multivariate Beta; prior over categorical
  distributions; shows up in topic models and in RL as priors over discrete action
  probabilities. Graph: 2-simplex heatmap of Dir(α, α, α) density for α ∈ {0.5, 1,
  3} — concentrating to corners, uniform, concentrating to centroid. Simple example:
  rolling a 3-sided die with unknown probabilities; prior Dir(1,1,1), observe counts
  (n₁, n₂, n₃), posterior Dir(1+n₁, 1+n₂, 1+n₃), watch the density lobe migrate on
  the simplex.
- **Defer-list** — Student-t, Cauchy (as the CLT counter-example already named in
  §7's heavy-tail caveat), Log-normal, Chi-squared. Useful but nothing else on the
  site currently refers to them, so not priority.
- **Modes of convergence** — in distribution / in probability / almost surely / in L²;
  which implies which, with a worked non-example for each direction.
- **Convergence/divergence tests** — Borel-Cantelli, dominated/monotone convergence,
  when an infinite series of random variables converges.
- **Estimation theory** — bias, variance, MSE, Fisher information, Cramér-Rao bound.
  ML Lab says "MLE is the best estimator" but never quantifies *best*.
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
- One short page on do-calculus, confounders, why ML is prediction not causation. Short
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
- Connection to RL (MDP transition graph), neural nets (computation graph),
  transformers (attention as graph).

### PCA demo upgrades
- **Reconstruction from k components.** Live 2D scatter already shows PC1/PC2; add a
  worked example of reconstructing an individual point from k components and a scree
  plot showing variance captured. Small, high-payoff extension of the existing panel.

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
  prediction error); ties to diffusion, transformers, and RL reward shaping.

## Math Lab — GD/SGD demo further work

- **True 3D WebGL surface view** — three.js landscape the user can rotate with mouse
  and see the trajectory carved into. The current pseudo-3D is isometric canvas only.
- **Learnable step-size schedules** — adaptive learning rate (Adam parameters β₁, β₂,
  ε), cosine schedule, warmup. Show why Adam often dominates in deep nets.
- **Trust-region methods** — Newton with line search, L-BFGS visualised as contours.
- **Batch-size vs noise trade-off** — if we simulate mini-batches, show how batch size
  inversely scales SGD noise.

## RL Lab — extensions

- **Monte Carlo Tree Search (MCTS).** Not covered today. The current RL Lab tours
  the learning-from-experience line (bandits → MDP → DP → MC/TD → policy gradient).
  MCTS sits on the adjacent "planning with a known or learned model" axis — the
  AlphaGo / AlphaZero recipe — so it's a real new section, not a drive-by. Cover:
  the four-stage loop (select via UCT / expand / rollout / backup), the exploration
  term c·√(ln N / n), simulation-budget trade-offs, and how MCTS combines with a
  value + policy network in AlphaZero. Graphs: an animated tree that grows across
  four iteration snapshots, showing N/W/Q per node and the UCT score driving
  selection; a comparison plot of value convergence vs simulation count for three
  c values. Simple example: **MCTS on the same 1D chain demo** that RL Lab already
  uses for value iteration — lets the reader see MCTS arrive at the same policy
  without being given the transition model, and quantifies the sample cost of that
  freedom. Place as a new article between §7 policy gradients and §8 "Same shape,
  different targets".
- **Bayesian coin-flip interactive** — the chip is there but there's no demo.
  Pairs with the Beta-distribution demo queued under Probability.
- **Thompson sampling interactive** — pull virtual bandit arms, watch each arm's
  Beta(α, β) posterior update. Same Beta primitive as above.

## Fourier Lab — 2D extension

- **2D DFT figure** — Fourier Lab's chips mention 2D Fourier but the lab only ships 1D.
  A single 2D DFT figure plus image reconstruction from top-k frequencies would close
  the gap between chip and content.

## Polish / infra

- **True dark-mode support** on every lab (only Circuit Lab is dark-only today; the
  rest use theme-light). A single toggle in the header.
- **Concepts index page** at `/concepts/` — reverse-glossary listing every concept and
  which labs cover it, rendered from `lab-glossary.js` for single source of truth.
- **Search across all labs** — small client-side search over glossary + section titles.
- **More section IDs** in Transformer / ML Lab / Fourier so cross-lab tooltip jumps
  land precisely (currently they fall back to page root for those three).
- **Reduced-motion honouring** — most SVGs are static so this is low stakes, but the
  Circuit Lab animations and any future CLT animation should respect
  `prefers-reduced-motion`.
- **Print / export mode** — a reader who wants to save a lab as PDF currently gets the
  navigation rail on the page. A `@media print` block to hide side-nav + header would fix
  it for ~zero effort.
- **Per-lab "last updated" meta** — date derived from git commit touching the page,
  surfaced in the footer. Signals freshness without manual bookkeeping.

## Transformer Lab full 9-panel upgrade

- Transformer Lab still has the "live attention" interactive but not the kid-callout +
  KaTeX theory + clustering-map treatment that RL / Diffusion / ML got. Port the format.
