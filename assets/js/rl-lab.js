/* Reinforcement Learning Lab — multi-armed bandit simulator. Three strategies (ε-greedy, UCB1,
   Thompson) share one update loop; the page renders the arms, a running
   chart of rolling reward / cumulative regret / optimal-arm rate, and a
   live stats sidebar. Plus a Bayesian coin demo (§1) and a three-arm
   Beta-Bernoulli Thompson demo using the Beta primitives. */

import { betaPDF, betaMean, sampleBeta } from './math-lab/beta.js';

const CHART_PADDING = { top: 16, right: 16, bottom: 28, left: 44 };
const ROLLING_WINDOW = 50;
const ARMS_MIN = 2;
const ARMS_MAX = 10;

const state = {
  strategy: 'epsilon',
  epsilon: 0.1,
  ucbC: 2,
  k: 5,
  targetSteps: 500,
  // Gaussian bandits: each arm i has an unknown true mean μ_i and std σ_i.
  // Reward on pull = μ_i + σ_i · 𝒩(0,1). The agent never sees μ_i / σ_i —
  // it only sees the noisy rewards and the running mean estimate Q[i].
  trueMu: [],
  trueSigma: [],
  bestArm: 0,
  bestMean: 0,
  Q: [],
  N: [],
  // Thompson sampling (Normal-Normal conjugate, known σ): posterior mean
  // for arm i is 𝒩(Q[i], σ_i² / N[i]).
  t: 0,
  totalReward: 0,
  regret: 0,
  optimalPicks: 0,
  rewardHistory: [],
  regretHistory: [],
  optimalRateHistory: [],
  rolling: [],
  rollingMin: 0,
  rollingMax: 1,
  lastAction: -1,
  running: false,
  rafId: null,
  stopAt: 0
};

function mulberry32(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = Math.random;

function sampleGaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function newArms() {
  const seed = Math.floor(Math.random() * 2 ** 30);
  rng = mulberry32(seed);
  // Spread μ across [0.2, 0.9] so arms are visually distinguishable, and give
  // each arm its own noise scale σ ∈ [0.05, 0.35]. Higher σ arms need more
  // pulls to estimate accurately — a reason strategies like UCB and Thompson
  // that track uncertainty can outperform plain ε-greedy.
  state.trueMu = Array.from({ length: state.k }, () => 0.2 + rng() * 0.7);
  state.trueSigma = Array.from({ length: state.k }, () => 0.05 + rng() * 0.3);
  const best = state.trueMu.reduce(
    (acc, v, i) => (v > acc.v ? { v, i } : acc),
    { v: -Infinity, i: 0 }
  );
  state.bestArm = best.i;
  state.bestMean = best.v;
}

function resetStats() {
  state.Q = new Array(state.k).fill(0);
  state.N = new Array(state.k).fill(0);
  state.t = 0;
  state.totalReward = 0;
  state.regret = 0;
  state.optimalPicks = 0;
  state.rewardHistory = [];
  state.regretHistory = [];
  state.optimalRateHistory = [];
  state.rolling = [];
  state.rollingMin = 0;
  state.rollingMax = 1;
  state.lastAction = -1;
}

function chooseAction() {
  const { strategy, Q, N, epsilon, ucbC, trueSigma, t, k } = state;

  if (strategy === 'greedy') {
    const unvisited = N.findIndex((n) => n === 0);
    if (unvisited !== -1) return unvisited;
    return argmaxWithTieBreak(Q);
  }

  if (strategy === 'epsilon') {
    if (rng() < epsilon) return Math.floor(rng() * k);
    const unvisited = N.findIndex((n) => n === 0);
    if (unvisited !== -1) return unvisited;
    return argmaxWithTieBreak(Q);
  }

  if (strategy === 'ucb') {
    const unvisited = N.findIndex((n) => n === 0);
    if (unvisited !== -1) return unvisited;
    const logT = Math.log(Math.max(t, 1));
    // UCB1 bonus scaled by the arm's known σ so noisier arms carry wider
    // confidence bands — the natural Gaussian extension of plain √(logt/N).
    const scores = Q.map((q, i) => q + ucbC * trueSigma[i] * Math.sqrt(logT / N[i]));
    return argmaxWithTieBreak(scores);
  }

  if (strategy === 'thompson') {
    // Normal-Normal Thompson with known σ: posterior over μ_i after N pulls
    // is 𝒩(Q[i], σ_i² / N[i]). Before the first pull, sample from a broad
    // prior 𝒩(0.5, 1) so every arm has a chance to win the draw.
    const samples = Q.map((q, i) => {
      if (N[i] === 0) return 0.5 + sampleGaussian();
      return q + (trueSigma[i] / Math.sqrt(N[i])) * sampleGaussian();
    });
    return argmaxWithTieBreak(samples);
  }

  return 0;
}

function argmaxWithTieBreak(arr) {
  let best = -Infinity;
  let tied = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i] > best) {
      best = arr[i];
      tied = [i];
    } else if (arr[i] === best) {
      tied.push(i);
    }
  }
  return tied[Math.floor(rng() * tied.length)];
}

function pullArm(action) {
  const mu = state.trueMu[action];
  const sigma = state.trueSigma[action];
  const reward = mu + sigma * sampleGaussian();
  updateFromPull(action, reward);
  return reward;
}

function updateFromPull(action, reward) {
  state.N[action] += 1;
  state.Q[action] += (reward - state.Q[action]) / state.N[action];

  state.t += 1;
  state.totalReward += reward;
  // Expected regret uses the *means*, not the realised reward — that way
  // regret reflects strategy quality, not reward-noise luck.
  state.regret += state.bestMean - state.trueMu[action];
  if (action === state.bestArm) state.optimalPicks += 1;
  state.lastAction = action;

  state.rolling.push(reward);
  if (state.rolling.length > ROLLING_WINDOW) state.rolling.shift();
  const rollingAvg = state.rolling.reduce((a, b) => a + b, 0) / state.rolling.length;

  state.rewardHistory.push(rollingAvg);
  state.regretHistory.push(state.regret);
  state.optimalRateHistory.push(state.optimalPicks / state.t);
}

function stepOnce() {
  const action = chooseAction();
  return pullArm(action);
}

/* -------------- DOM refs -------------- */

const dom = {};

