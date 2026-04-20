/* Math Foundations Lab — two interactive panels:
   (1) GD/SGD/Momentum/Simulated-Annealing on a 2D loss landscape, with five
       preset functions (convex, saddle, two-wells, Rosenbrock, Himmelblau).
   (2) PCA on a 2D scatter, with closed-form 2×2 eigendecomposition of the
       sample covariance. User can add points, resample a preset, or project
       onto PC1 to see the dimensionality-reduction effect.
*/

/* ========================= shared helpers ========================= */

const WORLD = 3; // world coords [-WORLD, WORLD]²

function worldToPx(wx, wy, size) {
  const s = size / (2 * WORLD);
  return [size / 2 + wx * s, size / 2 - wy * s];
}
function pxToWorld(px, py, size) {
  const s = (2 * WORLD) / size;
  return [(px - size / 2) * s, -(py - size / 2) * s];
}

function ensureCanvasSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, cssW, cssH, size: Math.min(cssW, cssH) };
}

function gaussianSample() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ====================== GD / SGD / SA demo ======================= */

const GD_FNS = {
  quadratic: {
    label: 'Convex bowl',
    f: (x, y) => 0.5 * (x * x + 2 * y * y),
    grad: (x, y) => [x, 2 * y],
    min: [0, 0],
    levels: [0.05, 0.2, 0.5, 1, 2, 4, 7, 11]
  },
  saddle: {
    label: 'Saddle',
    // f = x² − y² has no minimum; shift by y⁴ so trajectories eventually find y=0.
    f: (x, y) => x * x - y * y + 0.2 * y * y * y * y,
    grad: (x, y) => [2 * x, -2 * y + 0.8 * y * y * y],
    min: [0, null],
    levels: [-4, -2, -1, -0.3, 0, 0.3, 1, 2, 4, 7]
  },
  'two-wells': {
    label: 'Two wells',
    // f = (x² - 1)² + y² — minima at (±1, 0), saddle at (0, 0).
    f: (x, y) => (x * x - 1) ** 2 + y * y,
    grad: (x, y) => [4 * x * (x * x - 1), 2 * y],
    min: [1, 0], // one of two symmetric minima; the global min label points here
    levels: [0.03, 0.1, 0.3, 0.6, 1, 1.5, 2.5, 4, 7]
  },
  rosenbrock: {
    label: 'Rosenbrock',
    // (1 - x)² + 100 (y - x²)² / 40 — the 100 is crushing; we scale for sane α.
    f: (x, y) => ((1 - x) ** 2 + 100 * (y - x * x) ** 2) / 40,
    grad: (x, y) => {
      const dx = (-2 * (1 - x) + 100 * 2 * (y - x * x) * (-2 * x)) / 40;
      const dy = (100 * 2 * (y - x * x)) / 40;
      return [dx, dy];
    },
    min: [1, 1],
    levels: [0.02, 0.1, 0.25, 0.6, 1.2, 2.5, 5, 10]
  },
  himmelblau: {
    label: 'Himmelblau',
    // (x² + y − 11)² + (x + y² − 7)²  has four equal minima. Scale by 1/40.
    f: (x, y) => ((x * x + y - 11) ** 2 + (x + y * y - 7) ** 2) / 40,
    grad: (x, y) => {
      const a = x * x + y - 11;
      const b = x + y * y - 7;
      return [(4 * x * a + 2 * b) / 40, (2 * a + 4 * y * b) / 40];
    },
    min: [3, 2],
    levels: [0.05, 0.2, 0.5, 1, 2, 4, 8, 14, 22]
  }
};

const gd = {
  preset: 'quadratic',
  method: 'gd',
  lr: 0.05,
  noise: 0.3,
  momentum: 0.8,
  temp0: 2,
  theta: [1.8, 1.2],
  vel: [0, 0],
  trail: [],
  step: 0,
  temperature: 2,
  accepts: 0,
  proposals: 0,
  running: false,
  rafId: null,
  stopAt: 0
};

const gdDom = {};

function gdCurrentFn() {
  return GD_FNS[gd.preset];
}

function gdResetTrail(startPos) {
  if (startPos) {
    gd.theta = startPos.slice();
  }
  gd.vel = [0, 0];
  gd.trail = [gd.theta.slice()];
  gd.step = 0;
  gd.temperature = gd.temp0;
  gd.accepts = 0;
  gd.proposals = 0;
}

