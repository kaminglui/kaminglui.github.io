/* Math Foundations Lab — three interactive panels:
   (1) GD/SGD/Momentum/Simulated-Annealing on a 2D loss landscape, with five
       preset functions (convex, saddle, two-wells, Rosenbrock, Himmelblau).
   (2) PCA on a 2D scatter, with closed-form 2×2 eigendecomposition of the
       sample covariance. User can add points, resample a preset, or project
       onto PC1 to see the dimensionality-reduction effect.
   (3) KL visualiser (§8) — two sliding Gaussians, live KL(p‖q), KL(q‖p),
       entropies, cross-entropy, and overlap coefficient. Closed-form math
       lives in ./math-lab/info-theory.js.
*/

import {
  gaussianPDF,
  gaussianEntropy,
  gaussianKL,
  gaussianCrossEntropy,
  gaussianOverlap,
  momentMatchFit,
  mixturePDF
} from './math-lab/info-theory.js';
import {
  forwardKLLoss,
  reverseKLLoss,
  reverseKLGradStep
} from './math-lab/kl-fit.js';

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

// In compare mode these four methods run in parallel from the same start.
const COMPARE_METHODS = [
  { key: 'gd',       label: 'GD',       color: '#3b82f6' },
  { key: 'sgd',      label: 'SGD',      color: '#a855f7' },
  { key: 'momentum', label: 'Momentum', color: '#f97316' },
  { key: 'sa',       label: 'SA',       color: '#22c55e' }
];

const gd = {
  preset: 'quadratic',
  method: 'gd',
  viewMode: '2d',   // '2d' contour | '3d' isometric surface
  compareMode: 'single', // 'single' | 'all'
  lr: 0.05,
  noise: 0.3,
  momentum: 0.8,
  temp0: 2,
  speed: 5,
  start: [1.8, 1.2],
  runners: [],
  running: false,
  rafId: null
};

const gdDom = {};

function gdCurrentFn() {
  return GD_FNS[gd.preset];
}

function gdMakeRunner(methodKey, startPos, color) {
  return {
    method: methodKey,
    color,
    theta: startPos.slice(),
    vel: [0, 0],
    trail: [startPos.slice()],
    step: 0,
    temperature: gd.temp0,
    accepts: 0,
    proposals: 0,
    converged: false,
    lossHistory: [gdCurrentFn().f(startPos[0], startPos[1])]
  };
}

function gdResetRunners(startPos) {
  if (startPos) gd.start = startPos.slice();
  if (gd.compareMode === 'all') {
    gd.runners = COMPARE_METHODS.map((m) => gdMakeRunner(m.key, gd.start, m.color));
  } else {
    gd.runners = [gdMakeRunner(gd.method, gd.start, '#3b82f6')];
  }
}

// Convergence test per runner. Deterministic methods check gradient norm.
// Stochastic ones (SGD, SA) check whether loss has flatlined over a window.
function gdConverged(r) {
  if (r.converged) return true;
  const fn = gdCurrentFn();
  if (r.step < 30) return false;
  if (r.method === 'gd' || r.method === 'momentum') {
    const [gx, gy] = fn.grad(r.theta[0], r.theta[1]);
    return Math.sqrt(gx * gx + gy * gy) < 1e-3;
  }
  if (r.method === 'sa') {
    return r.temperature < 5e-3 && r.step > 200;
  }
  // SGD: look at loss variance in the last 80 steps.
  const hist = r.lossHistory;
  if (hist.length < 80) return false;
  const tail = hist.slice(-80);
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const variance = tail.reduce((s, v) => s + (v - mean) ** 2, 0) / tail.length;
  return Math.sqrt(variance) < 2e-3;
}

function gdRandomStart() {
  // Avoid the saddle/min exactly; bias away from origin a little.
  const x = (Math.random() - 0.5) * 4;
  const y = (Math.random() - 0.5) * 4;
  gdResetRunners([x, y]);
}

/**
 * Advance a single runner by one step using its own method. Side-effect only;
 * returns nothing. Runs no-op once r.converged is set.
 */