function cacheDom() {
  dom.strategy = document.getElementById('rl-strategy');
  dom.epsilon = document.getElementById('rl-epsilon');
  dom.epsilonValue = document.getElementById('rl-epsilon-value');
  dom.ucbC = document.getElementById('rl-ucb-c');
  dom.ucbCValue = document.getElementById('rl-ucb-c-value');
  dom.arms = document.getElementById('rl-arms');
  dom.steps = document.getElementById('rl-steps');
  dom.btnStep = document.getElementById('rl-btn-step');
  dom.btnRun = document.getElementById('rl-btn-run');
  dom.btnPause = document.getElementById('rl-btn-pause');
  dom.btnReset = document.getElementById('rl-btn-reset');
  dom.btnNewArms = document.getElementById('rl-btn-new-arms');
  dom.armRow = document.getElementById('rl-arm-row');
  dom.canvas = document.getElementById('rl-chart-canvas');
  dom.ctx = dom.canvas?.getContext('2d') ?? null;
  dom.statStep = document.getElementById('rl-stat-step');
  dom.statReward = document.getElementById('rl-stat-reward');
  dom.statRegret = document.getElementById('rl-stat-regret');
  dom.statOptimal = document.getElementById('rl-stat-optimal');
  dom.statBest = document.getElementById('rl-stat-best');
  dom.statBestEst = document.getElementById('rl-stat-best-est');
  dom.strategyOnly = document.querySelectorAll('[data-strategy-only]');
}

/* -------------- rendering -------------- */