function gdRandomStart() {
  // Avoid the saddle/min exactly; bias away from origin a little.
  const x = (Math.random() - 0.5) * 4;
  const y = (Math.random() - 0.5) * 4;
  gdResetTrail([x, y]);
}

function gdStep() {
  const fn = gdCurrentFn();
  if (gd.method === 'sa') {
    // Simulated annealing: propose a Gaussian perturbation, accept with
    // Metropolis probability exp(-ΔL / T).
    const sigma = Math.max(0.15, 0.05 + 0.25 * gd.temperature);
    const proposal = [gd.theta[0] + sigma * gaussianSample(), gd.theta[1] + sigma * gaussianSample()];
    const fOld = fn.f(gd.theta[0], gd.theta[1]);
    const fNew = fn.f(proposal[0], proposal[1]);
    const dL = fNew - fOld;
    gd.proposals += 1;
    const T = Math.max(gd.temperature, 1e-3);
    if (dL <= 0 || Math.random() < Math.exp(-dL / T)) {
      gd.theta = proposal;
      gd.accepts += 1;
    }
    // Geometric cooling.
    gd.temperature *= 0.995;
  } else {
    const [gx, gy] = fn.grad(gd.theta[0], gd.theta[1]);
    let stepX = gx;
    let stepY = gy;
    if (gd.method === 'sgd') {
      stepX += gd.noise * gaussianSample();
      stepY += gd.noise * gaussianSample();
    }
    if (gd.method === 'momentum') {
      gd.vel[0] = gd.momentum * gd.vel[0] + stepX;
      gd.vel[1] = gd.momentum * gd.vel[1] + stepY;
      gd.theta = [gd.theta[0] - gd.lr * gd.vel[0], gd.theta[1] - gd.lr * gd.vel[1]];
    } else {
      gd.theta = [gd.theta[0] - gd.lr * stepX, gd.theta[1] - gd.lr * stepY];
    }
  }
  // Clip to world bounds so extreme learning rates don't run off to ∞.
  gd.theta[0] = Math.max(-WORLD * 1.5, Math.min(WORLD * 1.5, gd.theta[0]));
  gd.theta[1] = Math.max(-WORLD * 1.5, Math.min(WORLD * 1.5, gd.theta[1]));
  gd.trail.push(gd.theta.slice());
  if (gd.trail.length > 2000) gd.trail.shift();
  gd.step += 1;
}

function gdDrawContours(ctx, cssW, cssH) {
  // Sample the function on a coarse grid, then draw each level as a set of
  // quadrilateral cells coloured by proximity (simple heuristic rather than a
  // proper marching-squares implementation — cheap and reads well at a glance).
  const fn = gdCurrentFn();
  const cols = 64;
  const rows = 64;
  const size = Math.min(cssW, cssH);
  const dx = (2 * WORLD) / cols;
  const dy = (2 * WORLD) / rows;
  const cx = cssW / 2 - size / 2;
  const cy = cssH / 2 - size / 2;

  // Compute loss on the grid and track min/max for colour scaling.
  const Z = new Float32Array(rows * cols);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const xw = -WORLD + (i + 0.5) * dx;
      const yw = WORLD - (j + 0.5) * dy;
      const v = fn.f(xw, yw);
      Z[j * cols + i] = v;
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    }
  }
  // Heatmap fill: dark blue → light for increasing loss. Symmetric around the
  // saddle preset's sign change.
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const v = Z[j * cols + i];
      const t = (v - zMin) / Math.max(zMax - zMin, 1e-9);
      const shade = Math.pow(t, 0.5);
      ctx.fillStyle = `rgba(${Math.round(40 + 170 * shade)}, ${Math.round(70 + 130 * shade)}, ${Math.round(140 - 60 * shade)}, 0.55)`;
      ctx.fillRect(cx + i * (size / cols), cy + j * (size / rows), size / cols + 1, size / rows + 1);
    }
  }

  // Contour lines: draw cells whose value is near a chosen level (coarse).
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
  ctx.lineWidth = 0.9;
  fn.levels.forEach((level) => {
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < cols - 1; i += 1) {
        const a = Z[j * cols + i];
        const b = Z[j * cols + i + 1];
        const c = Z[(j + 1) * cols + i];
        if ((a - level) * (b - level) < 0 || (a - level) * (c - level) < 0) {
          const x = cx + (i + 0.5) * (size / cols);
          const y = cy + (j + 0.5) * (size / rows);
          ctx.moveTo(x, y);
          ctx.lineTo(x + 1, y + 1);
        }
      }
    }
    ctx.stroke();
  });
}

