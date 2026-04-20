// Transformer Lab — live single-head self-attention on whatever sentence the
// user types. Everything runs locally in the browser: a word-level tokenizer,
// a deterministic seeded embedding per token, fixed Q/K/V projection matrices,
// a real softmax(QK^T/sqrt(d)) attention matrix, and the weighted-sum output.
// Performance matters because the whole pipeline re-runs on every keystroke —
// typed-array math, single-pass DOM diffing, canvas for the NxN heatmap.

const D = 8;              // embedding / projection dimension — small for display
const MAX_TOKENS = 16;    // hard cap so an accidentally-long sentence stays readable
const INPUT_DEBOUNCE_MS = 120;

const root = document.querySelector('[data-tlab]');
if (!root) throw new Error('Transformer Lab: [data-tlab] root missing');

const els = {
  input:       root.querySelector('#tlab-sentence'),
  presets:     root.querySelector('[data-tlab-presets]'),
  stageNav:    root.querySelector('[data-tlab-stages]'),
  panels:      root.querySelectorAll('[data-tlab-panel]'),
  tokenList:   root.querySelector('[data-tlab-tokens]'),
  qkv:         root.querySelector('[data-tlab-qkv]'),
  heatmap:     root.querySelector('[data-tlab-heatmap]'),
  rowLabels:   root.querySelector('[data-tlab-row-labels]'),
  colLabels:   root.querySelector('[data-tlab-col-labels]'),
  rowWeights:  root.querySelector('[data-tlab-row-weights]'),
  output:      root.querySelector('[data-tlab-output]'),
  pickedNote:  root.querySelector('[data-tlab-picked]')
};

/* ------------------------- deterministic math ------------------------- */

// mulberry32 — 32-bit PRNG. Seeded by token hash so the same token always
// maps to the same embedding, which keeps the demo explainable.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 0x811C9DC5;  // FNV-1a offset
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function makeProjectionMatrix(seed) {
  const rng = mulberry32(seed);
  const W = new Float32Array(D * D);
  // Scale by 1/sqrt(D) so Q·K^T has consistent magnitude regardless of D.
  const scale = 1 / Math.sqrt(D);
  for (let i = 0; i < W.length; i += 1) W[i] = (rng() * 2 - 1) * scale;
  return W;
}

// Fixed projections for the whole session — pretend these were learned.
const W_Q = makeProjectionMatrix(0xA1B2C3D4);
const W_K = makeProjectionMatrix(0xB4A5C6D7);
const W_V = makeProjectionMatrix(0xC7D8E9F0);

function embedToken(tok) {
  const rng = mulberry32(hashString(tok) ^ 0xDEADBEEF);
  const v = new Float32Array(D);
  for (let i = 0; i < D; i += 1) v[i] = rng() * 2 - 1;
  return v;
}

function matvec(W, v) {
  const out = new Float32Array(D);
  for (let r = 0; r < D; r += 1) {
    let s = 0;
    for (let c = 0; c < D; c += 1) s += W[r * D + c] * v[c];
    out[r] = s;
  }
  return out;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < D; i += 1) s += a[i] * b[i];
  return s;
}

function softmaxRow(row) {
  let m = -Infinity;
  for (let i = 0; i < row.length; i += 1) if (row[i] > m) m = row[i];
  const out = new Float32Array(row.length);
  let sum = 0;
  for (let i = 0; i < row.length; i += 1) {
    const e = Math.exp(row[i] - m);
    out[i] = e;
    sum += e;
  }
  const inv = sum ? 1 / sum : 0;
  for (let i = 0; i < row.length; i += 1) out[i] *= inv;
  return out;
}

function tokenize(text) {
  const raw = String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
  const clipped = raw.slice(0, MAX_TOKENS - 2);
  return ['[CLS]', ...clipped, '[SEP]'];
}

function computeAttention(tokens) {
  const n = tokens.length;
  const E = tokens.map(embedToken);
  const Q = E.map((e) => matvec(W_Q, e));
  const K = E.map((e) => matvec(W_K, e));
  const V = E.map((e) => matvec(W_V, e));
  const invRoot = 1 / Math.sqrt(D);

  const rawScores = [];
  for (let i = 0; i < n; i += 1) {
    const row = new Float32Array(n);
    for (let j = 0; j < n; j += 1) row[j] = dot(Q[i], K[j]) * invRoot;
    rawScores.push(row);
  }
  const attention = rawScores.map(softmaxRow);

  const output = [];
  for (let i = 0; i < n; i += 1) {
    const o = new Float32Array(D);
    for (let j = 0; j < n; j += 1) {
      const w = attention[i][j];
      for (let c = 0; c < D; c += 1) o[c] += w * V[j][c];
    }
    output.push(o);
  }
  return { n, tokens, E, Q, K, V, rawScores, attention, output };
}

/* --------------------------- app state --------------------------- */

const state = {
  text: els.input.value,
  stage: 'tokens',
  selected: 0,       // index of the token currently highlighted
  computed: null
};

