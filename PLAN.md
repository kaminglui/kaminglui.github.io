# Plan — queued educational content

Running list of labs / sections / demos to add, grouped by domain.
Items move out of here and into a commit when they ship.

## Math Foundations Lab — extensions

### Probability & statistics deep-dive
- **Common distributions tour** — Gaussian, Bernoulli/Binomial, Poisson, Exponential,
  Gamma/Beta, Uniform, Categorical, Dirichlet, Geometric, Negative Binomial, Student-t,
  Cauchy, Laplace, Log-normal, Chi-squared, F. Show how many are special cases of each
  other (Bernoulli = Binomial(n=1); Exponential = Gamma(k=1); Beta(1,1) = Uniform[0,1];
  Normal = Gamma-as-limit; Poisson = Binomial limit with np fixed).
- **Interactive PDF/PMF visualiser** — pick a family, slide its parameters, overlay the
  density against samples.
- **Heavy tails vs thin tails** — what "tail" means, which distributions are
  sub-Gaussian / sub-exponential / power-law. Why it matters for RL rewards, SGD noise,
  and financial loss models.
- **Modes of convergence** — in distribution / in probability / almost surely / in L²;
  which implies which.
- **Law of Large Numbers** (weak + strong) and **Central Limit Theorem** with animations:
  sample means tightening around μ at rate 1/√n, averages looking Gaussian regardless of
  the source distribution (for finite variance).
- **Convergence/divergence tests** — Borel-Cantelli, dominated/monotone convergence,
  when an infinite series of random variables converges.
- **Stochastic processes** — Markov chains (discrete time), Poisson process, Brownian
  motion, basic ergodicity, stationary distributions. Ties to the existing Bellman
  iteration (contraction) and diffusion Lab's Brownian motion.

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

## Polish / infra

- **True dark-mode support** on every lab (only Circuit Lab is dark-only today; the
  rest use theme-light). A single toggle in the header.
- **Concepts index page** at `/concepts/` — reverse-glossary listing every concept and
  which labs cover it, rendered from `lab-glossary.js` for single source of truth.
- **Search across all labs** — small client-side search over glossary + section titles.
- **More section IDs** in Transformer / ML Lab / Fourier so cross-lab tooltip jumps
  land precisely (currently they fall back to page root for those three).

## Transformer Lab full 9-panel upgrade

- Transformer Lab still has the "live attention" interactive but not the kid-callout +
  KaTeX theory + clustering-map treatment that RL / Diffusion / ML got. Port the format.
