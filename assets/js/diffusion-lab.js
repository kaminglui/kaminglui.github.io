/* Diffusion Lab — 2D particle denoiser. The forward process is a DDPM VP
   schedule q(x_t | x_{t-1}) = N(√(1-β_t) x_{t-1}, β_t I). The reverse
   process uses the *analytic* score ∇ log q_t(x) of a known isotropic
   Gaussian-mixture target, so the visualisation is mathematically honest —
   no neural network, no training loop.
   Key math:
   - q_t(x) = Σ_k w_k N(x ; √ᾱ_t μ_k, (ᾱ_t σ_k² + (1-ᾱ_t)) I)
   - ∇ log q_t(x) = Σ_k r_k(x) (√ᾱ_t μ_k - x) / Σ_t where r_k are the
     softmax responsibilities of the widened components.
   - DDPM reverse: x_{t-1} = (1/√α_t)(x_t + β_t · score) + σ̃_t z
     (equivalent to the ε-parameterised form with ε = -√(1-ᾱ_t) · score).
*/

const T = 1000;
const BETA_START = 1e-4;
const BETA_END = 0.02;
const DEFAULT_N = 512;
const WORLD_EXTENT = 4;
const DRAW_RADIUS = 2.2;
const TARGET_SIGMA = 0.18;

// --- schedule (precomputed once) ---
const beta = new Float64Array(T);
const alpha = new Float64Array(T);
const alphaBar = new Float64Array(T);
const sqrtAlpha = new Float64Array(T);
const sqrtAlphaBar = new Float64Array(T);
const sqrtOneMinusAlphaBar = new Float64Array(T);
const posteriorVar = new Float64Array(T);
{
  let cumprod = 1;
  let prevAB = 1;
  for (let t = 0; t < T; t += 1) {
    beta[t] = BETA_START + (BETA_END - BETA_START) * (t / (T - 1));
    alpha[t] = 1 - beta[t];
    cumprod *= alpha[t];
    alphaBar[t] = cumprod;
    sqrtAlpha[t] = Math.sqrt(alpha[t]);
    sqrtAlphaBar[t] = Math.sqrt(cumprod);
    sqrtOneMinusAlphaBar[t] = Math.sqrt(Math.max(1 - cumprod, 0));
    // σ̃_t² = β_t · (1-ᾱ_{t-1}) / (1-ᾱ_t), with ᾱ_{-1} ≡ 1.
    const oneMinusPrev = 1 - prevAB;
    const oneMinusCur = Math.max(1 - cumprod, 1e-8);
    posteriorVar[t] = beta[t] * oneMinusPrev / oneMinusCur;
    prevAB = cumprod;
  }
  posteriorVar[0] = 0; // no noise at the last reverse step
}

// --- targets ---
function makeGrid() {
  const d = 1.4;
  return [
    { w: 0.25, mu: [-d, -d], sigma: TARGET_SIGMA },
    { w: 0.25, mu: [ d, -d], sigma: TARGET_SIGMA },
    { w: 0.25, mu: [-d,  d], sigma: TARGET_SIGMA },
    { w: 0.25, mu: [ d,  d], sigma: TARGET_SIGMA }
  ];
}
function makeRing() {
  const K = 8;
  const r = 1.9;
  const out = [];
  for (let k = 0; k < K; k += 1) {
    const theta = (2 * Math.PI * k) / K;
    out.push({ w: 1 / K, mu: [r * Math.cos(theta), r * Math.sin(theta)], sigma: 0.15 });
  }
  return out;
}
function makeMoons() {
  // Approximate two half-circle arcs with ~12 small isotropic components each.
  const out = [];
  const arcN = 12;
  const r = 1.6;
  for (let k = 0; k < arcN; k += 1) {
    const t = k / (arcN - 1);
    const theta = Math.PI * t;
    out.push({
      w: 1 / (2 * arcN),
      mu: [r * Math.cos(theta) - 0.5, r * Math.sin(theta) - 0.3],
      sigma: 0.1
    });
    out.push({
      w: 1 / (2 * arcN),
      mu: [-r * Math.cos(theta) + 0.5, -r * Math.sin(theta) + 0.3],
      sigma: 0.1
    });
  }
  return out;
}

const presets = {
  grid: makeGrid(),
  ring: makeRing(),
  moons: makeMoons()
};

