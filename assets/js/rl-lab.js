/* RL Lab — multi-armed bandit simulator. Three strategies (ε-greedy, UCB1,
   Thompson) share one update loop; the page renders the arms, a running
   chart of rolling reward / cumulative regret / optimal-arm rate, and a
   live stats sidebar. Pure vanilla JS, no dependencies. */

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
  V: new Array(CHAIN.n).fill(0),
  policy: new Array(CHAIN.n).fill(1),
  iteration: 0,
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

function chainReset() {
  chain.V = new Array(CHAIN.n).fill(0);
  chain.policy = new Array(CHAIN.n).fill(1);
  chain.iteration = 0;
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
    valueIterStep();
    renderChain();
    if (chain.delta < CHAIN.convergeTol || chain.iteration > 500) {
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
    ctx.fillText('Press “Value-iter step” to plot Δ_max per iteration', cssW / 2, cssH / 2);
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
  chainDom.deltaCanvas = document.getElementById('chain-delta-chart');
  chainDom.deltaCtx = chainDom.deltaCanvas?.getContext('2d') ?? null;

  chainDom.step.addEventListener('click', () => {
    chainStopRun();
    valueIterStep();
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