function gdStepRunner(r) {
  if (r.converged) return;
  const fn = gdCurrentFn();
  if (r.method === 'sa') {
    const sigma = Math.max(0.15, 0.05 + 0.25 * r.temperature);
    const proposal = [r.theta[0] + sigma * gaussianSample(), r.theta[1] + sigma * gaussianSample()];
    const fOld = fn.f(r.theta[0], r.theta[1]);
    const fNew = fn.f(proposal[0], proposal[1]);
    const dL = fNew - fOld;
    r.proposals += 1;
    const T = Math.max(r.temperature, 1e-3);
    if (dL <= 0 || Math.random() < Math.exp(-dL / T)) {
      r.theta = proposal;
      r.accepts += 1;
    }
    r.temperature *= 0.995;
  } else {
    const [gx, gy] = fn.grad(r.theta[0], r.theta[1]);
    let stepX = gx;
    let stepY = gy;
    if (r.method === 'sgd') {
      stepX += gd.noise * gaussianSample();
      stepY += gd.noise * gaussianSample();
    }
    if (r.method === 'momentum') {
      r.vel[0] = gd.momentum * r.vel[0] + stepX;
      r.vel[1] = gd.momentum * r.vel[1] + stepY;
      r.theta = [r.theta[0] - gd.lr * r.vel[0], r.theta[1] - gd.lr * r.vel[1]];
    } else {
      r.theta = [r.theta[0] - gd.lr * stepX, r.theta[1] - gd.lr * stepY];
    }
  }
  r.theta[0] = Math.max(-WORLD * 1.5, Math.min(WORLD * 1.5, r.theta[0]));
  r.theta[1] = Math.max(-WORLD * 1.5, Math.min(WORLD * 1.5, r.theta[1]));
  r.trail.push(r.theta.slice());
  if (r.trail.length > 2000) r.trail.shift();
  r.lossHistory.push(fn.f(r.theta[0], r.theta[1]));
  if (r.lossHistory.length > 2000) r.lossHistory.shift();
  r.step += 1;
  if (gdConverged(r)) r.converged = true;
}