function recompute() {
  const tokens = tokenize(state.text);
  state.computed = computeAttention(tokens);
  if (state.selected >= state.computed.n) state.selected = 0;
}

/* ------------------------------ render ------------------------------ */

// Signed bar visualization — positive = amber, negative = teal. Matches the
// heatmap palette for visual consistency across stages.
function renderVectorBars(container, vec, { height = 48 } = {}) {
  const max = Math.max(...vec.map((v) => Math.abs(v))) || 1;
  const wrap = document.createElement('div');
  wrap.className = 'tlab-bars';
  wrap.style.height = `${height}px`;
  for (let i = 0; i < vec.length; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'tlab-bars__cell';
    const pct = Math.abs(vec[i]) / max;
    const h = Math.max(2, pct * (height * 0.9));
    bar.style.height = `${h}px`;
    bar.classList.add(vec[i] >= 0 ? 'is-pos' : 'is-neg');
    bar.title = `d${i} = ${vec[i].toFixed(3)}`;
    wrap.appendChild(bar);
  }
  container.appendChild(wrap);
}

function renderTokens() {
  const { tokens } = state.computed;
  els.tokenList.innerHTML = '';
  tokens.forEach((tok, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tlab-token';
    btn.textContent = tok;
    btn.dataset.index = String(i);
    if (tok === '[CLS]' || tok === '[SEP]') btn.classList.add('is-sentinel');
    if (i === state.selected) btn.classList.add('is-selected');
    btn.addEventListener('click', () => selectToken(i));
    els.tokenList.appendChild(btn);
  });
}

function renderQKV() {
  const { tokens, Q, K, V } = state.computed;
  const i = state.selected;
  els.qkv.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tlab-qkv__head';
  head.innerHTML = `<span class="tlab-qkv__label">Showing <strong>${escapeHtml(tokens[i])}</strong></span>
    <span class="tlab-qkv__dim">${D}-dim vectors</span>`;
  els.qkv.appendChild(head);

  [['Q', Q[i], 'what it looks for'],
   ['K', K[i], 'what it advertises'],
   ['V', V[i], 'what it carries']].forEach(([name, vec, hint]) => {
    const row = document.createElement('div');
    row.className = 'tlab-qkv__row';
    const label = document.createElement('div');
    label.className = 'tlab-qkv__name';
    label.innerHTML = `<strong>${name}</strong><span>${hint}</span>`;
    row.appendChild(label);
    const barWrap = document.createElement('div');
    barWrap.className = 'tlab-qkv__vector';
    renderVectorBars(barWrap, Array.from(vec));
    row.appendChild(barWrap);
    els.qkv.appendChild(row);
  });
}

// Color ramp for the heatmap: low = pale; high = vivid amber. Max per-pixel
// work is O(n²), but n ≤ 16 so this is a cheap paint even on keystroke.
function heatmapColor(w) {
  const t = Math.max(0, Math.min(1, w));
  // Interpolate between slate-200 (#e2e8f0) and amber-500 (#f59e0b)
  const r = Math.round(226 + (245 - 226) * t);
  const g = Math.round(232 + (158 - 232) * t);
  const b = Math.round(240 + (11  - 240) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderAttention() {
  const { tokens, attention, n } = state.computed;
  const canvas = els.heatmap;
  const ctx = canvas.getContext('2d');
  const size = Math.min(canvas.clientWidth, canvas.clientHeight) || 420;
  // Match internal resolution to CSS size × DPR for crisp rendering.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const pad = 6;
  const cell = (size - pad * 2) / n;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      ctx.fillStyle = heatmapColor(attention[r][c]);
      ctx.fillRect(pad + c * cell, pad + r * cell, cell - 1, cell - 1);
    }
  }
  // Highlight the currently-selected row so it's easy to track across panels.
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    pad - 1,
    pad + state.selected * cell - 1,
    n * cell + 1,
    cell + 1
  );

  renderAxisLabels(els.rowLabels, tokens, true);
  renderAxisLabels(els.colLabels, tokens, false);
  renderRowWeights();
}

function renderAxisLabels(container, tokens, isRows) {
  container.innerHTML = '';
  tokens.forEach((tok, i) => {
    const span = document.createElement('button');
    span.type = 'button';
    span.className = 'tlab-attention__label';
    if (i === state.selected && isRows) span.classList.add('is-selected');
    span.textContent = tok;
    span.addEventListener('click', () => selectToken(i));
    container.appendChild(span);
  });
}