function renderArmRow() {
  if (!dom.armRow) return;
  const bestEstIdx = state.Q.length ? argmaxWithTieBreak(state.Q) : -1;
  const flashIdx = state.lastAction;
  // Meter is scaled so μ ± 2σ of the noisiest arm fits. That keeps the view
  // stable as you switch between arm sets without squashing narrow arms.
  const meterMax = Math.max(
    1,
    ...state.trueMu.map((m, i) => m + 2 * state.trueSigma[i]),
    ...state.Q
  );
  dom.armRow.innerHTML = state.trueMu
    .map((mu, i) => {
      const sigma = state.trueSigma[i];
      const q = state.Q[i] ?? 0;
      const n = state.N[i] ?? 0;
      const isBestEst = i === bestEstIdx && n > 0;
      const isFlash = i === flashIdx;
      const toPct = (v) => Math.max(0, Math.min(100, (v / meterMax) * 100));
      const bandLeft = toPct(Math.max(0, mu - sigma));
      const bandRight = toPct(mu + sigma);
      return `
        <div class="rl-arm ${isBestEst ? 'is-best' : ''} ${isFlash ? 'is-flash' : ''}" data-arm="${i}" title="Arm ${i + 1}: true μ = ${mu.toFixed(3)}, σ = ${sigma.toFixed(3)}">
          <span class="rl-arm__pull">${n}</span>
          <div class="rl-arm__title">
            <span>Arm ${i + 1}</span>
            <small>Q ${q.toFixed(2)}</small>
          </div>
          <div class="rl-arm__meter" aria-hidden="true">
            <div class="rl-arm__meter-band" style="left: ${bandLeft}%; width: ${Math.max(0, bandRight - bandLeft)}%"></div>
            <div class="rl-arm__meter-fill" style="width: ${toPct(q)}%"></div>
            <div class="rl-arm__meter-true" style="left: ${toPct(mu)}%"></div>
          </div>
          <div class="rl-arm__stats">
            <span>Q̂ ${q.toFixed(2)}</span>
            <span>μ ${mu.toFixed(2)} · σ ${sigma.toFixed(2)}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderStats() {
  if (!dom.statStep) return;
  dom.statStep.textContent = state.t.toString();
  dom.statReward.textContent = state.totalReward.toFixed(2);
  dom.statRegret.textContent = state.regret.toFixed(2);
  dom.statOptimal.textContent = state.t ? `${((state.optimalPicks / state.t) * 100).toFixed(1)}%` : '—';
  dom.statBest.textContent = `${state.bestArm + 1} (μ=${state.bestMean.toFixed(2)})`;
  if (state.Q.length) {
    const idx = argmaxWithTieBreak(state.Q);
    dom.statBestEst.textContent = state.N[idx] > 0 ? `${idx + 1} (Q=${state.Q[idx].toFixed(2)})` : '—';
  } else {
    dom.statBestEst.textContent = '—';
  }
}

function renderChart() {
  const { ctx } = dom;
  if (!ctx) return;
  const canvas = dom.canvas;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const plotX = CHART_PADDING.left;
  const plotY = CHART_PADDING.top;
  const plotW = cssW - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = cssH - CHART_PADDING.top - CHART_PADDING.bottom;

  // grid
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = plotY + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();
  }

  // axes labels
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = '11px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('1.0', plotX - 6, plotY);
  ctx.fillText('0.0', plotX - 6, plotY + plotH);

  const reward = state.rewardHistory;
  const regret = state.regretHistory;
  const optimal = state.optimalRateHistory;
  if (!reward.length) return;

  const maxRegret = Math.max(1, regret[regret.length - 1] || 1);

  drawLine(ctx, reward, plotX, plotY, plotW, plotH, 1, '#3b82f6');
  drawLine(ctx, regret.map((r) => r / maxRegret), plotX, plotY, plotW, plotH, 1, '#ef4444');
  drawLine(ctx, optimal, plotX, plotY, plotW, plotH, 1, '#22c55e');

  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`step ${state.t}`, plotX + 4, plotY + plotH + 14);
  ctx.textAlign = 'right';
  ctx.fillText(`regret max ${maxRegret.toFixed(1)}`, plotX + plotW, plotY + plotH + 14);
}

function drawLine(ctx, series, x0, y0, w, h, yMax, color) {
  if (series.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  const n = series.length;
  for (let i = 0; i < n; i += 1) {
    const x = x0 + (w * i) / Math.max(n - 1, 1);
    const v = Math.max(0, Math.min(yMax, series[i]));
    const y = y0 + h - (h * v) / yMax;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function renderAll() {
  renderArmRow();
  renderStats();
  renderChart();
}

/* -------------- run loop -------------- */

function runLoop() {
  if (!state.running) return;
  const stepsPerFrame = Math.max(1, Math.ceil(state.targetSteps / 120));
  const end = Math.min(state.t + stepsPerFrame, state.stopAt);
  while (state.t < end) stepOnce();
  renderAll();
  if (state.t >= state.stopAt) {
    state.running = false;
    setRunningUI(false);
    return;
  }
  state.rafId = requestAnimationFrame(runLoop);
}

function startRun() {
  if (state.running) return;
  state.stopAt = state.t + state.targetSteps;
  state.running = true;
  setRunningUI(true);
  state.rafId = requestAnimationFrame(runLoop);
}

function pauseRun() {
  state.running = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  setRunningUI(false);
}

function setRunningUI(running) {
  if (!dom.btnRun || !dom.btnPause) return;
  dom.btnRun.hidden = running;
  dom.btnPause.hidden = !running;
  [dom.btnStep, dom.btnReset, dom.btnNewArms, dom.strategy, dom.arms].forEach((el) => {
    if (el) el.disabled = running;
  });
}

/* -------------- events -------------- */

function syncStrategyControls() {
  dom.strategyOnly.forEach((node) => {
    const match = node.getAttribute('data-strategy-only') === state.strategy;
    node.hidden = !match;
  });
}

function attachEvents() {
  dom.strategy?.addEventListener('change', () => {
    state.strategy = dom.strategy.value;
    syncStrategyControls();
  });
  dom.epsilon?.addEventListener('input', () => {
    state.epsilon = parseFloat(dom.epsilon.value);
    dom.epsilonValue.textContent = state.epsilon.toFixed(2);
  });
  dom.ucbC?.addEventListener('input', () => {
    state.ucbC = parseFloat(dom.ucbC.value);
    dom.ucbCValue.textContent = state.ucbC.toFixed(2);
  });
  dom.arms?.addEventListener('change', () => {
    const v = Math.max(ARMS_MIN, Math.min(ARMS_MAX, parseInt(dom.arms.value, 10) || state.k));
    dom.arms.value = v;
    if (v !== state.k) {
      state.k = v;
      newArms();
      resetStats();
      renderAll();
    }
  });
  dom.steps?.addEventListener('change', () => {
    const v = Math.max(50, Math.min(5000, parseInt(dom.steps.value, 10) || 500));
    dom.steps.value = v;
    state.targetSteps = v;
    dom.btnRun.textContent = `Run ${v} steps`;
  });
  dom.btnStep?.addEventListener('click', () => {
    stepOnce();
    renderAll();
  });
  dom.btnRun?.addEventListener('click', startRun);
  dom.btnPause?.addEventListener('click', pauseRun);
  dom.btnReset?.addEventListener('click', () => {
    pauseRun();
    resetStats();
    renderAll();
  });
  dom.btnNewArms?.addEventListener('click', () => {
    pauseRun();
    newArms();
    resetStats();
    renderAll();
  });
  dom.armRow?.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-arm]');
    if (!tile || state.running) return;
    const idx = parseInt(tile.getAttribute('data-arm'), 10);
    if (Number.isInteger(idx)) {
      pullArm(idx);
      renderAll();
    }
  });
  window.addEventListener('resize', renderChart);
}

function init() {
  cacheDom();
  if (!dom.canvas) return;
  state.strategy = dom.strategy.value;
  state.epsilon = parseFloat(dom.epsilon.value);
  state.ucbC = parseFloat(dom.ucbC.value);
  state.k = parseInt(dom.arms.value, 10) || 5;
  state.targetSteps = parseInt(dom.steps.value, 10) || 500;
  dom.btnRun.textContent = `Run ${state.targetSteps} steps`;
  syncStrategyControls();
  newArms();
  resetStats();
  attachEvents();
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

/* =====================================================================
   1D chain MDP — textbook GridWorld shrunk to one row.
   - 7 states, goal at s = N-1 (absorbing).
   - Actions: 0 = left, 1 = stay, 2 = right.
   - Stochastic: intended move w.p. 0.8, slip left w.p. 0.1, slip right w.p. 0.1.
   - γ = 0.95, reward +1 on landing in goal, 0 otherwise.
   Value iteration updates V(s) ← max_a Σ P(s'|s,a)[r + γ V(s')] and records
   Δ_max per sweep for the contraction chart. After convergence, clicking
   "Simulate greedy agent" rolls a policy trajectory and reports the *actual*
   environment steps it took — separate from the *planning* iteration count.
   ==================================================================== */

const CHAIN = {
  n: 7,
  gamma: 0.95,
  actions: [-1, 0, 1],
  actionArrows: ['←', '◦', '→'],
  intendedProb: 0.8,
  slipProb: 0.1,
  goalReward: 1,
  convergeTol: 1e-4
};

const chain = {
  mode: 'vi', // 'vi' = value iteration, 'pi' = policy iteration
  piPhase: 'eval', // PI-only: 'eval' = run policy evaluation, 'improve' = run policy improvement, 'done' = converged
  piOuterIter: 0, // outer PI iterations (one eval-to-convergence + one improvement)
  piEvalSweeps: 0, // sweeps inside the current eval phase
  V: new Array(CHAIN.n).fill(0),
  policy: new Array(CHAIN.n).fill(1),
  iteration: 0, // global step counter (sweeps + improvements)
  delta: 0,
  deltaHistory: [],
  justUpdated: new Set(),
  agentPos: null,
  simulating: false,
  simSteps: 0,
  simRafId: null,
  running: false,
  runRafId: null
};

const chainDom = {};

function clampState(s) {
  return Math.max(0, Math.min(CHAIN.n - 1, s));
}

function transitions(s, aIdx) {
  if (s === CHAIN.n - 1) return [[1, s, 0]];
  const delta = CHAIN.actions[aIdx];
  const intended = clampState(s + delta);
  const slipA = clampState(s - 1);
  const slipB = clampState(s + 1);
  const reward = (ns) => (ns === CHAIN.n - 1 ? CHAIN.goalReward : 0);
  return [
    [CHAIN.intendedProb, intended, reward(intended)],
    [CHAIN.slipProb, slipA, reward(slipA)],
    [CHAIN.slipProb, slipB, reward(slipB)]
  ];
}

function valueIterStep() {
  const Vnew = chain.V.slice();
  const polNew = chain.policy.slice();
  let maxDelta = 0;
  const changed = new Set();
  for (let s = 0; s < CHAIN.n; s += 1) {
    if (s === CHAIN.n - 1) continue;
    let best = -Infinity;
    let bestA = 1;
    for (let a = 0; a < 3; a += 1) {
      const tx = transitions(s, a);
      let val = 0;
      for (let i = 0; i < tx.length; i += 1) {
        const [p, ns, r] = tx[i];
        val += p * (r + CHAIN.gamma * chain.V[ns]);
      }
      if (val > best + 1e-12) {
        best = val;
        bestA = a;
      }
    }
    const diff = Math.abs(best - chain.V[s]);
    if (diff > maxDelta) maxDelta = diff;
    if (diff > 1e-9) changed.add(s);
    Vnew[s] = best;
    polNew[s] = bestA;
  }
  chain.V = Vnew;
  chain.policy = polNew;
  chain.iteration += 1;
  chain.delta = maxDelta;
  chain.deltaHistory.push(maxDelta);
  chain.justUpdated = changed;
}

/**
 * Policy evaluation sweep: holds π fixed and updates V toward V^π.
 * V(s) ← Σ_a π(a|s) Σ_{s',r} P(s',r|s,a)[r + γV(s')]
 * Our π is deterministic so the outer sum collapses to a single action.
 * Loop this sweep until Δ_max shrinks below the convergence tolerance — that
 * marks V as a good enough V^π to improve against.
 */
function policyEvalSweep() {
  const Vnew = chain.V.slice();
  let maxDelta = 0;
  const changed = new Set();
  for (let s = 0; s < CHAIN.n; s += 1) {
    if (s === CHAIN.n - 1) continue;
    const a = chain.policy[s];
    const tx = transitions(s, a);
    let val = 0;
    for (let i = 0; i < tx.length; i += 1) {
      const [p, ns, r] = tx[i];
      val += p * (r + CHAIN.gamma * chain.V[ns]);
    }
    const diff = Math.abs(val - chain.V[s]);
    if (diff > maxDelta) maxDelta = diff;
    if (diff > 1e-9) changed.add(s);
    Vnew[s] = val;
  }
  chain.V = Vnew;
  chain.iteration += 1;
  chain.piEvalSweeps += 1;
  chain.delta = maxDelta;
  chain.deltaHistory.push(maxDelta);
  chain.justUpdated = changed;
  if (maxDelta < CHAIN.convergeTol) chain.piPhase = 'improve';
}

/**
 * Policy improvement: re-compute the greedy policy under the current V.
 * π'(s) = argmax_a Σ P(s'|s,a)[r + γV(s')]. If no action changes anywhere,
 * the policy (and hence V) is optimal — flag 'done'; otherwise loop back
 * into evaluation for the new policy.
 */
function policyImproveStep() {
  const polNew = chain.policy.slice();
  let changed = false;
  const changedSet = new Set();
  for (let s = 0; s < CHAIN.n; s += 1) {
    if (s === CHAIN.n - 1) continue;
    let best = -Infinity;
    let bestA = chain.policy[s];
    for (let a = 0; a < 3; a += 1) {
      const tx = transitions(s, a);
      let val = 0;
      for (let i = 0; i < tx.length; i += 1) {
        const [p, ns, r] = tx[i];
        val += p * (r + CHAIN.gamma * chain.V[ns]);
      }
      if (val > best + 1e-12) { best = val; bestA = a; }
    }
    if (bestA !== chain.policy[s]) {
      changed = true;
      changedSet.add(s);
    }
    polNew[s] = bestA;
  }
  chain.policy = polNew;
  chain.iteration += 1;
  chain.piOuterIter += 1;
  chain.piEvalSweeps = 0;
  chain.justUpdated = changedSet;
  chain.delta = 0;
  chain.piPhase = changed ? 'eval' : 'done';
  return changed;
}

/**
 * Mode-aware single step. In VI, one sweep updates V and π jointly. In PI,
 * the step advances whichever phase is active (eval vs improve) so the user
 * can watch the alternation unfold.
 */
function chainStep() {
  if (chain.mode === 'vi') return valueIterStep();
  if (chain.piPhase === 'eval') return policyEvalSweep();
  if (chain.piPhase === 'improve') return policyImproveStep();
  return null; // 'done' — no-op
}

function chainReset() {
  chain.V = new Array(CHAIN.n).fill(0);
  chain.policy = new Array(CHAIN.n).fill(1);
  chain.iteration = 0;
  chain.piOuterIter = 0;
  chain.piEvalSweeps = 0;
  chain.piPhase = 'eval';
  chain.delta = 0;
  chain.deltaHistory = [];
  chain.justUpdated.clear();
  chain.agentPos = null;
  chain.simSteps = 0;
  chainStopRun();
  chainStopSim();
}

function chainRunToConv() {
  if (chain.running) return;
  chain.running = true;
  chainSetUI(true);
  const tick = () => {
    if (!chain.running) return;
    chainStep();
    renderChain();
    const converged =
      chain.iteration > 500 ||
      (chain.mode === 'vi' && chain.delta < CHAIN.convergeTol && chain.iteration > 0) ||
      (chain.mode === 'pi' && chain.piPhase === 'done');
    if (converged) {
      chain.running = false;
      chainSetUI(false);
      return;
    }
    chain.runRafId = requestAnimationFrame(tick);
  };
  chain.runRafId = requestAnimationFrame(tick);
}

function chainStopRun() {
  chain.running = false;
  if (chain.runRafId) cancelAnimationFrame(chain.runRafId);
  chain.runRafId = null;
  chainSetUI(false);
}

function chainSimulateAgent() {
  chainStopSim();
  chain.agentPos = 0;
  chain.simSteps = 0;
  chain.simulating = true;
  chainSetUI(false);
  const step = () => {
    if (!chain.simulating) return;
    if (chain.agentPos === CHAIN.n - 1) {
      chain.simulating = false;
      renderChain();
      return;
    }
    const a = chain.policy[chain.agentPos];
    const roll = Math.random();
    let nextPos;
    if (roll < CHAIN.intendedProb) nextPos = clampState(chain.agentPos + CHAIN.actions[a]);
    else if (roll < CHAIN.intendedProb + CHAIN.slipProb) nextPos = clampState(chain.agentPos - 1);
    else nextPos = clampState(chain.agentPos + 1);
    chain.agentPos = nextPos;
    chain.simSteps += 1;
    renderChain();
    if (chain.simSteps > 200) {
      chain.simulating = false;
      return;
    }
    chain.simRafId = setTimeout(step, 260);
  };
  chain.simRafId = setTimeout(step, 260);
}

function chainStopSim() {
  chain.simulating = false;
  if (chain.simRafId) clearTimeout(chain.simRafId);
  chain.simRafId = null;
}

function chainSetUI(running) {
  if (!chainDom.step) return;
  [chainDom.step, chainDom.run, chainDom.reset, chainDom.simulate].forEach((el) => {
    if (el) el.disabled = running;
  });
  if (chainDom.run) chainDom.run.textContent = running ? 'Running…' : 'Run to convergence';
}

function renderChain() {
  if (!chainDom.grid) return;
  chainDom.grid.innerHTML = chain.V
    .map((v, s) => {
      const isGoal = s === CHAIN.n - 1;
      const isAgent = chain.agentPos === s;
      const isUpdated = chain.justUpdated.has(s);
      const arrow = isGoal ? '★' : CHAIN.actionArrows[chain.policy[s]];
      const classes = [
        'rl-cell',
        isGoal ? 'is-goal' : '',
        isAgent ? 'is-agent' : '',
        isUpdated ? 'is-updated' : ''
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <div class="${classes}" data-state="${s}">
          <span class="rl-cell__label">s = ${s}</span>
          <span class="rl-cell__value">${v.toFixed(3)}</span>
          <span class="rl-cell__policy" aria-label="policy">${arrow}</span>
        </div>
      `;
    })
    .join('');
  if (chainDom.iter) chainDom.iter.textContent = chain.iteration.toString();
  if (chainDom.delta) {
    chainDom.delta.textContent =
      chain.deltaHistory.length === 0 ? '—' : chain.delta.toExponential(2);
  }
  if (chainDom.steps) {
    chainDom.steps.textContent =
      chain.agentPos === null ? '—' : chain.simulating ? `${chain.simSteps}…` : chain.simSteps.toString();
  }
  if (chainDom.phase) {
    if (chain.mode === 'vi') {
      chainDom.phase.textContent = 'VI sweep';
    } else if (chain.piPhase === 'eval') {
      chainDom.phase.textContent = `PI eval · outer ${chain.piOuterIter} · sweep ${chain.piEvalSweeps}`;
    } else if (chain.piPhase === 'improve') {
      chainDom.phase.textContent = `PI improve · outer ${chain.piOuterIter}`;
    } else {
      chainDom.phase.textContent = `PI done · outer ${chain.piOuterIter}`;
    }
  }
  if (chainDom.step) {
    if (chain.mode === 'vi') chainDom.step.textContent = 'Value-iter step';
    else if (chain.piPhase === 'improve') chainDom.step.textContent = 'Policy-improve step';
    else if (chain.piPhase === 'done') chainDom.step.textContent = 'Converged';
    else chainDom.step.textContent = 'Policy-eval sweep';
  }
  renderChainDeltaChart();
}