// --- state ---
const state = {
  preset: 'grid',
  N: DEFAULT_N,
  speed: 5,
  t: 0,
  // particles are stored as a Float32Array [x0, y0, x1, y1, …] for throughput.
  xs: new Float32Array(2 * DEFAULT_N),
  mode: 'idle', // 'idle' | 'forward' | 'reverse'
  rafId: null,
  direction: 'idle'
};

const dom = {};

function sampleGaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleFromTarget() {
  const modes = presets[state.preset];
  const xs = new Float32Array(2 * state.N);
  for (let i = 0; i < state.N; i += 1) {
    // pick a component by weight
    let r = Math.random();
    let idx = 0;
    for (let k = 0; k < modes.length; k += 1) {
      r -= modes[k].w;
      if (r <= 0) { idx = k; break; }
    }
    const m = modes[idx];
    xs[2 * i]     = m.mu[0] + m.sigma * sampleGaussian();
    xs[2 * i + 1] = m.mu[1] + m.sigma * sampleGaussian();
  }
  return xs;
}

function sampleFromNoise() {
  const xs = new Float32Array(2 * state.N);
  for (let i = 0; i < 2 * state.N; i += 1) xs[i] = sampleGaussian();
  return xs;
}

/**
 * Analytic score of q_t(x), where q_t is the target GMM convolved with the
 * DDPM forward noise. Components are widened: mean → √ᾱ_t μ, variance →
 * ᾱ_t σ² + (1-ᾱ_t). Returned as [sx, sy].
 */
function scoreAt(x, y, t) {
  const modes = presets[state.preset];
  const ab = alphaBar[t];
  const sab = sqrtAlphaBar[t];
  // Precompute per-component widened variance and log-weight.
  const K = modes.length;
  const logW = new Float64Array(K);
  const vars = new Float64Array(K);
  const mx = new Float64Array(K);
  const my = new Float64Array(K);
  let maxL = -Infinity;
  for (let k = 0; k < K; k += 1) {
    const m = modes[k];
    const v = Math.max(ab * m.sigma * m.sigma + (1 - ab), 1e-6);
    vars[k] = v;
    mx[k] = sab * m.mu[0];
    my[k] = sab * m.mu[1];
    const dx = x - mx[k];
    const dy = y - my[k];
    // log N(x; mu, vI) = -log(2π v) - ||x-mu||² / (2v)  for 2-D isotropic.
    const logN = -Math.log(2 * Math.PI * v) - (dx * dx + dy * dy) / (2 * v);
    const lw = Math.log(m.w) + logN;
    logW[k] = lw;
    if (lw > maxL) maxL = lw;
  }
  let denom = 0;
  for (let k = 0; k < K; k += 1) denom += Math.exp(logW[k] - maxL);
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < K; k += 1) {
    const r = Math.exp(logW[k] - maxL) / denom;
    const v = vars[k];
    sx += r * (mx[k] - x) / v;
    sy += r * (my[k] - y) / v;
  }
  return [sx, sy];
}

/**
 * One forward DDPM step on every particle, advancing from t to t+1.
 * x_{t+1} = √(1-β_{t+1}) x_t + √β_{t+1} ε.
 */
function stepForward() {
  if (state.t >= T - 1) return false;
  const tNext = state.t + 1;
  const s1 = Math.sqrt(1 - beta[tNext]);
  const s2 = Math.sqrt(beta[tNext]);
  const xs = state.xs;
  for (let i = 0; i < state.N; i += 1) {
    xs[2 * i]     = s1 * xs[2 * i]     + s2 * sampleGaussian();
    xs[2 * i + 1] = s1 * xs[2 * i + 1] + s2 * sampleGaussian();
  }
  state.t = tNext;
  return true;
}

/**
 * One reverse DDPM step: t → t-1 using the analytic score.
 * x_{t-1} = (1/√α_t)(x_t + β_t · score(x_t, t)) + σ̃_t z
 */
function stepReverse() {
  if (state.t <= 0) return false;
  const t = state.t;
  const invSqrtA = 1 / sqrtAlpha[t];
  const bt = beta[t];
  const sig = Math.sqrt(posteriorVar[t]);
  const xs = state.xs;
  for (let i = 0; i < state.N; i += 1) {
    const x = xs[2 * i];
    const y = xs[2 * i + 1];
    const [sx, sy] = scoreAt(x, y, t);
    const mx = invSqrtA * (x + bt * sx);
    const my = invSqrtA * (y + bt * sy);
    const nx = t > 0 ? sig * sampleGaussian() : 0;
    const ny = t > 0 ? sig * sampleGaussian() : 0;
    xs[2 * i]     = mx + nx;
    xs[2 * i + 1] = my + ny;
  }
  state.t = t - 1;
  return true;
}