function gdRender() {
  const { ctx, cssW, cssH, size } = ensureCanvasSize(gdDom.canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  gdDrawContours(ctx, cssW, cssH);

  const fn = gdCurrentFn();

  // Global minimum marker (unless saddle's global min is y = −∞ along a ridge).
  if (fn.min && fn.min[0] !== null && fn.min[1] !== null) {
    const [mx, my] = worldToPx(fn.min[0], fn.min[1], size);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cssW / 2 - size / 2 + mx, cssH / 2 - size / 2 + my, 8, 0, Math.PI * 2);
    ctx.stroke();
    // Also mark Himmelblau's other three minima for completeness.
    if (gd.preset === 'himmelblau') {
      [[-2.805118, 3.131312], [-3.779310, -3.283186], [3.584428, -1.848126]].forEach(([ax, ay]) => {
        const [px, py] = worldToPx(ax, ay, size);
        ctx.beginPath();
        ctx.arc(cssW / 2 - size / 2 + px, cssH / 2 - size / 2 + py, 6, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    if (gd.preset === 'two-wells') {
      const [px, py] = worldToPx(-1, 0, size);
      ctx.beginPath();
      ctx.arc(cssW / 2 - size / 2 + px, cssH / 2 - size / 2 + py, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Trail.
  if (gd.trail.length > 1) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const offsetX = cssW / 2 - size / 2;
    const offsetY = cssH / 2 - size / 2;
    for (let i = 0; i < gd.trail.length; i += 1) {
      const [tx, ty] = gd.trail[i];
      const [px, py] = worldToPx(tx, ty, size);
      if (i === 0) ctx.moveTo(offsetX + px, offsetY + py);
      else ctx.lineTo(offsetX + px, offsetY + py);
    }
    ctx.stroke();
  }

  // Current θ.
  const [cx, cy] = worldToPx(gd.theta[0], gd.theta[1], size);
  const offsetX = cssW / 2 - size / 2;
  const offsetY = cssH / 2 - size / 2;
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(offsetX + cx, offsetY + cy, 6, 0, Math.PI * 2);
  ctx.fill();
}

function gdRenderStats() {
  if (!gdDom.statStep) return;
  const fn = gdCurrentFn();
  const loss = fn.f(gd.theta[0], gd.theta[1]);
  const [gx, gy] = fn.grad(gd.theta[0], gd.theta[1]);
  gdDom.statStep.textContent = gd.step.toString();
  gdDom.statLoss.textContent = loss.toFixed(4);
  gdDom.statTheta.textContent = `(${gd.theta[0].toFixed(2)}, ${gd.theta[1].toFixed(2)})`;
  gdDom.statGrad.textContent = Math.sqrt(gx * gx + gy * gy).toFixed(3);
  gdDom.statAccept.textContent = gd.proposals === 0 ? '—' : `${gd.accepts}/${gd.proposals}`;
  gdDom.statTemp.textContent = gd.method === 'sa' ? gd.temperature.toFixed(3) : '—';
}

function gdRedraw() {
  gdRender();
  gdRenderStats();
}

function gdRunLoop() {
  if (!gd.running) return;
  // ~10 steps / frame so Rosenbrock & Himmelblau don't take forever.
  for (let i = 0; i < 10; i += 1) gdStep();
  gdRedraw();
  if (gd.step >= gd.stopAt) {
    gd.running = false;
    gdSetRunningUI(false);
    return;
  }
  gd.rafId = requestAnimationFrame(gdRunLoop);
}

function gdRun() {
  if (gd.running) return;
  gd.stopAt = gd.step + 300;
  gd.running = true;
  gdSetRunningUI(true);
  gd.rafId = requestAnimationFrame(gdRunLoop);
}

function gdPause() {
  gd.running = false;
  if (gd.rafId) cancelAnimationFrame(gd.rafId);
  gd.rafId = null;
  gdSetRunningUI(false);
}

function gdSetRunningUI(running) {
  if (!gdDom.run) return;
  gdDom.run.hidden = running;
  gdDom.pause.hidden = !running;
  [gdDom.step, gdDom.newStart, gdDom.reset, gdDom.method, gdDom.lr].forEach((el) => {
    if (el) el.disabled = running;
  });
}

function gdSyncMethodControls() {
  document.querySelectorAll('[data-method-only]').forEach((node) => {
    node.hidden = node.getAttribute('data-method-only') !== gd.method;
  });
}

function initGD() {
  gdDom.canvas = document.getElementById('gd-canvas');
  if (!gdDom.canvas) return;
  gdDom.method = document.getElementById('gd-method');
  gdDom.lr = document.getElementById('gd-lr');
  gdDom.lrValue = document.getElementById('gd-lr-value');
  gdDom.noise = document.getElementById('gd-noise');
  gdDom.noiseValue = document.getElementById('gd-noise-value');
  gdDom.mom = document.getElementById('gd-mom');
  gdDom.momValue = document.getElementById('gd-mom-value');
  gdDom.temp = document.getElementById('gd-temp');
  gdDom.tempValue = document.getElementById('gd-temp-value');
  gdDom.step = document.getElementById('gd-step');
  gdDom.run = document.getElementById('gd-run');
  gdDom.pause = document.getElementById('gd-pause');
  gdDom.newStart = document.getElementById('gd-new-start');
  gdDom.reset = document.getElementById('gd-reset');
  gdDom.statStep = document.getElementById('gd-stat-step');
  gdDom.statLoss = document.getElementById('gd-stat-loss');
  gdDom.statTheta = document.getElementById('gd-stat-theta');
  gdDom.statGrad = document.getElementById('gd-stat-grad');
  gdDom.statAccept = document.getElementById('gd-stat-accept');
  gdDom.statTemp = document.getElementById('gd-stat-temp');
  gdDom.presetButtons = Array.from(document.querySelectorAll('[data-gd-preset]'));

  gdDom.presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      gd.preset = btn.getAttribute('data-gd-preset');
      gdDom.presetButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
      });
      gdRandomStart();
      gdRedraw();
    });
  });
  gdDom.method.addEventListener('change', () => {
    gd.method = gdDom.method.value;
    gdSyncMethodControls();
  });
  gdDom.lr.addEventListener('input', () => {
    gd.lr = parseFloat(gdDom.lr.value);
    gdDom.lrValue.textContent = gd.lr.toFixed(3);
  });
  gdDom.noise.addEventListener('input', () => {
    gd.noise = parseFloat(gdDom.noise.value);
    gdDom.noiseValue.textContent = gd.noise.toFixed(2);
  });
  gdDom.mom.addEventListener('input', () => {
    gd.momentum = parseFloat(gdDom.mom.value);
    gdDom.momValue.textContent = gd.momentum.toFixed(2);
  });
  gdDom.temp.addEventListener('input', () => {
    gd.temp0 = parseFloat(gdDom.temp.value);
    gd.temperature = gd.temp0;
    gdDom.tempValue.textContent = gd.temp0.toFixed(2);
  });
  gdDom.step.addEventListener('click', () => {
    gdPause();
    gdStep();
    gdRedraw();
  });
  gdDom.run.addEventListener('click', gdRun);
  gdDom.pause.addEventListener('click', gdPause);
  gdDom.newStart.addEventListener('click', () => {
    gdPause();
    gdRandomStart();
    gdRedraw();
  });
  gdDom.reset.addEventListener('click', () => {
    gdPause();
    gdResetTrail(gd.trail.length ? gd.trail[0] : [1.8, 1.2]);
    gdRedraw();
  });
  gdDom.canvas.addEventListener('click', (e) => {
    gdPause();
    const rect = gdDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const offsetX = (rect.width - size) / 2;
    const offsetY = (rect.height - size) / 2;
    const px = e.clientX - rect.left - offsetX;
    const py = e.clientY - rect.top - offsetY;
    const [wx, wy] = pxToWorld(px, py, size);
    gdResetTrail([wx, wy]);
    gdRedraw();
  });
  window.addEventListener('resize', gdRender);

  gdSyncMethodControls();
  gdRandomStart();
  gdRedraw();
}