function renderChainDeltaChart() {
  const ctx = chainDom.deltaCtx;
  if (!ctx) return;
  const canvas = chainDom.deltaCanvas;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const series = chain.deltaHistory;
  if (series.length < 2) {
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '11px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Press Step to plot Δ_max per iteration', cssW / 2, cssH / 2);
    return;
  }
  // log-y for the contraction curve; floor to avoid log(0).
  const pad = { top: 8, right: 10, bottom: 16, left: 32 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;
  const logs = series.map((d) => Math.log10(Math.max(d, 1e-6)));
  const minL = Math.min(...logs);
  const maxL = Math.max(...logs, minL + 0.5);

  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  ctx.fillStyle = 'rgba(148,163,184,0.85)';
  ctx.font = '10px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`1e${maxL.toFixed(0)}`, pad.left - 4, pad.top + 6);
  ctx.fillText(`1e${minL.toFixed(0)}`, pad.left - 4, pad.top + plotH - 4);

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  for (let i = 0; i < logs.length; i += 1) {
    const x = pad.left + (plotW * i) / Math.max(logs.length - 1, 1);
    const y = pad.top + plotH - (plotH * (logs[i] - minL)) / Math.max(maxL - minL, 1e-6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#3b82f6';
  const lastX = pad.left + plotW;
  const lastY = pad.top + plotH - (plotH * (logs[logs.length - 1] - minL)) / Math.max(maxL - minL, 1e-6);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function initChain() {
  chainDom.grid = document.getElementById('chain-grid');
  if (!chainDom.grid) return;
  chainDom.step = document.getElementById('chain-step');
  chainDom.run = document.getElementById('chain-run');
  chainDom.simulate = document.getElementById('chain-simulate');
  chainDom.reset = document.getElementById('chain-reset');
  chainDom.iter = document.getElementById('chain-iter');
  chainDom.delta = document.getElementById('chain-delta');
  chainDom.steps = document.getElementById('chain-steps');
  chainDom.phase = document.getElementById('chain-phase');
  chainDom.modeButtons = Array.from(document.querySelectorAll('[data-chain-mode]'));
  chainDom.deltaCanvas = document.getElementById('chain-delta-chart');
  chainDom.deltaCtx = chainDom.deltaCanvas?.getContext('2d') ?? null;

  chainDom.modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-chain-mode');
      if (next === chain.mode) return;
      chain.mode = next;
      chainDom.modeButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      chainReset();
      renderChain();
    });
  });

  chainDom.step.addEventListener('click', () => {
    chainStopRun();
    chainStep();
    renderChain();
  });
  chainDom.run.addEventListener('click', chainRunToConv);
  chainDom.reset.addEventListener('click', () => {
    chainReset();
    renderChain();
  });
  chainDom.simulate.addEventListener('click', () => {
    if (chain.iteration === 0) {
      // auto-plan first so the agent doesn't wander with V ≡ 0
      chainRunToConv();
      const kick = setInterval(() => {
        if (!chain.running) {
          clearInterval(kick);
          chainSimulateAgent();
        }
      }, 80);
    } else {
      chainSimulateAgent();
    }
  });
  window.addEventListener('resize', renderChainDeltaChart);
  renderChain();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChain, { once: true });
} else {
  initChain();
}