// --- rendering ---
function worldToPx(wx, wy, size) {
  const s = size / (2 * WORLD_EXTENT);
  return [size / 2 + wx * s, size / 2 - wy * s];
}

function renderParticles() {
  const canvas = dom.canvas;
  if (!canvas) return;
  const ctx = dom.ctx;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const size = Math.min(cssW, cssH);

  // Axes (subtle)
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cssH / 2);
  ctx.lineTo(cssW, cssH / 2);
  ctx.moveTo(cssW / 2, 0);
  ctx.lineTo(cssW / 2, cssH);
  ctx.stroke();

  // Target modes underneath the particles, faint red circles at 1σ.
  const modes = presets[state.preset];
  ctx.strokeStyle = 'rgba(239,68,68,0.55)';
  ctx.fillStyle = 'rgba(239,68,68,0.08)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < modes.length; k += 1) {
    const m = modes[k];
    const [px, py] = worldToPx(m.mu[0], m.mu[1], size);
    const r = (m.sigma * size) / (2 * WORLD_EXTENT);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Particles — use fillRect for speed at larger N; alpha gives density hue.
  const rgba = 'rgba(59,130,246,0.55)';
  ctx.fillStyle = rgba;
  const xs = state.xs;
  const rad = DRAW_RADIUS;
  for (let i = 0; i < state.N; i += 1) {
    const [px, py] = worldToPx(xs[2 * i], xs[2 * i + 1], size);
    ctx.fillRect(px - rad / 2, py - rad / 2, rad, rad);
  }
}

function renderSchedule() {
  const canvas = dom.schedule;
  if (!canvas) return;
  const ctx = dom.scheduleCtx;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { top: 8, right: 10, bottom: 18, left: 36 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;

  // ᾱ_t curve
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let t = 0; t < T; t += 1) {
    const x = pad.left + (plotW * t) / (T - 1);
    const y = pad.top + plotH - plotH * alphaBar[t];
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Current t cursor
  const cx = pad.left + (plotW * state.t) / (T - 1);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, pad.top);
  ctx.lineTo(cx, pad.top + plotH);
  ctx.stroke();
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(cx, pad.top + plotH - plotH * alphaBar[state.t], 3, 0, Math.PI * 2);
  ctx.fill();

  // Labels
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('ᾱ=1', pad.left - 4, pad.top + 4);
  ctx.fillText('ᾱ=0', pad.left - 4, pad.top + plotH - 4);
  ctx.textAlign = 'left';
  ctx.fillText(`t=${state.t}`, cx + 4, pad.top + 10);
  ctx.textAlign = 'right';
  ctx.fillText(`T=${T}`, pad.left + plotW, pad.top + plotH + 12);
}

function renderStats() {
  if (!dom.statT) return;
  dom.statT.textContent = state.t.toString();
  dom.statAbar.textContent = alphaBar[state.t].toFixed(3);
  dom.statSigma.textContent = sqrtOneMinusAlphaBar[state.t].toFixed(3);
  let sum = 0;
  const xs = state.xs;
  for (let i = 0; i < state.N; i += 1) {
    const x = xs[2 * i];
    const y = xs[2 * i + 1];
    sum += x * x + y * y;
  }
  dom.statNorm.textContent = (sum / state.N).toFixed(3);
  dom.statDir.textContent = state.direction;
  dom.statPreset.textContent = state.preset;
  if (dom.tSlider.value !== String(state.t)) dom.tSlider.value = String(state.t);
  dom.tSliderValue.textContent = state.t.toString();
}

function renderAll() {
  renderParticles();
  renderSchedule();
  renderStats();
}