/* ============================ PCA demo ============================ */

const PCA_PRESETS = {
  tilted: 'tilted',
  round: 'round',
  'two-modes': 'two-modes',
  line: 'line'
};

const pca = {
  preset: 'tilted',
  n: 200,
  points: [],
  showProjection: false
};

const pcaDom = {};

function pcaSample() {
  const pts = [];
  const preset = pca.preset;
  const n = pca.n;
  for (let i = 0; i < n; i += 1) {
    let x;
    let y;
    if (preset === 'round') {
      x = 0.8 * gaussianSample();
      y = 0.8 * gaussianSample();
    } else if (preset === 'two-modes') {
      const a = Math.random() < 0.5 ? -1 : 1;
      x = a * 1 + 0.35 * gaussianSample();
      y = a * 0.6 + 0.35 * gaussianSample();
    } else if (preset === 'line') {
      const t = 2 * (Math.random() - 0.5);
      x = 2 * t + 0.08 * gaussianSample();
      y = 1.1 * t + 0.08 * gaussianSample();
    } else {
      // tilted Gaussian — rotate (σ_x, σ_y) = (1.5, 0.35) by 35°.
      const a = 1.5 * gaussianSample();
      const b = 0.35 * gaussianSample();
      const theta = Math.PI / 5;
      x = a * Math.cos(theta) - b * Math.sin(theta);
      y = a * Math.sin(theta) + b * Math.cos(theta);
    }
    pts.push([x, y]);
  }
  pca.points = pts;
}