/* =====================================================================
   Monte-Carlo darts demo (Reinforcement Learning §5). Throws uniform samples in [-1, 1]² and
   counts how many fall inside the unit circle. The hit ratio × 4 estimates
   π. Same pattern as every MC return estimate: draw samples, take the
   mean, O(1/√n) error regardless of dimension.
   ==================================================================== */

const darts = {
  throws: 0,
  hits: 0,
  running: false,
  rafId: null,
  lastRenderThrows: 0
};

const dartsDom = {};

function dartsStepBatch(n) {
  const ctx = dartsDom.ctx;
  const size = dartsDom.canvas ? Math.min(dartsDom.canvas.clientWidth, dartsDom.canvas.clientHeight) : 0;
  const half = size / 2;
  const cx = size / 2;
  const cy = size / 2;
  if (ctx && size > 0) {
    // Draw each dart as a single pixel. Colour tells inside/outside.
    for (let i = 0; i < n; i += 1) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const inside = x * x + y * y <= 1;
      darts.throws += 1;
      if (inside) darts.hits += 1;
      const px = cx + x * half;
      const py = cy - y * half;
      ctx.fillStyle = inside ? 'rgba(59, 130, 246, 0.85)' : 'rgba(148, 163, 184, 0.55)';
      ctx.fillRect(px, py, 1.5, 1.5);
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      darts.throws += 1;
      if (x * x + y * y <= 1) darts.hits += 1;
    }
  }
}

function dartsDrawOutline() {
  const ctx = dartsDom.ctx;
  const canvas = dartsDom.canvas;
  if (!ctx || !canvas) return;
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
  const cx = cssW / 2;
  const cy = cssH / 2;
  const half = size / 2;
  // Square
  ctx.strokeStyle = 'rgba(148,163,184,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - half, cy - half, size, size);
  // Circle
  ctx.strokeStyle = 'rgba(59,130,246,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, half, 0, Math.PI * 2);
  ctx.stroke();
}

function dartsRenderStats() {
  if (!dartsDom.throwsEl) return;
  dartsDom.throwsEl.textContent = darts.throws.toString();
  dartsDom.hitsEl.textContent = darts.hits.toString();
  if (darts.throws === 0) {
    dartsDom.piEl.textContent = '—';
    dartsDom.errEl.textContent = '—';
    return;
  }
  const piHat = (4 * darts.hits) / darts.throws;
  dartsDom.piEl.textContent = piHat.toFixed(5);
  dartsDom.errEl.textContent = `${Math.abs(piHat - Math.PI).toExponential(2)}`;
}