function gdStepAll() {
  gd.runners.forEach(gdStepRunner);
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

/* -------- 3D isometric surface view --------
   Project (x, y, z) ∈ world to 2D canvas via an isometric transform. The
   surface is drawn as a mesh quad strip, sorted back-to-front (painter's
   algorithm) with simple shading by z so hills read as lighter and valleys
   darker. Cheap on a 48×48 grid, still conveys the "this valley is deeper
   than that ridge" intuition a flat contour map doesn't. */
const ISO_ANGLE = Math.PI / 6; // 30° tilt
function projectIso(x, y, z, size, offsetX, offsetY, zScale) {
  // Scale world coords to pixel space.
  const scale = size / (2 * WORLD);
  const sx = x * scale;
  const sy = y * scale;
  // Rotate around z by 30° then tilt so +z goes up-and-back.
  const cos30 = Math.cos(ISO_ANGLE);
  const sin30 = Math.sin(ISO_ANGLE);
  const px = (sx - sy) * cos30;
  const py = (sx + sy) * sin30 - z * zScale;
  return [offsetX + size / 2 + px, offsetY + size / 2 + py * 0.9];
}

function gdDraw3D(ctx, cssW, cssH) {
  const fn = gdCurrentFn();
  const size = Math.min(cssW, cssH);
  const offsetX = cssW / 2 - size / 2;
  const offsetY = cssH / 2 - size / 2;
  // Sample on a coarser grid for speed.
  const N = 40;
  const Z = new Float32Array((N + 1) * (N + 1));
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const xw = -WORLD + (2 * WORLD * i) / N;
      const yw = WORLD - (2 * WORLD * j) / N;
      const v = fn.f(xw, yw);
      Z[j * (N + 1) + i] = v;
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    }
  }
  // zScale sized so the peak rises ~35% of canvas.
  const zScale = (size * 0.35) / Math.max(zMax - zMin, 1e-6);
  // Paint cells from back (far corner, larger world x + y) to front.
  const cells = [];
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      cells.push({ i, j, depth: -(i + j) });
    }
  }
  cells.sort((a, b) => a.depth - b.depth);
  for (const { i, j } of cells) {
    const x0 = -WORLD + (2 * WORLD * i) / N;
    const x1 = -WORLD + (2 * WORLD * (i + 1)) / N;
    const y0 = WORLD - (2 * WORLD * j) / N;
    const y1 = WORLD - (2 * WORLD * (j + 1)) / N;
    const za = Z[j * (N + 1) + i] - zMin;
    const zb = Z[j * (N + 1) + i + 1] - zMin;
    const zc = Z[(j + 1) * (N + 1) + i + 1] - zMin;
    const zd = Z[(j + 1) * (N + 1) + i] - zMin;
    const [pax, pay] = projectIso(x0, y0, za, size, offsetX, offsetY, zScale);
    const [pbx, pby] = projectIso(x1, y0, zb, size, offsetX, offsetY, zScale);
    const [pcx, pcy] = projectIso(x1, y1, zc, size, offsetX, offsetY, zScale);
    const [pdx, pdy] = projectIso(x0, y1, zd, size, offsetX, offsetY, zScale);
    const avgZ = (za + zb + zc + zd) / 4;
    const t = avgZ / Math.max(zMax - zMin, 1e-6);
    const shade = Math.pow(t, 0.6);
    const r = Math.round(40 + 170 * shade);
    const g = Math.round(70 + 130 * shade);
    const b = Math.round(150 - 70 * shade);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(pax, pay);
    ctx.lineTo(pbx, pby);
    ctx.lineTo(pcx, pcy);
    ctx.lineTo(pdx, pdy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return { size, offsetX, offsetY, zScale, zMin };
}

function gdRender() {
  const { ctx, cssW, cssH, size } = ensureCanvasSize(gdDom.canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  const fn = gdCurrentFn();
  const offsetX = cssW / 2 - size / 2;
  const offsetY = cssH / 2 - size / 2;

  let iso = null;
  if (gd.viewMode === '3d') {
    iso = gdDraw3D(ctx, cssW, cssH);
  } else {
    gdDrawContours(ctx, cssW, cssH);
  }

  // Minimum markers — in 2D draw rings on the map, in 3D project onto the surface.
  const drawMinMarker = (mx, my) => {
    if (iso) {
      const zMarker = fn.f(mx, my) - iso.zMin;
      const [px, py] = projectIso(mx, my, zMarker, iso.size, iso.offsetX, iso.offsetY, iso.zScale);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const [px, py] = worldToPx(mx, my, size);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offsetX + px, offsetY + py, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  if (fn.min && fn.min[0] !== null && fn.min[1] !== null) {
    drawMinMarker(fn.min[0], fn.min[1]);
    if (gd.preset === 'himmelblau') {
      [[-2.805118, 3.131312], [-3.779310, -3.283186], [3.584428, -1.848126]]
        .forEach(([ax, ay]) => drawMinMarker(ax, ay));
    }
    if (gd.preset === 'two-wells') drawMinMarker(-1, 0);
  }

  // Draw every runner's trail + current θ. In 3D the trail is lifted to the
  // surface height so it drapes over valleys and ridges.
  gd.runners.forEach((r) => {
    if (r.trail.length > 1) {
      ctx.strokeStyle = r.color;
      ctx.lineWidth = gd.runners.length > 1 ? 1.6 : 1.8;
      ctx.beginPath();
      for (let i = 0; i < r.trail.length; i += 1) {
        const [tx, ty] = r.trail[i];
        let px;
        let py;
        if (iso) {
          const z = fn.f(tx, ty) - iso.zMin;
          [px, py] = projectIso(tx, ty, z, iso.size, iso.offsetX, iso.offsetY, iso.zScale);
        } else {
          const [ox, oy] = worldToPx(tx, ty, size);
          px = offsetX + ox;
          py = offsetY + oy;
        }
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // Current θ marker.
    const [tx, ty] = r.theta;
    let px;
    let py;
    if (iso) {
      const z = fn.f(tx, ty) - iso.zMin;
      [px, py] = projectIso(tx, ty, z, iso.size, iso.offsetX, iso.offsetY, iso.zScale);
    } else {
      const [ox, oy] = worldToPx(tx, ty, size);
      px = offsetX + ox;
      py = offsetY + oy;
    }
    ctx.fillStyle = gd.runners.length > 1 ? r.color : '#f97316';
    ctx.beginPath();
    ctx.arc(px, py, r.converged ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (r.converged) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  });
}

/**
 * Loss-vs-step chart on the small canvas below. In single mode shows one
 * series; in compare mode overlays all four with shared y-scale so the
 * reader can eyeball "which method drops fastest / gets stuck."
 */
function gdRenderLossChart() {
  const canvas = gdDom.lossCanvas;
  if (!canvas) return;
  const { ctx, cssW, cssH } = ensureCanvasSize(canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  const pad = { top: 10, right: 10, bottom: 18, left: 36 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;

  // Axes
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  const allHistories = gd.runners.map((r) => r.lossHistory).filter((h) => h.length);
  if (!allHistories.length) return;
  const maxLen = Math.max(...allHistories.map((h) => h.length));
  let lossMin = Infinity;
  let lossMax = -Infinity;
  allHistories.forEach((h) => {
    h.forEach((v) => {
      if (v < lossMin) lossMin = v;
      if (v > lossMax) lossMax = v;
    });
  });
  if (lossMax - lossMin < 1e-6) lossMax = lossMin + 1;

  ctx.fillStyle = 'rgba(148,163,184,0.85)';
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(lossMax.toFixed(2), pad.left - 4, pad.top + 6);
  ctx.fillText(lossMin.toFixed(2), pad.left - 4, pad.top + plotH - 4);
  ctx.textAlign = 'left';
  ctx.fillText(`step ${maxLen}`, pad.left + 4, pad.top + plotH + 12);

  gd.runners.forEach((r) => {
    if (!r.lossHistory.length) return;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = r.lossHistory.length;
    for (let i = 0; i < n; i += 1) {
      const x = pad.left + (plotW * i) / Math.max(maxLen - 1, 1);
      const v = r.lossHistory[i];
      const y = pad.top + plotH - (plotH * (v - lossMin)) / (lossMax - lossMin);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

function gdRenderStats() {
  if (!gdDom.statStep) return;
  // Stats panel reports the first runner (primary, or GD in compare mode).
  const r = gd.runners[0];
  if (!r) return;
  const fn = gdCurrentFn();
  const loss = fn.f(r.theta[0], r.theta[1]);
  const [gx, gy] = fn.grad(r.theta[0], r.theta[1]);
  gdDom.statStep.textContent = r.step.toString();
  gdDom.statLoss.textContent = loss.toFixed(4);
  gdDom.statTheta.textContent = `(${r.theta[0].toFixed(2)}, ${r.theta[1].toFixed(2)})`;
  gdDom.statGrad.textContent = Math.sqrt(gx * gx + gy * gy).toFixed(3);
  gdDom.statAccept.textContent = r.proposals === 0 ? '—' : `${r.accepts}/${r.proposals}`;
  gdDom.statTemp.textContent = r.method === 'sa' ? r.temperature.toFixed(3) : '—';
}

function gdRedraw() {
  gdRender();
  gdRenderLossChart();
  gdRenderStats();
}

function gdAllConverged() {
  return gd.runners.length > 0 && gd.runners.every((r) => r.converged);
}

function gdRunLoop() {
  if (!gd.running) return;
  const stepsPerFrame = Math.max(1, gd.speed);
  for (let i = 0; i < stepsPerFrame; i += 1) gdStepAll();
  gdRedraw();
  if (gdAllConverged() || (gd.runners[0] && gd.runners[0].step > 10000)) {
    gd.running = false;
    gdSetRunningUI(false);
    return;
  }
  gd.rafId = requestAnimationFrame(gdRunLoop);
}

function gdRun() {
  if (gd.running) return;
  gd.runners.forEach((r) => { r.converged = false; }); // re-enable after a prior stop
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

function gdApplyCompareMode() {
  const isCompare = gd.compareMode === 'all';
  if (gdDom.legendSingle) gdDom.legendSingle.hidden = isCompare;
  if (gdDom.legendCompare) gdDom.legendCompare.hidden = !isCompare;
  // Method dropdown and any per-method-only controls only matter in single mode.
  if (gdDom.method) gdDom.method.disabled = isCompare;
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
  gdDom.viewButtons = Array.from(document.querySelectorAll('[data-gd-view]'));
  gdDom.compareButtons = Array.from(document.querySelectorAll('[data-gd-compare]'));
  gdDom.speed = document.getElementById('gd-speed');
  gdDom.speedValue = document.getElementById('gd-speed-value');
  gdDom.lossCanvas = document.getElementById('gd-loss-chart');
  gdDom.legendSingle = document.getElementById('gd-legend-single');
  gdDom.legendCompare = document.getElementById('gd-legend-compare');

  gdDom.presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      gd.preset = btn.getAttribute('data-gd-preset');
      gdDom.presetButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      gdRandomStart();
      gdRedraw();
    });
  });
  gdDom.viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      gd.viewMode = btn.getAttribute('data-gd-view');
      gdDom.viewButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      gdRedraw();
    });
  });
  gdDom.compareButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      gd.compareMode = btn.getAttribute('data-gd-compare');
      gdDom.compareButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      gdApplyCompareMode();
      gdResetRunners();
      gdRedraw();
    });
  });
  gdDom.method.addEventListener('change', () => {
    gd.method = gdDom.method.value;
    gdSyncMethodControls();
    if (gd.compareMode === 'single') {
      gdResetRunners();
      gdRedraw();
    }
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
    gd.runners.forEach((r) => { r.temperature = gd.temp0; });
    gdDom.tempValue.textContent = gd.temp0.toFixed(2);
  });
  gdDom.speed.addEventListener('input', () => {
    gd.speed = parseInt(gdDom.speed.value, 10) || 5;
    gdDom.speedValue.textContent = gd.speed.toString();
  });
  gdDom.step.addEventListener('click', () => {
    gdPause();
    gdStepAll();
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
    gdResetRunners();
    gdRedraw();
  });
  gdDom.canvas.addEventListener('click', (e) => {
    // Picking a start from the canvas only makes sense in 2D — the iso
    // projection doesn't map a click cleanly back to world coords.
    if (gd.viewMode !== '2d') return;
    gdPause();
    const rect = gdDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const offsetX = (rect.width - size) / 2;
    const offsetY = (rect.height - size) / 2;
    const px = e.clientX - rect.left - offsetX;
    const py = e.clientY - rect.top - offsetY;
    const [wx, wy] = pxToWorld(px, py, size);
    gdResetRunners([wx, wy]);
    gdRedraw();
  });
  window.addEventListener('resize', gdRedraw);

  gdSyncMethodControls();
  gdApplyCompareMode();
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

/* ======================= §8 KL visualiser ========================= */

const KL_DOMAIN_MIN = -6;
const KL_DOMAIN_MAX = 6;
const KL_SAMPLES = 400;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function klFmt(v, digits = 3) {
  if (!Number.isFinite(v)) return '∞';
  return v.toFixed(digits);
}

function klXToPx(x, cssW) {
  const t = (x - KL_DOMAIN_MIN) / (KL_DOMAIN_MAX - KL_DOMAIN_MIN);
  return 30 + t * (cssW - 60);
}

function klYToPx(y, cssH, maxY) {
  return cssH - 24 - (y / maxY) * (cssH - 48);
}

function klTraceTopPath(ctx, mu, sigma, cssW, cssH, maxY) {
  for (let i = 0; i <= KL_SAMPLES; i++) {
    const x = KL_DOMAIN_MIN + (i / KL_SAMPLES) * (KL_DOMAIN_MAX - KL_DOMAIN_MIN);
    const px = klXToPx(x, cssW);
    const py = klYToPx(gaussianPDF(x, mu, sigma), cssH, maxY);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

function klDrawFilledDensity(ctx, mu, sigma, cssW, cssH, maxY, fill, stroke) {
  const baselineY = klYToPx(0, cssH, maxY);
  ctx.beginPath();
  ctx.moveTo(klXToPx(KL_DOMAIN_MIN, cssW), baselineY);
  klTraceTopPath(ctx, mu, sigma, cssW, cssH, maxY);
  ctx.lineTo(klXToPx(KL_DOMAIN_MAX, cssW), baselineY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  klTraceTopPath(ctx, mu, sigma, cssW, cssH, maxY);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function klDrawOverlap(ctx, mu1, s1, mu2, s2, cssW, cssH, maxY) {
  const baselineY = klYToPx(0, cssH, maxY);
  ctx.beginPath();
  ctx.moveTo(klXToPx(KL_DOMAIN_MIN, cssW), baselineY);
  for (let i = 0; i <= KL_SAMPLES; i++) {
    const x = KL_DOMAIN_MIN + (i / KL_SAMPLES) * (KL_DOMAIN_MAX - KL_DOMAIN_MIN);
    const y = Math.min(gaussianPDF(x, mu1, s1), gaussianPDF(x, mu2, s2));
    ctx.lineTo(klXToPx(x, cssW), klYToPx(y, cssH, maxY));
  }
  ctx.lineTo(klXToPx(KL_DOMAIN_MAX, cssW), baselineY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
  ctx.fill();
}

function klDrawAxis(ctx, cssW, cssH) {
  const baselineY = klYToPx(0, cssH, 1);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, baselineY);
  ctx.lineTo(cssW - 16, baselineY);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let x = KL_DOMAIN_MIN; x <= KL_DOMAIN_MAX; x++) {
    ctx.fillText(String(x), klXToPx(x, cssW), cssH - 8);
  }
}

function initInfoKLDemo() {
  const canvas = document.getElementById('kl-canvas');
  if (!canvas) return;

  const dom = {
    mu1: document.getElementById('kl-mu1'),
    sig1: document.getElementById('kl-sig1'),
    mu2: document.getElementById('kl-mu2'),
    sig2: document.getElementById('kl-sig2'),
    mu1Val: document.getElementById('kl-mu1-value'),
    sig1Val: document.getElementById('kl-sig1-value'),
    mu2Val: document.getElementById('kl-mu2-value'),
    sig2Val: document.getElementById('kl-sig2-value'),
    outForward: document.getElementById('kl-forward'),
    outReverse: document.getElementById('kl-reverse'),
    outHp: document.getElementById('kl-hp'),
    outHq: document.getElementById('kl-hq'),
    outHpq: document.getElementById('kl-hpq'),
    outOverlap: document.getElementById('kl-overlap')
  };

  let pending = false;

  function draw() {
    pending = false;
    const mu1 = parseFloat(dom.mu1.value);
    const sig1 = parseFloat(dom.sig1.value);
    const mu2 = parseFloat(dom.mu2.value);
    const sig2 = parseFloat(dom.sig2.value);

    dom.mu1Val.textContent = mu1.toFixed(2);
    dom.sig1Val.textContent = sig1.toFixed(2);
    dom.mu2Val.textContent = mu2.toFixed(2);
    dom.sig2Val.textContent = sig2.toFixed(2);

    const maxY = 1.15 / (Math.min(sig1, sig2) * SQRT_2PI);
    const { ctx, cssW, cssH } = ensureCanvasSize(canvas);
    ctx.clearRect(0, 0, cssW, cssH);

    klDrawAxis(ctx, cssW, cssH);
    klDrawOverlap(ctx, mu1, sig1, mu2, sig2, cssW, cssH, maxY);
    klDrawFilledDensity(ctx, mu1, sig1, cssW, cssH, maxY, 'rgba(59,130,246,0.22)', '#3b82f6');
    klDrawFilledDensity(ctx, mu2, sig2, cssW, cssH, maxY, 'rgba(249,115,22,0.18)', '#f97316');

    dom.outForward.textContent = klFmt(gaussianKL(mu1, sig1, mu2, sig2));
    dom.outReverse.textContent = klFmt(gaussianKL(mu2, sig2, mu1, sig1));
    dom.outHp.textContent = klFmt(gaussianEntropy(sig1));
    dom.outHq.textContent = klFmt(gaussianEntropy(sig2));
    dom.outHpq.textContent = klFmt(gaussianCrossEntropy(mu1, sig1, mu2, sig2));
    dom.outOverlap.textContent = klFmt(gaussianOverlap(mu1, sig1, mu2, sig2));
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(draw);
  }

  [dom.mu1, dom.sig1, dom.mu2, dom.sig2].forEach((el) => el.addEventListener('input', schedule));
  window.addEventListener('resize', schedule);
  draw();
}

/* ===================== §9 KL-fit comparison ======================= */

const KLFIT_DOMAIN_MIN = -8;
const KLFIT_DOMAIN_MAX = 8;
const KLFIT_SAMPLES = 300;
const KLFIT_LR = 0.1;
const KLFIT_STEPS_PER_FRAME = 3;
const KLFIT_MAX_STEPS = 4000;
const KLFIT_CONVERGE_TOL = 5e-4;

function klfitXToPx(x, cssW) {
  const t = (x - KLFIT_DOMAIN_MIN) / (KLFIT_DOMAIN_MAX - KLFIT_DOMAIN_MIN);
  return 20 + t * (cssW - 40);
}
function klfitYToPx(y, cssH, maxY) {
  return cssH - 22 - (y / maxY) * (cssH - 40);
}

function klfitDrawAxis(ctx, cssW, cssH) {
  const baselineY = cssH - 22;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, baselineY);
  ctx.lineTo(cssW - 12, baselineY);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let x = KLFIT_DOMAIN_MIN; x <= KLFIT_DOMAIN_MAX; x += 2) {
    ctx.fillText(String(x), klfitXToPx(x, cssW), cssH - 7);
  }
}

function klfitDrawMixture(ctx, weights, components, cssW, cssH, maxY, fill, stroke) {
  ctx.beginPath();
  const baselineY = cssH - 22;
  ctx.moveTo(klfitXToPx(KLFIT_DOMAIN_MIN, cssW), baselineY);
  for (let i = 0; i <= KLFIT_SAMPLES; i++) {
    const x = KLFIT_DOMAIN_MIN + (i / KLFIT_SAMPLES) * (KLFIT_DOMAIN_MAX - KLFIT_DOMAIN_MIN);
    const y = mixturePDF(x, weights, components);
    ctx.lineTo(klfitXToPx(x, cssW), klfitYToPx(y, cssH, maxY));
  }
  ctx.lineTo(klfitXToPx(KLFIT_DOMAIN_MAX, cssW), baselineY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= KLFIT_SAMPLES; i++) {
    const x = KLFIT_DOMAIN_MIN + (i / KLFIT_SAMPLES) * (KLFIT_DOMAIN_MAX - KLFIT_DOMAIN_MIN);
    const y = mixturePDF(x, weights, components);
    const px = klfitXToPx(x, cssW);
    const py = klfitYToPx(y, cssH, maxY);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function klfitDrawGaussian(ctx, mu, sigma, cssW, cssH, maxY, stroke) {
  ctx.beginPath();
  for (let i = 0; i <= KLFIT_SAMPLES; i++) {
    const x = KLFIT_DOMAIN_MIN + (i / KLFIT_SAMPLES) * (KLFIT_DOMAIN_MAX - KLFIT_DOMAIN_MIN);
    const y = gaussianPDF(x, mu, sigma);
    const px = klfitXToPx(x, cssW);
    const py = klfitYToPx(y, cssH, maxY);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function klfitPickMaxY(target, fit) {
  const modePeak = Math.max(
    target.weights[0] / (target.components[0].sigma * SQRT_2PI),
    target.weights[1] / (target.components[1].sigma * SQRT_2PI)
  );
  const fitPeak = 1 / (fit.sigma * SQRT_2PI);
  return 1.15 * Math.max(modePeak, fitPeak);
}

function klfitRender(canvas, target, fit) {
  const { ctx, cssW, cssH } = ensureCanvasSize(canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  const maxY = klfitPickMaxY(target, fit);
  klfitDrawAxis(ctx, cssW, cssH);
  klfitDrawMixture(ctx, target.weights, target.components, cssW, cssH, maxY, 'rgba(59,130,246,0.22)', '#3b82f6');
  klfitDrawGaussian(ctx, fit.mu, fit.sigma, cssW, cssH, maxY, '#f97316');
}

function initKLFitDemo() {
  const forwardCanvas = document.getElementById('klfit-forward-canvas');
  const reverseCanvas = document.getElementById('klfit-reverse-canvas');
  if (!forwardCanvas || !reverseCanvas) return;

  const dom = {
    ma: document.getElementById('klfit-ma'),
    mb: document.getElementById('klfit-mb'),
    sigTarget: document.getElementById('klfit-target-sigma'),
    pi: document.getElementById('klfit-pi'),
    mu0: document.getElementById('klfit-mu0'),
    sigma0: document.getElementById('klfit-sigma0'),
    maVal: document.getElementById('klfit-ma-value'),
    mbVal: document.getElementById('klfit-mb-value'),
    sigTargetVal: document.getElementById('klfit-target-sigma-value'),
    piVal: document.getElementById('klfit-pi-value'),
    mu0Val: document.getElementById('klfit-mu0-value'),
    sigma0Val: document.getElementById('klfit-sigma0-value'),
    fwdMu: document.getElementById('klfit-fwd-mu'),
    fwdSigma: document.getElementById('klfit-fwd-sigma'),
    fwdLoss: document.getElementById('klfit-fwd-loss'),
    revStep: document.getElementById('klfit-rev-step'),
    revMu: document.getElementById('klfit-rev-mu'),
    revSigma: document.getElementById('klfit-rev-sigma'),
    revLoss: document.getElementById('klfit-rev-loss'),
    stepBtn: document.getElementById('klfit-step'),
    runBtn: document.getElementById('klfit-run'),
    pauseBtn: document.getElementById('klfit-pause'),
    resetBtn: document.getElementById('klfit-reset')
  };

  const state = {
    rev: { mu: 1.5, sigma: 1, step: 0, running: false, raf: null }
  };

  function targetSpec() {
    const pi = parseFloat(dom.pi.value);
    const sigma = parseFloat(dom.sigTarget.value);
    return {
      weights: [pi, 1 - pi],
      components: [
        { mu: parseFloat(dom.ma.value), sigma },
        { mu: parseFloat(dom.mb.value), sigma }
      ]
    };
  }

  function resetReverse() {
    state.rev.mu = parseFloat(dom.mu0.value);
    state.rev.sigma = parseFloat(dom.sigma0.value);
    state.rev.step = 0;
    stopRun();
  }

  function stopRun() {
    state.rev.running = false;
    if (state.rev.raf) {
      cancelAnimationFrame(state.rev.raf);
      state.rev.raf = null;
    }
    dom.runBtn.hidden = false;
    dom.pauseBtn.hidden = true;
  }

  function stepReverseOnce() {
    const target = targetSpec();
    const s = reverseKLGradStep(state.rev.mu, state.rev.sigma, target.weights, target.components, {
      lr: KLFIT_LR
    });
    const dMu = Math.abs(s.mu - state.rev.mu);
    const dSigma = Math.abs(s.sigma - state.rev.sigma);
    state.rev.mu = s.mu;
    state.rev.sigma = s.sigma;
    state.rev.step += 1;
    return dMu + dSigma;
  }

  function runLoop() {
    if (!state.rev.running) return;
    let maxMove = 0;
    for (let i = 0; i < KLFIT_STEPS_PER_FRAME; i++) {
      const move = stepReverseOnce();
      if (move > maxMove) maxMove = move;
    }
    render();
    if (state.rev.step >= KLFIT_MAX_STEPS || maxMove < KLFIT_CONVERGE_TOL) {
      stopRun();
      return;
    }
    state.rev.raf = requestAnimationFrame(runLoop);
  }

  function render() {
    dom.maVal.textContent = parseFloat(dom.ma.value).toFixed(2);
    dom.mbVal.textContent = parseFloat(dom.mb.value).toFixed(2);
    dom.sigTargetVal.textContent = parseFloat(dom.sigTarget.value).toFixed(2);
    dom.piVal.textContent = parseFloat(dom.pi.value).toFixed(2);
    dom.mu0Val.textContent = parseFloat(dom.mu0.value).toFixed(2);
    dom.sigma0Val.textContent = parseFloat(dom.sigma0.value).toFixed(2);

    const target = targetSpec();
    const fwdFit = momentMatchFit(target.weights, target.components);
    klfitRender(forwardCanvas, target, fwdFit);
    dom.fwdMu.textContent = fwdFit.mu.toFixed(2);
    dom.fwdSigma.textContent = fwdFit.sigma.toFixed(2);
    dom.fwdLoss.textContent = forwardKLLoss(target.weights, target.components, fwdFit.mu, fwdFit.sigma).toFixed(3);

    klfitRender(reverseCanvas, target, { mu: state.rev.mu, sigma: state.rev.sigma });
    dom.revStep.textContent = String(state.rev.step);
    dom.revMu.textContent = state.rev.mu.toFixed(2);
    dom.revSigma.textContent = state.rev.sigma.toFixed(2);
    dom.revLoss.textContent = reverseKLLoss(state.rev.mu, state.rev.sigma, target.weights, target.components).toFixed(3);
  }

  // Target slider changes: redraw both panels, don't reset the reverse run.
  [dom.ma, dom.mb, dom.sigTarget, dom.pi].forEach((el) =>
    el.addEventListener('input', () => {
      stopRun();
      render();
    })
  );
  // Init sliders: update their labels and the reset button will apply them.
  [dom.mu0, dom.sigma0].forEach((el) =>
    el.addEventListener('input', () => {
      dom.mu0Val.textContent = parseFloat(dom.mu0.value).toFixed(2);
      dom.sigma0Val.textContent = parseFloat(dom.sigma0.value).toFixed(2);
    })
  );

  dom.stepBtn.addEventListener('click', () => {
    stopRun();
    stepReverseOnce();
    render();
  });
  dom.runBtn.addEventListener('click', () => {
    if (state.rev.running) return;
    state.rev.running = true;
    dom.runBtn.hidden = true;
    dom.pauseBtn.hidden = false;
    state.rev.raf = requestAnimationFrame(runLoop);
  });
  dom.pauseBtn.addEventListener('click', stopRun);
  dom.resetBtn.addEventListener('click', () => {
    resetReverse();
    render();
  });
  window.addEventListener('resize', render);

  resetReverse();
  render();
}

/* ============================ bootstrap ============================ */

function boot() {
  initGD();
  initPCA();
  initInfoKLDemo();
  initKLFitDemo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