/**
 * Closed-form eigendecomposition of the 2×2 sample covariance.
 * For symmetric
 *   C = [a  b]
 *       [b  d]
 * eigenvalues are λ± = (a + d)/2 ± √((a − d)²/4 + b²); eigenvectors follow
 * from [(a − λ), b] · v = 0.
 */
function pcaCompute() {
  if (pca.points.length < 2) return null;
  let mx = 0;
  let my = 0;
  const N = pca.points.length;
  for (let i = 0; i < N; i += 1) {
    mx += pca.points[i][0];
    my += pca.points[i][1];
  }
  mx /= N;
  my /= N;
  let a = 0;
  let b = 0;
  let d = 0;
  for (let i = 0; i < N; i += 1) {
    const dx = pca.points[i][0] - mx;
    const dy = pca.points[i][1] - my;
    a += dx * dx;
    b += dx * dy;
    d += dy * dy;
  }
  a /= N;
  b /= N;
  d /= N;
  const tr = a + d;
  const disc = Math.sqrt(Math.max(((a - d) / 2) ** 2 + b * b, 0));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  // eigenvector for l1: solve (a − l1) x + b y = 0 → (b, l1 − a), normalised.
  let v1x;
  let v1y;
  if (Math.abs(b) > 1e-9) {
    v1x = b;
    v1y = l1 - a;
  } else {
    v1x = a > d ? 1 : 0;
    v1y = a > d ? 0 : 1;
  }
  const norm1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
  v1x /= norm1;
  v1y /= norm1;
  // PC2 is orthogonal.
  const v2x = -v1y;
  const v2y = v1x;
  return { mean: [mx, my], l1, l2, v1: [v1x, v1y], v2: [v2x, v2y] };
}