function dartsReset() {
  darts.throws = 0;
  darts.hits = 0;
  dartsRunStop();
  dartsDrawOutline();
  dartsRenderStats();
}

function dartsRunLoop() {
  if (!darts.running) return;
  // ~2000 darts per RAF tick keeps things fluid; stop at 10 k from scratch.
  dartsStepBatch(500);
  dartsRenderStats();
  if (darts.throws >= darts.lastRenderThrows + 10000) {
    darts.running = false;
    dartsSetUI(false);
    return;
  }
  darts.rafId = requestAnimationFrame(dartsRunLoop);
}

function dartsRunStart() {
  if (darts.running) return;
  darts.running = true;
  darts.lastRenderThrows = darts.throws;
  dartsSetUI(true);
  darts.rafId = requestAnimationFrame(dartsRunLoop);
}

function dartsRunStop() {
  darts.running = false;
  if (darts.rafId) cancelAnimationFrame(darts.rafId);
  darts.rafId = null;
  dartsSetUI(false);
}

function dartsSetUI(running) {
  if (!dartsDom.run) return;
  dartsDom.run.hidden = running;
  dartsDom.pause.hidden = !running;
  [dartsDom.step, dartsDom.reset].forEach((el) => { if (el) el.disabled = running; });
}

function initDarts() {
  dartsDom.canvas = document.getElementById('darts-canvas');
  if (!dartsDom.canvas) return;
  dartsDom.ctx = dartsDom.canvas.getContext('2d');
  dartsDom.step = document.getElementById('darts-step');
  dartsDom.run = document.getElementById('darts-run');
  dartsDom.pause = document.getElementById('darts-pause');
  dartsDom.reset = document.getElementById('darts-reset');
  dartsDom.throwsEl = document.getElementById('darts-throws');
  dartsDom.hitsEl = document.getElementById('darts-hits');
  dartsDom.piEl = document.getElementById('darts-pi');
  dartsDom.errEl = document.getElementById('darts-err');

  dartsDom.step.addEventListener('click', () => {
    dartsRunStop();
    dartsStepBatch(100);
    dartsRenderStats();
  });
  dartsDom.run.addEventListener('click', dartsRunStart);
  dartsDom.pause.addEventListener('click', dartsRunStop);
  dartsDom.reset.addEventListener('click', dartsReset);
  window.addEventListener('resize', () => {
    // Resize clears the canvas; best we can do without re-sampling is redraw
    // the outline and let the user reset if they want a fresh histogram.
    dartsDrawOutline();
  });
  dartsDrawOutline();
  dartsRenderStats();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarts, { once: true });
} else {
  initDarts();
}

/* =====================================================================
   Bayesian coin demo (Reinforcement Learning §1). Beta(α, β) prior × Bernoulli likelihood =
   Beta(α+h, β+t) posterior. The canvas plots three curves over p ∈ [0, 1]:
     - prior (blue fill, faded)
     - likelihood p^h (1-p)^t, rescaled to the plot's max so its *shape* is
       visible; it is NOT a density in p and does not integrate to 1.
     - posterior (orange, bold).
   Posterior mean α/(α+β), MAP (α-1)/(α+β-2), and a 95% credible interval
   from the Beta CDF are shown live in the sidebar.
   ==================================================================== */

const bayes = {
  alpha0: 1,
  beta0: 1,
  h: 0,
  t: 0,
  hiddenP: 0.7
};

const bayesDom = {};

function logGamma(x) {
  // Stirling / Lanczos approximation, good enough for Beta shape params up to ~1e3.
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xx = x - 1;
  let a = c[0];
  const tt = xx + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(tt) - tt + Math.log(a);
}

function betaLogPdf(p, a, b) {
  if (p <= 0 || p >= 1) return -Infinity;
  return (a - 1) * Math.log(p) + (b - 1) * Math.log(1 - p)
    - (logGamma(a) + logGamma(b) - logGamma(a + b));
}

function bernoulliLogLik(p, h, t) {
  if (p <= 0 && h > 0) return -Infinity;
  if (p >= 1 && t > 0) return -Infinity;
  // p^h (1-p)^t as a function of p, evaluated in log-space for stability.
  return (h > 0 ? h * Math.log(Math.max(p, 1e-300)) : 0)
    + (t > 0 ? t * Math.log(Math.max(1 - p, 1e-300)) : 0);
}

/**
 * Beta-distribution inverse CDF via bisection on the regularised incomplete
 * Beta function. Accuracy is ~1e-4 with 40 iterations, plenty for drawing
 * a 95% credible interval on the plot.
 */