function renderRowWeights() {
  const { tokens, attention } = state.computed;
  const weights = attention[state.selected];
  els.rowWeights.innerHTML = '';
  const title = document.createElement('p');
  title.className = 'tlab-rowweights__title';
  title.innerHTML = `Row for <strong>${escapeHtml(tokens[state.selected])}</strong> — softmax weights sum to 1`;
  els.rowWeights.appendChild(title);

  const row = document.createElement('div');
  row.className = 'tlab-rowweights__bars';
  weights.forEach((w, j) => {
    const cell = document.createElement('div');
    cell.className = 'tlab-rowweights__cell';
    cell.innerHTML = `
      <div class="tlab-rowweights__bar" style="height: ${(w * 100).toFixed(1)}%"></div>
      <div class="tlab-rowweights__label">${escapeHtml(tokens[j])}</div>
      <div class="tlab-rowweights__val">${w.toFixed(2)}</div>
    `;
    cell.title = `α = ${w.toFixed(4)}`;
    els.rowWeights.appendChild(cell);
    row.appendChild(cell);
  });
}

function renderOutput() {
  const { tokens, V, attention, output } = state.computed;
  const i = state.selected;
  els.output.innerHTML = '';

  const intro = document.createElement('div');
  intro.className = 'tlab-output__intro';
  intro.innerHTML = `
    <span class="tlab-output__label">Context vector for <strong>${escapeHtml(tokens[i])}</strong></span>
    <span class="tlab-output__hint">weighted sum of every token's V, using row ${i} of the attention matrix</span>
  `;
  els.output.appendChild(intro);

  const contrib = document.createElement('div');
  contrib.className = 'tlab-output__contrib';
  // Show the top contributors so the blend is legible.
  const weights = attention[i];
  const ranked = Array.from(weights, (w, j) => ({ w, j }))
    .sort((a, b) => b.w - a.w)
    .slice(0, Math.min(weights.length, 5));
  ranked.forEach(({ w, j }) => {
    const row = document.createElement('div');
    row.className = 'tlab-output__row';
    row.innerHTML = `
      <span class="tlab-output__weight">${w.toFixed(2)}</span>
      <span class="tlab-output__token">× V(${escapeHtml(tokens[j])})</span>
    `;
    const bars = document.createElement('div');
    bars.className = 'tlab-output__bars';
    renderVectorBars(bars, Array.from(V[j]), { height: 36 });
    row.appendChild(bars);
    contrib.appendChild(row);
  });
  els.output.appendChild(contrib);

  const sumRow = document.createElement('div');
  sumRow.className = 'tlab-output__row tlab-output__row--sum';
  sumRow.innerHTML = `<span class="tlab-output__weight">=</span><span class="tlab-output__token">context<sub>${i}</sub></span>`;
  const bars = document.createElement('div');
  bars.className = 'tlab-output__bars';
  renderVectorBars(bars, Array.from(output[i]), { height: 44 });
  sumRow.appendChild(bars);
  els.output.appendChild(sumRow);
}

function renderPickedNote() {
  const { tokens, attention } = state.computed;
  const i = state.selected;
  const weights = attention[i];
  let topJ = 0;
  let topW = -Infinity;
  for (let j = 0; j < weights.length; j += 1) {
    if (j === i) continue;
    if (weights[j] > topW) { topW = weights[j]; topJ = j; }
  }
  els.pickedNote.innerHTML = `
    <strong>${escapeHtml(tokens[i])}</strong> attends most strongly to
    <strong>${escapeHtml(tokens[topJ])}</strong> (α = ${topW.toFixed(2)}).
  `;
}

function renderActiveStage() {
  const active = state.stage;
  els.panels.forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.tlabPanel !== active);
  });
  els.stageNav.querySelectorAll('[data-stage]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.stage === active);
  });
  // Render only the active panel — the others defer until their turn so
  // keystroke perf stays snappy even for longer sentences.
  if (active === 'tokens') renderTokens();
  if (active === 'qkv') renderQKV();
  if (active === 'attention') renderAttention();
  if (active === 'output') renderOutput();
  renderPickedNote();
}

function renderAll() {
  renderActiveStage();
  // The token list influences every other stage; keep it fresh even on
  // inactive stages so selection state stays consistent.
  if (state.stage !== 'tokens') renderTokens();
}

/* ---------------------------- interactions ---------------------------- */

function selectToken(i) {
  if (state.computed && i >= 0 && i < state.computed.n && i !== state.selected) {
    state.selected = i;
    renderAll();
  }
}

function selectStage(name) {
  if (state.stage === name) return;
  state.stage = name;
  renderActiveStage();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let inputTimer = null;
els.input.addEventListener('input', () => {
  if (inputTimer) clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    state.text = els.input.value;
    recompute();
    renderAll();
  }, INPUT_DEBOUNCE_MS);
});

els.presets.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  els.input.value = btn.dataset.preset;
  state.text = btn.dataset.preset;
  recompute();
  renderAll();
});

els.stageNav.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-stage]');
  if (!btn) return;
  selectStage(btn.dataset.stage);
});

// Resize the heatmap canvas when the viewport changes so the heatmap stays
// square and crisp on DPR changes (portrait ↔ landscape, zoom, etc.).
window.addEventListener('resize', () => {
  if (state.stage === 'attention') renderAttention();
}, { passive: true });

/* ------------------------------- boot ------------------------------- */

recompute();
renderAll();