function pcaRender() {
  const { ctx, cssW, cssH, size } = ensureCanvasSize(pcaDom.canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  const offsetX = cssW / 2 - size / 2;
  const offsetY = cssH / 2 - size / 2;
  // Grid
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY + size / 2);
  ctx.lineTo(offsetX + size, offsetY + size / 2);
  ctx.moveTo(offsetX + size / 2, offsetY);
  ctx.lineTo(offsetX + size / 2, offsetY + size);
  ctx.stroke();

  const pcs = pcaCompute();

  // Projection lines first so they sit under the points.
  if (pca.showProjection && pcs) {
    ctx.strokeStyle = 'rgba(249,115,22,0.35)';
    ctx.lineWidth = 1;
    pca.points.forEach(([x, y]) => {
      const dx = x - pcs.mean[0];
      const dy = y - pcs.mean[1];
      const proj = dx * pcs.v1[0] + dy * pcs.v1[1];
      const px = pcs.mean[0] + proj * pcs.v1[0];
      const py = pcs.mean[1] + proj * pcs.v1[1];
      const [ax, ay] = worldToPx(x, y, size);
      const [bx, by] = worldToPx(px, py, size);
      ctx.beginPath();
      ctx.moveTo(offsetX + ax, offsetY + ay);
      ctx.lineTo(offsetX + bx, offsetY + by);
      ctx.stroke();
    });
  }

  // Points
  ctx.fillStyle = 'rgba(59,130,246,0.85)';
  pca.points.forEach(([x, y]) => {
    const [px, py] = worldToPx(x, y, size);
    ctx.beginPath();
    ctx.arc(offsetX + px, offsetY + py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  if (!pcs) return;

  // Principal-component axes (arrows from mean, length ∝ √λ * 2)
  const drawArrow = (from, to, color, width) => {
    const [ax, ay] = worldToPx(from[0], from[1], size);
    const [bx, by] = worldToPx(to[0], to[1], size);
    const sx = offsetX + ax;
    const sy = offsetY + ay;
    const ex = offsetX + bx;
    const ey = offsetY + by;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // arrowhead
    const ang = Math.atan2(ey - sy, ex - sx);
    const len = 8;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - len * Math.cos(ang - Math.PI / 6), ey - len * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(ex - len * Math.cos(ang + Math.PI / 6), ey - len * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };
  const k = 2;
  const s1 = Math.sqrt(Math.max(pcs.l1, 0)) * k;
  const s2 = Math.sqrt(Math.max(pcs.l2, 0)) * k;
  drawArrow(pcs.mean,
    [pcs.mean[0] + s1 * pcs.v1[0], pcs.mean[1] + s1 * pcs.v1[1]],
    '#f97316', 2.5);
  drawArrow(pcs.mean,
    [pcs.mean[0] + s2 * pcs.v2[0], pcs.mean[1] + s2 * pcs.v2[1]],
    '#a855f7', 2);

  // Mean marker
  const [mpx, mpy] = worldToPx(pcs.mean[0], pcs.mean[1], size);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(offsetX + mpx, offsetY + mpy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function pcaRenderStats() {
  if (!pcaDom.n) return;
  const pcs = pcaCompute();
  pcaDom.n.textContent = pca.points.length.toString();
  if (!pcs) {
    pcaDom.l1.textContent = '—';
    pcaDom.l2.textContent = '—';
    pcaDom.v1.textContent = '—';
    pcaDom.v2.textContent = '—';
    pcaDom.mean.textContent = '—';
    return;
  }
  const sum = Math.max(pcs.l1 + pcs.l2, 1e-9);
  pcaDom.l1.textContent = pcs.l1.toFixed(3);
  pcaDom.l2.textContent = pcs.l2.toFixed(3);
  pcaDom.v1.textContent = `${((pcs.l1 / sum) * 100).toFixed(1)}%`;
  pcaDom.v2.textContent = `${((pcs.l2 / sum) * 100).toFixed(1)}%`;
  pcaDom.mean.textContent = `(${pcs.mean[0].toFixed(2)}, ${pcs.mean[1].toFixed(2)})`;
}

function pcaRedraw() {
  pcaRender();
  pcaRenderStats();
}

function initPCA() {
  pcaDom.canvas = document.getElementById('pca-canvas');
  if (!pcaDom.canvas) return;
  pcaDom.count = document.getElementById('pca-count');
  pcaDom.resample = document.getElementById('pca-resample');
  pcaDom.project = document.getElementById('pca-project');
  pcaDom.clear = document.getElementById('pca-clear');
  pcaDom.presetButtons = Array.from(document.querySelectorAll('[data-pca-preset]'));
  pcaDom.n = document.getElementById('pca-n');
  pcaDom.l1 = document.getElementById('pca-l1');
  pcaDom.l2 = document.getElementById('pca-l2');
  pcaDom.v1 = document.getElementById('pca-v1');
  pcaDom.v2 = document.getElementById('pca-v2');
  pcaDom.mean = document.getElementById('pca-mean');

  pcaDom.presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-pca-preset');
      if (!PCA_PRESETS[p]) return;
      pca.preset = p;
      pcaDom.presetButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      pcaSample();
      pcaRedraw();
    });
  });
  pcaDom.count.addEventListener('change', () => {
    pca.n = parseInt(pcaDom.count.value, 10) || 200;
    pcaSample();
    pcaRedraw();
  });
  pcaDom.resample.addEventListener('click', () => {
    pcaSample();
    pcaRedraw();
  });
  pcaDom.project.addEventListener('click', () => {
    pca.showProjection = !pca.showProjection;
    pcaRedraw();
  });
  pcaDom.clear.addEventListener('click', () => {
    pca.points = [];
    pcaRedraw();
  });
  pcaDom.canvas.addEventListener('click', (e) => {
    const rect = pcaDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const offsetX = (rect.width - size) / 2;
    const offsetY = (rect.height - size) / 2;
    const [wx, wy] = pxToWorld(e.clientX - rect.left - offsetX, e.clientY - rect.top - offsetY, size);
    pca.points.push([wx, wy]);
    pcaRedraw();
  });
  window.addEventListener('resize', pcaRender);

  pcaSample();
  pcaRedraw();
}

/* ============================ bootstrap ============================ */

function boot() {
  initGD();
  initPCA();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