function betaICDF(q, a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i += 1) {
    const mid = 0.5 * (lo + hi);
    const cdf = betaCDF(mid, a, b);
    if (cdf < q) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function betaCDF(x, a, b) {
  // Continued-fraction expansion for the regularised incomplete beta function,
  // per Numerical Recipes. Returns I_x(a, b).
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
  return 1 - bt * betacf(1 - x, b, a) / b;
}

function betacf(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function renderBayes() {
  const canvas = bayesDom.canvas;
  const ctx = bayesDom.ctx;
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const pad = { top: 12, right: 14, bottom: 24, left: 36 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;

  const a0 = bayes.alpha0;
  const b0 = bayes.beta0;
  const a = a0 + bayes.h;
  const b = b0 + bayes.t;

  const N = 200;
  const ps = new Float64Array(N + 1);
  const prior = new Float64Array(N + 1);
  const lik = new Float64Array(N + 1);
  const post = new Float64Array(N + 1);
  let maxCurve = 1e-12;
  let maxLikRaw = -Infinity;
  for (let i = 0; i <= N; i += 1) {
    const p = i / N;
    ps[i] = p;
    prior[i] = Math.exp(betaLogPdf(p, a0, b0));
    post[i] = Math.exp(betaLogPdf(p, a, b));
    const logL = bernoulliLogLik(p, bayes.h, bayes.t);
    lik[i] = logL;
    if (logL > maxLikRaw) maxLikRaw = logL;
    if (prior[i] > maxCurve) maxCurve = prior[i];
    if (post[i] > maxCurve) maxCurve = post[i];
  }
  // Rescale likelihood so its *shape* fits the plot — emphasise that this
  // is not a density in p.
  const likScale = maxCurve > 0 ? maxCurve : 1;
  for (let i = 0; i <= N; i += 1) {
    lik[i] = isFinite(lik[i])
      ? likScale * Math.exp(lik[i] - maxLikRaw)
      : 0;
  }

  // Axes
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = '11px "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  [0, 0.25, 0.5, 0.75, 1].forEach((p) => {
    const x = pad.left + plotW * p;
    ctx.fillText(p.toFixed(2), x, pad.top + plotH + 4);
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
  });
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('p', pad.left - 8, pad.top + plotH / 2);

  const drawCurve = (arr, color, fillAlpha, width) => {
    const path = new Path2D();
    for (let i = 0; i <= N; i += 1) {
      const x = pad.left + plotW * (i / N);
      const y = pad.top + plotH - plotH * Math.min(arr[i] / (maxCurve * 1.1), 1);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    if (fillAlpha > 0) {
      const fill = new Path2D(path);
      fill.lineTo(pad.left + plotW, pad.top + plotH);
      fill.lineTo(pad.left, pad.top + plotH);
      fill.closePath();
      ctx.fillStyle = color.replace(')', `, ${fillAlpha})`).replace('rgb', 'rgba');
      ctx.fill(fill);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(path);
  };

  drawCurve(prior, 'rgb(59,130,246)', 0.18, 1.5);
  if (bayes.h > 0 || bayes.t > 0) {
    drawCurve(lik, 'rgb(168,85,247)', 0, 1.5);
  }
  drawCurve(post, 'rgb(249,115,22)', 0.12, 2.2);

  // 95% credible interval bracket under the posterior
  if (bayes.h + bayes.t > 0) {
    const lo = betaICDF(0.025, a, b);
    const hi = betaICDF(0.975, a, b);
    const y = pad.top + plotH - 4;
    const xLo = pad.left + plotW * lo;
    const xHi = pad.left + plotW * hi;
    ctx.strokeStyle = 'rgb(249,115,22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xLo, y);
    ctx.lineTo(xHi, y);
    ctx.moveTo(xLo, y - 4);
    ctx.lineTo(xLo, y + 4);
    ctx.moveTo(xHi, y - 4);
    ctx.lineTo(xHi, y + 4);
    ctx.stroke();
  }
}

function renderBayesStats() {
  if (!bayesDom.h) return;
  bayesDom.h.textContent = bayes.h.toString();
  bayesDom.t.textContent = bayes.t.toString();
  const a = bayes.alpha0 + bayes.h;
  const b = bayes.beta0 + bayes.t;
  const mean = a / (a + b);
  const mode = a > 1 && b > 1 ? (a - 1) / (a + b - 2) : mean;
  const variance = (a * b) / (((a + b) ** 2) * (a + b + 1));
  bayesDom.mean.textContent = mean.toFixed(3);
  bayesDom.map.textContent = mode.toFixed(3);
  bayesDom.sd.textContent = Math.sqrt(variance).toFixed(3);
  if (bayes.h + bayes.t > 0) {
    const lo = betaICDF(0.025, a, b);
    const hi = betaICDF(0.975, a, b);
    bayesDom.ci.textContent = `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
  } else {
    bayesDom.ci.textContent = '—';
  }
}

function bayesRedraw() {
  renderBayes();
  renderBayesStats();
}

function initBayes() {
  bayesDom.canvas = document.getElementById('bayes-canvas');
  if (!bayesDom.canvas) return;
  bayesDom.ctx = bayesDom.canvas.getContext('2d');
  bayesDom.alpha = document.getElementById('bayes-alpha');
  bayesDom.beta = document.getElementById('bayes-beta');
  bayesDom.heads = document.getElementById('bayes-heads');
  bayesDom.tails = document.getElementById('bayes-tails');
  bayesDom.flip = document.getElementById('bayes-flip');
  bayesDom.reset = document.getElementById('bayes-reset');
  bayesDom.h = document.getElementById('bayes-h');
  bayesDom.t = document.getElementById('bayes-t');
  bayesDom.mean = document.getElementById('bayes-mean');
  bayesDom.map = document.getElementById('bayes-map');
  bayesDom.sd = document.getElementById('bayes-sd');
  bayesDom.ci = document.getElementById('bayes-ci');

  const readPriors = () => {
    const a = Math.max(0.5, Math.min(50, parseFloat(bayesDom.alpha.value) || 1));
    const b = Math.max(0.5, Math.min(50, parseFloat(bayesDom.beta.value) || 1));
    bayes.alpha0 = a;
    bayes.beta0 = b;
    bayesDom.alpha.value = a;
    bayesDom.beta.value = b;
  };

  bayesDom.alpha.addEventListener('change', () => { readPriors(); bayesRedraw(); });
  bayesDom.beta.addEventListener('change', () => { readPriors(); bayesRedraw(); });
  bayesDom.heads.addEventListener('click', () => { bayes.h += 1; bayesRedraw(); });
  bayesDom.tails.addEventListener('click', () => { bayes.t += 1; bayesRedraw(); });
  bayesDom.flip.addEventListener('click', () => {
    for (let i = 0; i < 10; i += 1) {
      if (Math.random() < bayes.hiddenP) bayes.h += 1; else bayes.t += 1;
    }
    bayesRedraw();
  });
  bayesDom.reset.addEventListener('click', () => {
    bayes.h = 0;
    bayes.t = 0;
    bayesRedraw();
  });
  window.addEventListener('resize', renderBayes);
  bayesRedraw();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBayes, { once: true });
} else {
  initBayes();
}

/* ========================================================================
   Beta-Bernoulli Thompson bandit (§1). Three arms with hidden Bernoulli
   rates; the agent keeps Beta(α, β) posteriors starting at Beta(1, 1);
   each step it draws θ_i ~ Beta per arm, pulls argmax, observes 0/1,
   and updates pseudocounts. Uses beta.js primitives. */

const BB_COLORS = ['#3b82f6', '#f97316', '#22c55e'];
const BB_ARM_LABELS = ['A', 'B', 'C'];

function bbHexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

function bbRenderArmCanvas(canvas, alpha, beta, truth, lastSample, color, showTruth) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const PAD_L = 18;
  const PAD_R = 18;
  const PAD_T = 6;
  const PAD_B = 14;
  const xToPx = (x) => PAD_L + x * (W - PAD_L - PAD_R);

  const N = 80;
  let maxY = 0;
  const values = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const v = betaPDF(i / N, alpha, beta);
    values[i] = v;
    if (v > maxY) maxY = v;
  }
  const peak = 1.15 * (maxY || 1);
  const yToPx = (y) => H - PAD_B - (Math.min(y, peak) / peak) * (H - PAD_T - PAD_B);

  // baseline + axis labels
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_L, H - PAD_B);
  ctx.lineTo(W - PAD_R, H - PAD_B);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('0', xToPx(0), H - 2);
  ctx.fillText('0.5', xToPx(0.5), H - 2);
  ctx.fillText('1', xToPx(1), H - 2);

  // filled PDF
  ctx.beginPath();
  ctx.moveTo(xToPx(0), H - PAD_B);
  for (let i = 0; i <= N; i++) ctx.lineTo(xToPx(i / N), yToPx(values[i]));
  ctx.lineTo(xToPx(1), H - PAD_B);
  ctx.closePath();
  ctx.fillStyle = bbHexToRgba(color, 0.2);
  ctx.fill();

  // curve stroke
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const px = xToPx(i / N);
    const py = yToPx(values[i]);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // ground-truth tick (green dashed)
  if (showTruth && Number.isFinite(truth)) {
    ctx.strokeStyle = 'rgba(22, 163, 74, 0.9)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xToPx(truth), H - PAD_B);
    ctx.lineTo(xToPx(truth), PAD_T);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // last sampled θ (red dot + line)
  if (Number.isFinite(lastSample)) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.beginPath();
    ctx.moveTo(xToPx(lastSample), H - PAD_B);
    ctx.lineTo(xToPx(lastSample), PAD_T + 4);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(xToPx(lastSample), PAD_T + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function initBetaBandit() {
  const armsContainer = document.querySelector('[data-beta-bandit-arms]');
  if (!armsContainer) return;

  const state = {
    alpha: [1, 1, 1],
    beta: [1, 1, 1],
    lastSample: [NaN, NaN, NaN],
    lastPulled: -1,
    t: 0,
    reward: 0,
    optimalPulls: 0,
    revealed: true,
    running: false,
    raf: null
  };

  const armTiles = BB_ARM_LABELS.map((letter, i) => {
    const tile = document.createElement('div');
    tile.className = 'beta-bandit__arm';
    tile.innerHTML = `
      <header>
        <span class="beta-bandit__label" style="color:${BB_COLORS[i]}">Arm ${letter}</span>
        <span class="beta-bandit__truth" data-truth="${i}"></span>
      </header>
      <canvas width="240" height="90"></canvas>
      <dl class="beta-bandit__stats">
        <dt>α</dt><dd data-alpha="${i}">1</dd>
        <dt>β</dt><dd data-beta="${i}">1</dd>
        <dt>pulls</dt><dd data-pulls="${i}">0</dd>
        <dt>E[p]</dt><dd data-mean="${i}">0.500</dd>
      </dl>
    `;
    armsContainer.appendChild(tile);
    return tile;
  });

  const dom = {
    pSliders: [0, 1, 2].map((i) => document.getElementById(`bb-p${BB_ARM_LABELS[i]}`)),
    pVals:    [0, 1, 2].map((i) => document.getElementById(`bb-p${BB_ARM_LABELS[i]}-val`)),
    tOut:       document.getElementById('bb-t'),
    rewardOut:  document.getElementById('bb-reward'),
    regretOut:  document.getElementById('bb-regret'),
    optimalOut: document.getElementById('bb-optimal'),
    stepBtn:    document.getElementById('bb-step'),
    runBtn:     document.getElementById('bb-run'),
    runBigBtn:  document.getElementById('bb-run-big'),
    resetBtn:   document.getElementById('bb-reset'),
    revealBtn:  document.getElementById('bb-reveal')
  };

  const truePs = () => dom.pSliders.map((s) => parseFloat(s.value));

  function bestArm(p) {
    let best = 0;
    for (let i = 1; i < 3; i++) if (p[i] > p[best]) best = i;
    return best;
  }

  function stepOnce() {
    const p = truePs();
    const samples = [0, 1, 2].map((i) => sampleBeta(state.alpha[i], state.beta[i]));
    state.lastSample = samples;
    let action = 0;
    for (let i = 1; i < 3; i++) if (samples[i] > samples[action]) action = i;
    state.lastPulled = action;
    const reward = Math.random() < p[action] ? 1 : 0;
    state.alpha[action] += reward;
    state.beta[action] += 1 - reward;
    state.t += 1;
    state.reward += reward;
    if (action === bestArm(p)) state.optimalPulls += 1;
  }

  function stopRun() {
    state.running = false;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  }

  function render() {
    const p = truePs();
    armTiles.forEach((tile, i) => {
      const canvas = tile.querySelector('canvas');
      bbRenderArmCanvas(
        canvas,
        state.alpha[i],
        state.beta[i],
        p[i],
        state.lastSample[i],
        BB_COLORS[i],
        state.revealed
      );
      tile.querySelector(`[data-alpha="${i}"]`).textContent = String(state.alpha[i]);
      tile.querySelector(`[data-beta="${i}"]`).textContent = String(state.beta[i]);
      const pulls = state.alpha[i] + state.beta[i] - 2;
      tile.querySelector(`[data-pulls="${i}"]`).textContent = String(pulls);
      tile.querySelector(`[data-mean="${i}"]`).textContent = betaMean(state.alpha[i], state.beta[i]).toFixed(3);
      const truthEl = tile.querySelector(`[data-truth="${i}"]`);
      truthEl.textContent = state.revealed ? `true p = ${p[i].toFixed(2)}` : '';
      tile.classList.toggle('is-pulled', state.lastPulled === i);
    });

    dom.pSliders.forEach((s, i) => {
      dom.pVals[i].textContent = parseFloat(s.value).toFixed(2);
    });

    dom.tOut.textContent = String(state.t);
    dom.rewardOut.textContent = String(state.reward);
    const bestP = p[bestArm(p)];
    const regret = bestP * state.t - state.reward;
    dom.regretOut.textContent = regret.toFixed(2);
    dom.optimalOut.textContent = state.t > 0 ? `${((state.optimalPulls / state.t) * 100).toFixed(0)}%` : '—';
  }

  function reset() {
    state.alpha = [1, 1, 1];
    state.beta = [1, 1, 1];
    state.lastSample = [NaN, NaN, NaN];
    state.lastPulled = -1;
    state.t = 0;
    state.reward = 0;
    state.optimalPulls = 0;
    stopRun();
  }

  function runN(total) {
    stopRun();
    let remaining = total;
    state.running = true;
    const tick = () => {
      if (!state.running) return;
      const k = Math.min(6, remaining);
      for (let i = 0; i < k; i++) stepOnce();
      remaining -= k;
      render();
      if (remaining > 0) {
        state.raf = requestAnimationFrame(tick);
      } else {
        stopRun();
      }
    };
    state.raf = requestAnimationFrame(tick);
  }

  dom.pSliders.forEach((s) => s.addEventListener('input', render));
  dom.stepBtn.addEventListener('click', () => { stopRun(); stepOnce(); render(); });
  dom.runBtn.addEventListener('click', () => runN(50));
  dom.runBigBtn.addEventListener('click', () => runN(500));
  dom.resetBtn.addEventListener('click', () => { reset(); render(); });
  dom.revealBtn.addEventListener('click', () => {
    state.revealed = !state.revealed;
    dom.revealBtn.textContent = state.revealed ? 'Hide true p' : 'Reveal true p';
    render();
  });

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBetaBandit, { once: true });
} else {
  initBetaBandit();
}