// --- run loops ---
function runLoop(dir) {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.mode = dir;
  state.direction = dir;
  setRunningUI(true);
  const tick = () => {
    let advanced = false;
    for (let i = 0; i < state.speed; i += 1) {
      const ok = dir === 'forward' ? stepForward() : stepReverse();
      if (!ok) break;
      advanced = true;
    }
    renderAll();
    if (!advanced) {
      state.mode = 'idle';
      state.direction = 'done';
      setRunningUI(false);
      renderStats();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

function pause() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
  state.mode = 'idle';
  state.direction = 'paused';
  setRunningUI(false);
  renderStats();
}

function setRunningUI(running) {
  dom.btnForward.hidden = running;
  dom.btnReverse.hidden = running;
  dom.btnPause.hidden = !running;
  [dom.btnStep, dom.btnNoise, dom.btnReset, dom.presetButtons, dom.particles, dom.tSlider].forEach((el) => {
    if (!el) return;
    if (Array.isArray(el) || el instanceof NodeList) {
      el.forEach((n) => { n.disabled = running; });
    } else {
      el.disabled = running;
    }
  });
}

// --- DOM ---
function cacheDom() {
  dom.canvas = document.getElementById('diff-canvas');
  dom.ctx = dom.canvas?.getContext('2d') ?? null;
  dom.schedule = document.getElementById('diff-schedule');
  dom.scheduleCtx = dom.schedule?.getContext('2d') ?? null;
  dom.btnStep = document.getElementById('diff-btn-step');
  dom.btnForward = document.getElementById('diff-btn-forward');
  dom.btnReverse = document.getElementById('diff-btn-reverse');
  dom.btnPause = document.getElementById('diff-btn-pause');
  dom.btnReset = document.getElementById('diff-btn-reset');
  dom.btnNoise = document.getElementById('diff-btn-noise');
  dom.particles = document.getElementById('diff-particles');
  dom.speed = document.getElementById('diff-speed');
  dom.tSlider = document.getElementById('diff-t');
  dom.tSliderValue = document.getElementById('diff-t-value');
  dom.presetButtons = Array.from(document.querySelectorAll('.diff-preset'));
  dom.statT = document.getElementById('diff-stat-t');
  dom.statAbar = document.getElementById('diff-stat-abar');
  dom.statSigma = document.getElementById('diff-stat-sigma');
  dom.statNorm = document.getElementById('diff-stat-norm');
  dom.statDir = document.getElementById('diff-stat-dir');
  dom.statPreset = document.getElementById('diff-stat-preset');
}

function resetToTarget() {
  pause();
  state.t = 0;
  state.xs = sampleFromTarget();
  state.direction = 'idle';
  renderAll();
}

function attachEvents() {
  dom.btnStep.addEventListener('click', () => {
    pause();
    // "Step" defaults to the direction the slider implies — move *away* from
    // equilibrium (forward) if we're at t=0, otherwise back toward the data.
    if (state.t === 0) stepForward();
    else stepReverse();
    renderAll();
  });
  dom.btnForward.addEventListener('click', () => runLoop('forward'));
  dom.btnReverse.addEventListener('click', () => {
    if (state.t === 0) state.t = T - 1;
    runLoop('reverse');
  });
  dom.btnPause.addEventListener('click', pause);
  dom.btnReset.addEventListener('click', resetToTarget);
  dom.btnNoise.addEventListener('click', () => {
    pause();
    state.xs = sampleFromNoise();
    state.t = T - 1;
    renderAll();
    runLoop('reverse');
  });
  dom.particles.addEventListener('change', () => {
    const n = parseInt(dom.particles.value, 10) || DEFAULT_N;
    state.N = n;
    resetToTarget();
  });
  dom.speed.addEventListener('change', () => {
    state.speed = parseInt(dom.speed.value, 10) || 5;
  });
  dom.tSlider.addEventListener('input', () => {
    pause();
    const newT = parseInt(dom.tSlider.value, 10) || 0;
    // Rather than replaying steps, resample from q(x_t | x_0)-style
    // approximation: just re-sample particles from target then apply the
    // marginal scaling √ᾱ_t x + √(1-ᾱ_t) ε. This gives a faithful snapshot
    // of q_t without path-dependence.
    state.xs = sampleFromTarget();
    const sab = sqrtAlphaBar[newT];
    const som = sqrtOneMinusAlphaBar[newT];
    const xs = state.xs;
    for (let i = 0; i < state.N; i += 1) {
      xs[2 * i]     = sab * xs[2 * i]     + som * sampleGaussian();
      xs[2 * i + 1] = sab * xs[2 * i + 1] + som * sampleGaussian();
    }
    state.t = newT;
    renderAll();
  });
  dom.presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-preset');
      if (!presets[p]) return;
      dom.presetButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      state.preset = p;
      resetToTarget();
    });
  });
  window.addEventListener('resize', () => {
    renderParticles();
    renderSchedule();
  });
}

function init() {
  cacheDom();
  if (!dom.canvas || !dom.ctx) return;
  state.N = parseInt(dom.particles.value, 10) || DEFAULT_N;
  state.speed = parseInt(dom.speed.value, 10) || 5;
  attachEvents();
  resetToTarget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
