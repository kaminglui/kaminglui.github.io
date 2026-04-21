/* Classical Machine Learning Lab — three independent demos:
   (1) Linear regression via closed-form OLS.
   (2) Logistic regression via gradient descent on cross-entropy.
   (3) Linear SVM via subgradient descent on hinge + ½‖w‖² with slack C.
   Each demo has its own state + DOM table; shared helpers up top. */

/* --------------- shared helpers --------------- */

const WORLD = 3; // [-3, 3] × [-3, 3] in all three canvases

function sizeCanvas(canvas) {
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
function worldToPx(x, y, cssW, cssH, size) {
  const s = size / (2 * WORLD);
  return [cssW / 2 + x * s, cssH / 2 - y * s];
}
function pxToWorld(px, py, cssW, cssH, size) {
  const s = (2 * WORLD) / size;
  return [(px - cssW / 2) * s, -(py - cssH / 2) * s];
}
function gaussianSample() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function drawAxes(ctx, cssW, cssH) {
  ctx.strokeStyle = 'rgba(148,163,184,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cssH / 2);
  ctx.lineTo(cssW, cssH / 2);
  ctx.moveTo(cssW / 2, 0);
  ctx.lineTo(cssW / 2, cssH);
  ctx.stroke();
}

/* ====================== 1 · Linear regression ====================== */

const linreg = {
  preset: 'clean',
  points: [],
  showResiduals: true
};
const linDom = {};

function linregSample(preset) {
  const pts = [];
  if (preset === 'none') return pts;
  const n = preset === 'outlier' ? 15 : 25;
  for (let i = 0; i < n; i += 1) {
    const x = -2.2 + 4.4 * (i / (n - 1)) + 0.2 * gaussianSample();
    const trueY = 0.8 * x + 0.5;
    const noise = preset === 'noisy' ? 0.9 : 0.25;
    pts.push([x, trueY + noise * gaussianSample()]);
  }
  if (preset === 'outlier') pts.push([2.4, -2.6]);
  return pts;
}

function linregFit() {
  const pts = linreg.points;
  if (pts.length < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i += 1) { sx += pts[i][0]; sy += pts[i][1]; }
  const mx = sx / pts.length;
  const my = sy / pts.length;
  let num = 0;
  let den = 0;
  let ssTot = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const dx = pts[i][0] - mx;
    const dy = pts[i][1] - my;
    num += dx * dy;
    den += dx * dx;
    ssTot += dy * dy;
  }
  if (den < 1e-12) return null;
  const w = num / den;
  const b = my - w * mx;
  let sse = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const r = pts[i][1] - (w * pts[i][0] + b);
    sse += r * r;
  }
  const rmse = Math.sqrt(sse / pts.length);
  const r2 = ssTot < 1e-12 ? 0 : 1 - sse / ssTot;
  return { w, b, sse, rmse, r2, mean: [mx, my] };
}

function linregRender() {
  const canvas = linDom.canvas;
  if (!canvas) return;
  const { ctx, cssW, cssH, size } = sizeCanvas(canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  drawAxes(ctx, cssW, cssH);
  const fit = linregFit();
  if (fit) {
    // Draw residual lines under the points.
    if (linreg.showResiduals) {
      ctx.strokeStyle = 'rgba(249,115,22,0.45)';
      ctx.lineWidth = 1;
      linreg.points.forEach(([x, y]) => {
        const yHat = fit.w * x + fit.b;
        const [px, py] = worldToPx(x, y, cssW, cssH, size);
        const [qx, qy] = worldToPx(x, yHat, cssW, cssH, size);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(qx, qy);
        ctx.stroke();
      });
    }
    // Fit line.
    const [lx0, ly0] = worldToPx(-WORLD, fit.w * -WORLD + fit.b, cssW, cssH, size);
    const [lx1, ly1] = worldToPx(WORLD, fit.w * WORLD + fit.b, cssW, cssH, size);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
  }
  // Points.
  ctx.fillStyle = 'rgba(59,130,246,0.9)';
  linreg.points.forEach(([x, y]) => {
    const [px, py] = worldToPx(x, y, cssW, cssH, size);
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function linregRenderStats() {
  const fit = linregFit();
  linDom.n.textContent = linreg.points.length.toString();
  if (!fit) {
    linDom.w.textContent = '—';
    linDom.b.textContent = '—';
    linDom.rmse.textContent = '—';
    linDom.r2.textContent = '—';
    linDom.sse.textContent = '—';
    return;
  }
  linDom.w.textContent = fit.w.toFixed(3);
  linDom.b.textContent = fit.b.toFixed(3);
  linDom.rmse.textContent = fit.rmse.toFixed(3);
  linDom.r2.textContent = fit.r2.toFixed(3);
  linDom.sse.textContent = fit.sse.toFixed(3);
}

function linregRedraw() {
  linregRender();
  linregRenderStats();
}

function initLinreg() {
  linDom.canvas = document.getElementById('linreg-canvas');
  if (!linDom.canvas) return;
  linDom.n = document.getElementById('linreg-n');
  linDom.w = document.getElementById('linreg-w');
  linDom.b = document.getElementById('linreg-b');
  linDom.rmse = document.getElementById('linreg-rmse');
  linDom.r2 = document.getElementById('linreg-r2');
  linDom.sse = document.getElementById('linreg-sse');
  linDom.resample = document.getElementById('linreg-resample');
  linDom.residuals = document.getElementById('linreg-residuals');
  linDom.clear = document.getElementById('linreg-clear');
  linDom.presetBtns = Array.from(document.querySelectorAll('[data-linreg-preset]'));

  linDom.presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      linreg.preset = btn.getAttribute('data-linreg-preset');
      linDom.presetBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      linreg.points = linregSample(linreg.preset);
      linregRedraw();
    });
  });
  linDom.resample.addEventListener('click', () => {
    linreg.points = linregSample(linreg.preset);
    linregRedraw();
  });
  linDom.residuals.addEventListener('click', () => {
    linreg.showResiduals = !linreg.showResiduals;
    linregRedraw();
  });
  linDom.clear.addEventListener('click', () => {
    linreg.points = [];
    linregRedraw();
  });
  linDom.canvas.addEventListener('click', (e) => {
    const rect = linDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const [wx, wy] = pxToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, size);
    linreg.points.push([wx, wy]);
    linregRedraw();
  });
  window.addEventListener('resize', linregRender);

  linreg.points = linregSample('clean');
  linregRedraw();
}

/* ====================== 2 · Logistic regression ====================== */

const logreg = {
  preset: 'separated',
  activeClass: 1, // 0 or 1
  points: [], // [{x, y, label}]
  w: [0, 0],
  b: 0,
  step: 0,
  lr: 0.1
};
const logDom = {};

function logregSample(preset) {
  if (preset === 'none') return [];
  const out = [];
  const n = 40;
  for (let i = 0; i < n; i += 1) {
    const label = i < n / 2 ? 1 : 0;
    const cx = label === 1 ? -1.2 : 1.2;
    const cy = label === 1 ? -0.9 : 0.9;
    const spread = preset === 'overlap' ? 0.9 : 0.45;
    out.push({ x: cx + spread * gaussianSample(), y: cy + spread * gaussianSample(), label });
  }
  return out;
}
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

function logregGDStep() {
  const pts = logreg.points;
  if (pts.length < 2) return;
  let gw0 = 0;
  let gw1 = 0;
  let gb = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const z = logreg.w[0] * p.x + logreg.w[1] * p.y + logreg.b;
    const err = sigmoid(z) - p.label;
    gw0 += err * p.x;
    gw1 += err * p.y;
    gb += err;
  }
  const N = pts.length;
  logreg.w[0] -= logreg.lr * (gw0 / N);
  logreg.w[1] -= logreg.lr * (gw1 / N);
  logreg.b -= logreg.lr * (gb / N);
  logreg.step += 1;
}

function logregMetrics() {
  const pts = logreg.points;
  if (pts.length === 0) return { loss: null, acc: null, np: 0, nn: 0 };
  let loss = 0;
  let correct = 0;
  let np = 0;
  let nn = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (p.label === 1) np += 1; else nn += 1;
    const z = logreg.w[0] * p.x + logreg.w[1] * p.y + logreg.b;
    const s = sigmoid(z);
    // Clamp for numerical stability.
    const eps = 1e-9;
    const ps = Math.min(Math.max(s, eps), 1 - eps);
    loss += -(p.label * Math.log(ps) + (1 - p.label) * Math.log(1 - ps));
    if ((s > 0.5 ? 1 : 0) === p.label) correct += 1;
  }
  return { loss: loss / pts.length, acc: correct / pts.length, np, nn };
}

function logregRender() {
  const canvas = logDom.canvas;
  if (!canvas) return;
  const { ctx, cssW, cssH, size } = sizeCanvas(canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  // Probability heatmap underneath (coarse grid).
  const gridN = 48;
  const cellW = size / gridN;
  const cellH = size / gridN;
  const originX = cssW / 2 - size / 2;
  const originY = cssH / 2 - size / 2;
  for (let j = 0; j < gridN; j += 1) {
    for (let i = 0; i < gridN; i += 1) {
      const wx = -WORLD + ((i + 0.5) / gridN) * 2 * WORLD;
      const wy = WORLD - ((j + 0.5) / gridN) * 2 * WORLD;
      const z = logreg.w[0] * wx + logreg.w[1] * wy + logreg.b;
      const p = sigmoid(z);
      // Blend orange (p=0) to blue (p=1) through purple at 0.5.
      const r = Math.round(249 * (1 - p) + 59 * p);
      const g = Math.round(115 * (1 - p) + 130 * p);
      const b = Math.round(22 * (1 - p) + 246 * p);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
      ctx.fillRect(originX + i * cellW, originY + j * cellH, cellW + 1, cellH + 1);
    }
  }
  drawAxes(ctx, cssW, cssH);

  // Decision boundary p = 0.5 ⇒ w·x + b = 0
  if (Math.abs(logreg.w[0]) + Math.abs(logreg.w[1]) > 1e-6) {
    ctx.strokeStyle = 'rgba(168,85,247,0.85)';
    ctx.lineWidth = 2;
    // Line: w0 x + w1 y + b = 0 → y = -(w0 x + b)/w1 when w1≠0
    const drawBoundary = (x0, x1) => {
      if (Math.abs(logreg.w[1]) > 1e-6) {
        const yA = -(logreg.w[0] * x0 + logreg.b) / logreg.w[1];
        const yB = -(logreg.w[0] * x1 + logreg.b) / logreg.w[1];
        const [ax, ay] = worldToPx(x0, yA, cssW, cssH, size);
        const [bx, by] = worldToPx(x1, yB, cssW, cssH, size);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      } else if (Math.abs(logreg.w[0]) > 1e-6) {
        const xV = -logreg.b / logreg.w[0];
        const [ax, ay] = worldToPx(xV, -WORLD, cssW, cssH, size);
        const [bx, by] = worldToPx(xV, WORLD, cssW, cssH, size);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    };
    drawBoundary(-WORLD, WORLD);
  }

  // Points
  logreg.points.forEach((p) => {
    const [px, py] = worldToPx(p.x, p.y, cssW, cssH, size);
    ctx.fillStyle = p.label === 1 ? 'rgba(59,130,246,0.9)' : 'rgba(249,115,22,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
}

function logregRenderStats() {
  const m = logregMetrics();
  logDom.nc.textContent = `${m.np} / ${m.nn}`;
  logDom.w.textContent = `(${logreg.w[0].toFixed(2)}, ${logreg.w[1].toFixed(2)})`;
  logDom.b.textContent = logreg.b.toFixed(3);
  logDom.step.textContent = logreg.step.toString();
  logDom.loss.textContent = m.loss === null ? '—' : m.loss.toFixed(4);
  logDom.acc.textContent = m.acc === null ? '—' : `${(m.acc * 100).toFixed(1)}%`;
}

function logregRedraw() {
  logregRender();
  logregRenderStats();
}

function logregResetWeights() {
  logreg.w = [0, 0];
  logreg.b = 0;
  logreg.step = 0;
}

function initLogreg() {
  logDom.canvas = document.getElementById('logreg-canvas');
  if (!logDom.canvas) return;
  logDom.fit = document.getElementById('logreg-fit');
  logDom.step1 = document.getElementById('logreg-step');
  logDom.reset = document.getElementById('logreg-reset');
  logDom.clear = document.getElementById('logreg-clear');
  logDom.classButtons = Array.from(document.querySelectorAll('[data-logreg-class]'));
  logDom.presetBtns = Array.from(document.querySelectorAll('[data-logreg-preset]'));
  logDom.nc = document.getElementById('logreg-nc');
  logDom.w = document.getElementById('logreg-w');
  logDom.b = document.getElementById('logreg-b');
  logDom.step = document.getElementById('logreg-step');
  logDom.loss = document.getElementById('logreg-loss');
  logDom.acc = document.getElementById('logreg-acc');

  logDom.classButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      logreg.activeClass = parseInt(btn.getAttribute('data-logreg-class'), 10);
      logDom.classButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
  logDom.presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      logreg.preset = btn.getAttribute('data-logreg-preset');
      logDom.presetBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      logreg.points = logregSample(logreg.preset);
      logregResetWeights();
      logregRedraw();
    });
  });
  logDom.fit.addEventListener('click', () => {
    for (let i = 0; i < 500; i += 1) logregGDStep();
    logregRedraw();
  });
  logDom.step1.addEventListener('click', () => {
    logregGDStep();
    logregRedraw();
  });
  logDom.reset.addEventListener('click', () => {
    logregResetWeights();
    logregRedraw();
  });
  logDom.clear.addEventListener('click', () => {
    logreg.points = [];
    logregResetWeights();
    logregRedraw();
  });
  logDom.canvas.addEventListener('click', (e) => {
    const rect = logDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const [wx, wy] = pxToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, size);
    logreg.points.push({ x: wx, y: wy, label: logreg.activeClass });
    logregRedraw();
  });
  window.addEventListener('resize', logregRender);

  logreg.points = logregSample('separated');
  logregResetWeights();
  logregRedraw();
}

/* ====================== 3 · Linear SVM (hinge + L2) ====================== */

const svm = {
  preset: 'separated',
  activeClass: 1, // +1 or -1
  points: [], // [{x, y, label: +1/-1}]
  w: [0, 0],
  b: 0,
  step: 0,
  C: 1,
  lr: 0.01
};
const svmDom = {};

function svmSample(preset) {
  if (preset === 'none') return [];
  const out = [];
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    const label = i < n / 2 ? 1 : -1;
    const cx = label === 1 ? -1.3 : 1.3;
    const cy = label === 1 ? -1 : 1;
    const spread = preset === 'overlap' ? 1.0 : 0.4;
    out.push({ x: cx + spread * gaussianSample(), y: cy + spread * gaussianSample(), label });
  }
  return out;
}

function svmSubgradStep() {
  const pts = svm.points;
  if (pts.length < 2) return;
  // Objective: ½‖w‖² + C · Σ max(0, 1 − y_i (w·x_i + b))
  // Subgradient: w + C Σ_{violating i} (−y_i x_i); b: C Σ_{violating i} (−y_i)
  let gw0 = svm.w[0];
  let gw1 = svm.w[1];
  let gb = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const m = p.label * (svm.w[0] * p.x + svm.w[1] * p.y + svm.b);
    if (m < 1) {
      gw0 += svm.C * (-p.label * p.x);
      gw1 += svm.C * (-p.label * p.y);
      gb += svm.C * (-p.label);
    }
  }
  const N = pts.length;
  svm.w[0] -= svm.lr * (gw0 / N);
  svm.w[1] -= svm.lr * (gw1 / N);
  svm.b -= svm.lr * (gb / N);
  svm.step += 1;
}

function svmMetrics() {
  const wNorm = Math.sqrt(svm.w[0] ** 2 + svm.w[1] ** 2);
  let svCount = 0;
  let np = 0;
  let nn = 0;
  svm.points.forEach((p) => {
    if (p.label === 1) np += 1; else nn += 1;
    const m = p.label * (svm.w[0] * p.x + svm.w[1] * p.y + svm.b);
    if (m < 1 + 1e-3) svCount += 1;
  });
  return {
    wNorm,
    margin: wNorm > 1e-6 ? 2 / wNorm : null,
    sv: svCount,
    np,
    nn
  };
}

function svmRender() {
  const canvas = svmDom.canvas;
  if (!canvas) return;
  const { ctx, cssW, cssH, size } = sizeCanvas(canvas);
  ctx.clearRect(0, 0, cssW, cssH);
  drawAxes(ctx, cssW, cssH);

  if (Math.abs(svm.w[0]) + Math.abs(svm.w[1]) > 1e-6) {
    const drawLine = (offset, color, width, dashed) => {
      // {w·x + b = offset}. Pick two x extremes and solve for y (unless w1 ≈ 0).
      if (dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (Math.abs(svm.w[1]) > 1e-6) {
        const yA = (offset - svm.w[0] * -WORLD - svm.b) / svm.w[1];
        const yB = (offset - svm.w[0] * WORLD - svm.b) / svm.w[1];
        const [ax, ay] = worldToPx(-WORLD, yA, cssW, cssH, size);
        const [bx, by] = worldToPx(WORLD, yB, cssW, cssH, size);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      } else {
        const xV = (offset - svm.b) / svm.w[0];
        const [ax, ay] = worldToPx(xV, -WORLD, cssW, cssH, size);
        const [bx, by] = worldToPx(xV, WORLD, cssW, cssH, size);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    drawLine(0, 'rgba(168,85,247,0.9)', 2, false);
    drawLine(1, 'rgba(168,85,247,0.45)', 1.3, true);
    drawLine(-1, 'rgba(168,85,247,0.45)', 1.3, true);
  }

  svm.points.forEach((p) => {
    const [px, py] = worldToPx(p.x, p.y, cssW, cssH, size);
    ctx.fillStyle = p.label === 1 ? 'rgba(59,130,246,0.9)' : 'rgba(249,115,22,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    const m = p.label * (svm.w[0] * p.x + svm.w[1] * p.y + svm.b);
    if (m < 1 + 1e-3 && Math.abs(svm.w[0]) + Math.abs(svm.w[1]) > 1e-6) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function svmRenderStats() {
  const m = svmMetrics();
  svmDom.nc.textContent = `${m.np} / ${m.nn}`;
  svmDom.w.textContent = `(${svm.w[0].toFixed(2)}, ${svm.w[1].toFixed(2)})`;
  svmDom.b.textContent = svm.b.toFixed(3);
  svmDom.margin.textContent = m.margin === null ? '—' : m.margin.toFixed(3);
  svmDom.step.textContent = svm.step.toString();
  svmDom.sv.textContent = m.sv.toString();
}

function svmRedraw() {
  svmRender();
  svmRenderStats();
}

function svmResetWeights() {
  svm.w = [0, 0];
  svm.b = 0;
  svm.step = 0;
}

function initSVM() {
  svmDom.canvas = document.getElementById('svm-canvas');
  if (!svmDom.canvas) return;
  svmDom.fit = document.getElementById('svm-fit');
  svmDom.step1 = document.getElementById('svm-step');
  svmDom.reset = document.getElementById('svm-reset');
  svmDom.clear = document.getElementById('svm-clear');
  svmDom.classButtons = Array.from(document.querySelectorAll('[data-svm-class]'));
  svmDom.presetBtns = Array.from(document.querySelectorAll('[data-svm-preset]'));
  svmDom.c = document.getElementById('svm-c');
  svmDom.cValue = document.getElementById('svm-c-value');
  svmDom.nc = document.getElementById('svm-nc');
  svmDom.w = document.getElementById('svm-w');
  svmDom.b = document.getElementById('svm-b');
  svmDom.margin = document.getElementById('svm-margin');
  svmDom.step = document.getElementById('svm-step');
  svmDom.sv = document.getElementById('svm-sv');

  svmDom.classButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      svm.activeClass = parseInt(btn.getAttribute('data-svm-class'), 10);
      svmDom.classButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
  svmDom.presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      svm.preset = btn.getAttribute('data-svm-preset');
      svmDom.presetBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      svm.points = svmSample(svm.preset);
      svmResetWeights();
      svmRedraw();
    });
  });
  svmDom.c.addEventListener('input', () => {
    svm.C = parseFloat(svmDom.c.value);
    svmDom.cValue.textContent = svm.C.toFixed(2);
  });
  svmDom.fit.addEventListener('click', () => {
    for (let i = 0; i < 500; i += 1) svmSubgradStep();
    svmRedraw();
  });
  svmDom.step1.addEventListener('click', () => {
    svmSubgradStep();
    svmRedraw();
  });
  svmDom.reset.addEventListener('click', () => {
    svmResetWeights();
    svmRedraw();
  });
  svmDom.clear.addEventListener('click', () => {
    svm.points = [];
    svmResetWeights();
    svmRedraw();
  });
  svmDom.canvas.addEventListener('click', (e) => {
    const rect = svmDom.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const [wx, wy] = pxToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, size);
    svm.points.push({ x: wx, y: wy, label: svm.activeClass });
    svmRedraw();
  });
  window.addEventListener('resize', svmRender);

  svm.points = svmSample('separated');
  svmResetWeights();
  svmRedraw();
}

/* ============================ bootstrap ============================ */

function boot() {
  initLinreg();
  initLogreg();
  initSVM();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* =====================================================================
   Clustering demo — K-means and GMM with EM. Ported from the former
   ml-playground module (now merged into this lab). IIFE keeps its own
   scope so it coexists cleanly with the linreg / logreg / svm demos
   above. Activates on DOMContentLoaded independently of boot().
   ==================================================================== */

const MLPlayground = (() => {
  const POINT_RADIUS = 7;
  const HIT_RADIUS = 14;
  const CENTROID_RADIUS = 10;
  const CLUSTER_COLORS = [
    '#3b82f6',
    '#f97316',
    '#22c55e',
    '#a855f7',
    '#ec4899',
    '#06b6d4',
    '#eab308',
    '#ef4444'
  ];

  let canvas;
  let ctx;
  let kInput;
  let btnInit;
  let btnStep;
  let btnRun;
  let btnReset;
  let btnClear;
  let btnTogglePanel;
  let statusK;
  let statusIter;
  let statusSSE;
  let calculationPanel;
  let calculationSSE;
  let distanceTable;
  let selectedPointLabel;
  let selectedClusterLabel;
  let tabButtons;
  let tabPanels;
  let modeButtons;

  const state = {
    points: [],
    centroids: [],
    currentK: 3,
    iteration: 0,
    selectedPointId: null,
    dragPointId: null,
    activePointerId: null,
    interactionMode: 'create',
    // Clustering algorithm: 'kmeans' (hard assignments) or 'gmm' (soft / EM).
    // GMM components are stored in state.centroids[*].mean/sigma/weight; each
    // point keeps its responsibility vector in point.resp (only in GMM mode).
    algorithm: 'kmeans',
    isRunning: false,
    sse: null,
    logLik: null
  };

  let algoButtons;

  let pixelRatio = 1;

  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `id-${Math.random().toString(36).slice(2, 10)}`;

  function init() {
    canvas = document.getElementById('kmeans-canvas');
    ctx = canvas?.getContext('2d') ?? null;
    kInput = document.getElementById('k-input');
    btnInit = document.getElementById('btn-init-centroids');
    btnStep = document.getElementById('btn-step');
    btnRun = document.getElementById('btn-run');
    btnReset = document.getElementById('btn-reset-clustering');
    btnClear = document.getElementById('btn-clear-points');
    btnTogglePanel = document.getElementById('btn-toggle-calculations');
    statusK = document.getElementById('status-k');
    statusIter = document.getElementById('status-iter');
    statusSSE = document.getElementById('status-sse');
    calculationPanel = document.getElementById('calculation-panel');
    calculationSSE = document.getElementById('calculation-sse');
    distanceTable = document.querySelector('#distance-table tbody');
    selectedPointLabel = document.getElementById('selected-point-label');
    selectedClusterLabel = document.getElementById('selected-cluster-label');
    tabButtons = document.querySelectorAll('.ml-tab');
    tabPanels = document.querySelectorAll('.ml-tab-panel');
    modeButtons = document.querySelectorAll('[data-mode]');
    algoButtons = document.querySelectorAll('[data-algo]');

    if (!canvas || !ctx) return;

    state.currentK = clampK(Number(kInput?.value) || 3);
    updateStatus();
    attachEvents();
    resizeCanvas();
    setInteractionMode('create');
    draw();
  }

  function clampK(value) {
    return Math.min(8, Math.max(1, Math.round(value)));
  }

  function attachEvents() {
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    modeButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode') ?? 'create';
        setInteractionMode(mode);
      });
    });

    algoButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        const algo = button.getAttribute('data-algo') ?? 'kmeans';
        if (algo === state.algorithm) return;
        state.algorithm = algo;
        algoButtons.forEach((b) => {
          const active = b === button;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const metricLabel = document.getElementById('status-metric-label');
        if (metricLabel) metricLabel.textContent = algo === 'gmm' ? 'log ℒ' : 'SSE';
        // Re-initialise so the visualisation switches cleanly.
        resetAssignments();
        if (state.points.length >= state.currentK) {
          initializeCentroids(state.currentK);
          if (algo === 'gmm') {
            initGMMFromCentroids();
            gmmEStep();
            gmmMStep();
          } else {
            assignPointsToNearestCentroid();
            recomputeCentroids();
          }
          updateAfterStateChange();
        } else {
          draw();
        }
      });
    });

    tabButtons?.forEach((button) => {
      button.addEventListener('click', () => activateTab(button));
    });

    kInput?.addEventListener('change', () => {
      const newK = clampK(Number(kInput.value));
      kInput.value = String(newK);
      state.currentK = newK;
      state.iteration = 0;
      statusIter.textContent = '0';
      statusK.textContent = String(newK);
      resetAssignments();
      if (state.points.length >= state.currentK) {
        initializeCentroids(state.currentK);
        assignPointsToNearestCentroid();
        recomputeCentroids();
        updateAfterStateChange();
      } else {
        updateSSE(null);
        draw();
      }
    });

    btnInit?.addEventListener('click', () => {
      state.iteration = 0;
      const initialized = initializeCentroids(state.currentK);
      if (initialized) {
        if (state.algorithm === 'gmm') {
          initGMMFromCentroids();
          gmmEStep();
          gmmMStep();
        } else {
          assignPointsToNearestCentroid();
          recomputeCentroids();
        }
      }
      updateAfterStateChange();
    });

    btnStep?.addEventListener('click', () => {
      if (!ensureCentroids()) return;
      if (state.algorithm === 'gmm') stepGMM();
      else stepKMeans();
      draw();
    });

    btnRun?.addEventListener('click', () => {
      runToConvergence();
    });

    btnReset?.addEventListener('click', () => {
      resetAssignments();
      draw();
    });

    btnClear?.addEventListener('click', () => {
      clearAll();
    });

    btnTogglePanel?.addEventListener('click', () => {
      const isExpanded = btnTogglePanel.getAttribute('aria-expanded') === 'true';
      btnTogglePanel.setAttribute('aria-expanded', String(!isExpanded));
      btnTogglePanel.textContent = isExpanded ? 'Show calculation process' : 'Hide calculation process';
      if (calculationPanel) {
        calculationPanel.hidden = isExpanded;
      }
      updateCalculationPanel();
    });

    // Sample-data presets: pick a shape, populate the canvas with a synthetic
    // point cloud, and kick off a fresh K-means run so the reader sees the
    // different behaviours (clean separation vs. overlap vs. non-spherical)
    // without having to click-paint points themselves.
    document.querySelectorAll('.ml-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.preset || 'separated';
        loadPreset(kind);
      });
    });
  }

  function loadPreset(kind) {
    clearAll();
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || canvas.width;
    const H = rect.height || canvas.height;
    const rand = seededRandom(0xC0FFEE ^ kind.length);
    const gauss = (cx, cy, spread, count) => {
      for (let i = 0; i < count; i += 1) {
        // Box-Muller sample for a nicer-looking cluster than uniform noise.
        const u1 = Math.max(1e-6, rand());
        const u2 = rand();
        const r = Math.sqrt(-2 * Math.log(u1)) * spread;
        const theta = 2 * Math.PI * u2;
        addPoint(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
      }
    };

    if (kind === 'separated') {
      state.currentK = 3;
      gauss(W * 0.25, H * 0.3, 20, 22);
      gauss(W * 0.75, H * 0.35, 22, 22);
      gauss(W * 0.5,  H * 0.75, 24, 22);
    } else if (kind === 'overlap') {
      state.currentK = 3;
      gauss(W * 0.4, H * 0.45, 55, 28);
      gauss(W * 0.6, H * 0.55, 55, 28);
      gauss(W * 0.5, H * 0.5,  40, 18);
    } else if (kind === 'moons') {
      state.currentK = 2;
      // Two interlocking crescents — the classic case where K-means struggles
      // because the clusters aren't convex blobs.
      for (let i = 0; i < 42; i += 1) {
        const t = rand() * Math.PI;
        const jitter = (rand() - 0.5) * 14;
        addPoint(W * 0.35 + Math.cos(t) * 120 + jitter, H * 0.55 - Math.sin(t) * 80 + jitter);
        addPoint(W * 0.65 - Math.cos(t) * 120 + jitter, H * 0.45 + Math.sin(t) * 80 + jitter);
      }
    }
    if (kInput) kInput.value = String(state.currentK);
    updateStatus();
    initializeCentroids(state.currentK);
    assignPointsToNearestCentroid();
    recomputeCentroids();
    updateAfterStateChange();
  }

  // Tiny seeded PRNG so every click of the same preset produces the same point
  // cloud — reproducible demos are easier to reason about.
  function seededRandom(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function handlePointerDown(event) {
    const position = getCanvasPosition(event);
    const existingPoint = findPointAt(position.x, position.y);

    if (event.shiftKey && existingPoint) {
      removePoint(existingPoint.id);
      return;
    }

    if (existingPoint) {
      state.selectedPointId = existingPoint.id;
      if (state.interactionMode === 'drag') {
        state.dragPointId = existingPoint.id;
        state.activePointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
      }
      draw();
      updateCalculationPanel();
      return;
    }

    if (!event.shiftKey && state.interactionMode === 'create') {
      addPoint(position.x, position.y);
      if (state.centroids.length) {
        assignPointsToNearestCentroid();
        recomputeCentroids();
        updateAfterStateChange();
      } else {
        draw();
      }
    }
  }

  function handlePointerMove(event) {
    if (!state.dragPointId || state.activePointerId !== event.pointerId) return;
    const position = getCanvasPosition(event);
    const point = state.points.find((p) => p.id === state.dragPointId);
    if (point) {
      point.x = position.x;
      point.y = position.y;
      draw();
      updateCalculationPanel();
    }
  }

  function handlePointerUp(event) {
    if (!state.dragPointId || state.activePointerId !== event.pointerId) return;
    state.dragPointId = null;
    state.activePointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (state.centroids.length) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
      updateAfterStateChange(false);
    } else {
      updateCalculationPanel();
      draw();
    }
  }

  function addPoint(x, y) {
    const newPoint = { id: createId(), x, y, clusterIndex: null };
    state.points.push(newPoint);
    state.selectedPointId = newPoint.id;
    updateCalculationPanel();
  }

  function removePoint(id) {
    state.points = state.points.filter((point) => point.id !== id);
    if (state.selectedPointId === id) {
      state.selectedPointId = null;
    }
    if (state.points.length === 0) {
      state.centroids = [];
    }
    if (state.centroids.length && state.points.length) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
    }
    updateAfterStateChange(false);
  }

  function findPointAt(x, y) {
    return state.points.find((point) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      return distance <= HIT_RADIUS;
    });
  }

  function resetAssignments() {
    state.centroids = [];
    state.points = state.points.map((point) => ({ ...point, clusterIndex: null }));
    state.iteration = 0;
    state.selectedPointId = state.points[0]?.id ?? null;
    updateSSE(null);
    updateStatus();
    updateCalculationPanel();
  }

  function clearAll() {
    state.points = [];
    state.centroids = [];
    state.iteration = 0;
    state.selectedPointId = null;
    updateSSE(null);
    updateStatus();
    updateCalculationPanel();
    draw();
  }

  function getCanvasPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / pixelRatio / rect.width;
    const scaleY = canvas.height / pixelRatio / rect.height;
    return {
      x: (event.clientX - rect.left) * (Number.isFinite(scaleX) ? scaleX : 1),
      y: (event.clientY - rect.top) * (Number.isFinite(scaleY) ? scaleY : 1)
    };
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = rect.width * pixelRatio;
    canvas.height = rect.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    draw();
  }

  function setInteractionMode(mode) {
    state.interactionMode = mode === 'drag' ? 'drag' : 'create';
    modeButtons?.forEach((button) => {
      const isActive = button.getAttribute('data-mode') === state.interactionMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function activateTab(button) {
    const targetId = button.getAttribute('aria-controls');
    tabButtons?.forEach((tab) => {
      const isActive = tab === button;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabPanels?.forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    });

    if (targetId === 'panel-playground') {
      window.requestAnimationFrame(resizeCanvas);
    }
  }

  function initializeCentroids(k) {
    if (state.points.length < k) {
      updateSSE(null);
      return false;
    }

    const shuffled = [...state.points].sort(() => Math.random() - 0.5);
    state.centroids = shuffled.slice(0, k).map((point, index) => ({
      id: createId(),
      x: point.x,
      y: point.y,
      color: CLUSTER_COLORS[index % CLUSTER_COLORS.length]
    }));
    state.points = state.points.map((p) => ({ ...p, clusterIndex: null }));
    return true;
  }

  function ensureCentroids() {
    if (state.centroids.length) return true;
    const initialized = initializeCentroids(state.currentK);
    if (initialized) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
      updateAfterStateChange();
    }
    return initialized;
  }

  function assignPointsToNearestCentroid() {
    if (!state.centroids.length) return false;
    let changed = false;
    state.points.forEach((point) => {
      let closestIndex = point.clusterIndex ?? 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      state.centroids.forEach((centroid, index) => {
        const distSq = distanceSquared(point, centroid);
        if (distSq < closestDistance) {
          closestDistance = distSq;
          closestIndex = index;
        }
      });
      if (point.clusterIndex !== closestIndex) {
        changed = true;
        point.clusterIndex = closestIndex;
      }
    });
    return changed;
  }

  function recomputeCentroids() {
    if (!state.centroids.length) return;
    state.centroids.forEach((centroid, index) => {
      const assigned = state.points.filter((point) => point.clusterIndex === index);
      if (!assigned.length) return;
      const sum = assigned.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 }
      );
      centroid.x = sum.x / assigned.length;
      centroid.y = sum.y / assigned.length;
    });
  }

  function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function computeSSE() {
    if (!state.centroids.length) return null;
    return state.points.reduce((sum, point) => {
      if (point.clusterIndex === null || !state.centroids[point.clusterIndex]) return sum;
      return sum + distanceSquared(point, state.centroids[point.clusterIndex]);
    }, 0);
  }

  /**
   * Seed GMM parameters from already-placed centroid positions.
   * Each component gets an equal mixing weight π_k = 1/K and an isotropic
   * variance seeded from the median pairwise distance to the centroid.
   * Keeping covariances isotropic (σ² I) instead of full 2×2 avoids the
   * ellipse-degeneration cases that bite vanilla EM on small data sets.
   */
  function initGMMFromCentroids() {
    if (!state.centroids.length || !state.points.length) return;
    const k = state.centroids.length;
    // Start σ from the average distance of every point to its nearest centroid.
    let sumD = 0;
    let n = 0;
    state.points.forEach((p) => {
      let best = Infinity;
      state.centroids.forEach((c) => {
        const d2 = distanceSquared(p, c);
        if (d2 < best) best = d2;
      });
      sumD += best;
      n += 1;
    });
    const seedVar = Math.max(sumD / Math.max(n, 1), 100); // guard against σ → 0
    state.centroids.forEach((c) => {
      c.variance = seedVar;
      c.weight = 1 / k;
    });
    state.points.forEach((p) => {
      p.resp = new Array(k).fill(1 / k);
      p.clusterIndex = 0; // kept for drawing fallbacks and the calc panel.
    });
  }

  /**
   * E-step: compute the responsibility matrix r_{i,k}.
   *   r_{i,k} = π_k · 𝒩(x_i; μ_k, σ_k² I) / Σ_j π_j · 𝒩(x_i; μ_j, σ_j² I)
   * Uses log-sum-exp for numerical stability — without it responsibilities
   * underflow for points far from every component.
   */
  function gmmEStep() {
    if (!state.centroids.length) return;
    const k = state.centroids.length;
    state.points.forEach((p) => {
      const logs = new Array(k);
      let maxLog = -Infinity;
      for (let j = 0; j < k; j += 1) {
        const c = state.centroids[j];
        const v = Math.max(c.variance, 1);
        const d2 = distanceSquared(p, c);
        // log[π_j 𝒩(x; μ_j, v·I)] for 2-D isotropic: log π − log(2πv) − d²/(2v)
        const logp = Math.log(Math.max(c.weight, 1e-12)) - Math.log(2 * Math.PI * v) - d2 / (2 * v);
        logs[j] = logp;
        if (logp > maxLog) maxLog = logp;
      }
      let denom = 0;
      for (let j = 0; j < k; j += 1) denom += Math.exp(logs[j] - maxLog);
      p.resp = new Array(k);
      for (let j = 0; j < k; j += 1) p.resp[j] = Math.exp(logs[j] - maxLog) / denom;
      // Hard label for display purposes = argmax of soft responsibilities.
      let bestJ = 0;
      let bestR = -Infinity;
      for (let j = 0; j < k; j += 1) {
        if (p.resp[j] > bestR) { bestR = p.resp[j]; bestJ = j; }
      }
      p.clusterIndex = bestJ;
    });
  }

  /**
   * M-step: re-estimate μ_k, σ_k², π_k from the responsibilities.
   *   N_k = Σ_i r_{i,k}; μ_k = (1/N_k) Σ r_{i,k} x_i;
   *   σ_k² = (1/(D·N_k)) Σ r_{i,k} ‖x_i − μ_k‖² (isotropic, D = 2 here);
   *   π_k = N_k / N.
   */
  function gmmMStep() {
    if (!state.centroids.length || !state.points.length) return;
    const k = state.centroids.length;
    const N = state.points.length;
    const nK = new Array(k).fill(0);
    const sumX = new Array(k).fill(0);
    const sumY = new Array(k).fill(0);
    state.points.forEach((p) => {
      for (let j = 0; j < k; j += 1) {
        nK[j] += p.resp[j];
        sumX[j] += p.resp[j] * p.x;
        sumY[j] += p.resp[j] * p.y;
      }
    });
    for (let j = 0; j < k; j += 1) {
      const c = state.centroids[j];
      if (nK[j] > 1e-9) {
        c.x = sumX[j] / nK[j];
        c.y = sumY[j] / nK[j];
        c.weight = nK[j] / N;
      }
    }
    // second pass for variance, now that means are updated.
    const sumD2 = new Array(k).fill(0);
    state.points.forEach((p) => {
      for (let j = 0; j < k; j += 1) {
        const c = state.centroids[j];
        sumD2[j] += p.resp[j] * distanceSquared(p, c);
      }
    });
    for (let j = 0; j < k; j += 1) {
      const c = state.centroids[j];
      if (nK[j] > 1e-9) {
        // D = 2 for the 2-D canvas.
        c.variance = Math.max(sumD2[j] / (2 * nK[j]), 50);
      }
    }
  }

  function computeLogLik() {
    if (!state.centroids.length || !state.points.length) return null;
    const k = state.centroids.length;
    let ll = 0;
    state.points.forEach((p) => {
      let maxLog = -Infinity;
      const logs = new Array(k);
      for (let j = 0; j < k; j += 1) {
        const c = state.centroids[j];
        const v = Math.max(c.variance, 1);
        const d2 = distanceSquared(p, c);
        logs[j] = Math.log(Math.max(c.weight, 1e-12)) - Math.log(2 * Math.PI * v) - d2 / (2 * v);
        if (logs[j] > maxLog) maxLog = logs[j];
      }
      let s = 0;
      for (let j = 0; j < k; j += 1) s += Math.exp(logs[j] - maxLog);
      ll += maxLog + Math.log(s);
    });
    return ll;
  }

  function stepGMM() {
    gmmEStep();
    gmmMStep();
    state.iteration += 1;
    state.logLik = computeLogLik();
    updateStatus();
    updateSSE(computeSSE());
    ensureSelectedPoint();
    updateCalculationPanel();
    // Return "changed" signal for runToConvergence (use log-lik improvement).
    return true;
  }

  function updateSSE(value) {
    state.sse = value;
    const display = value === null ? '—' : value.toFixed(2);
    // In GMM mode the status chip shows log-likelihood instead of SSE.
    if (state.algorithm === 'gmm') {
      const lik = state.logLik === null || !isFinite(state.logLik) ? '—' : state.logLik.toFixed(2);
      statusSSE.textContent = lik;
      calculationSSE.textContent = display;
    } else {
      statusSSE.textContent = display;
      calculationSSE.textContent = display;
    }
  }

  function updateStatus() {
    statusK.textContent = String(state.currentK);
    statusIter.textContent = String(state.iteration);
  }

  function updateAfterStateChange(incrementIteration = false, shouldDraw = true) {
    if (incrementIteration) {
      state.iteration += 1;
      updateStatus();
    } else {
      updateStatus();
    }
    updateSSE(computeSSE());
    ensureSelectedPoint();
    updateCalculationPanel();
    if (shouldDraw) {
      draw();
    }
  }

  function stepKMeans() {
    const changed = assignPointsToNearestCentroid();
    recomputeCentroids();
    state.iteration += 1;
    updateStatus();
    updateSSE(computeSSE());
    ensureSelectedPoint();
    updateCalculationPanel();
    return changed;
  }

  function runToConvergence() {
    if (state.isRunning) return;
    if (!ensureCentroids()) return;

    state.isRunning = true;
    toggleRunButton(true);
    let iterations = 0;
    const maxIterations = 50;

    const loop = () => {
      const changed = state.algorithm === 'gmm' ? stepGMM() : stepKMeans();
      draw();
      iterations += 1;
      if (!changed || iterations >= maxIterations) {
        state.isRunning = false;
        toggleRunButton(false);
        return;
      }
      window.setTimeout(loop, 150);
    };

    loop();
  }

  function toggleRunButton(isRunning) {
    if (!btnRun) return;
    btnRun.disabled = isRunning;
    btnRun.textContent = isRunning ? 'Running…' : 'Run to convergence';
  }

  function draw() {
    if (!ctx) return;
    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // GMM: draw 1σ and 2σ circles for each component before the points.
    if (state.algorithm === 'gmm' && state.centroids.length) {
      state.centroids.forEach((c) => {
        const sigma = Math.sqrt(Math.max(c.variance || 0, 0));
        if (sigma <= 0) return;
        ctx.strokeStyle = c.color;
        ctx.fillStyle = `${c.color}1a`; // ~10% alpha suffix on a 7-char hex
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, sigma, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2 * sigma, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    state.points.forEach((point) => {
      const color = pointColor(point);
      ctx.beginPath();
      ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (state.selectedPointId === point.id) {
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    state.centroids.forEach((centroid, index) => {
      ctx.fillStyle = centroid.color;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(
        centroid.x - CENTROID_RADIUS,
        centroid.y - CENTROID_RADIUS,
        CENTROID_RADIUS * 2,
        CENTROID_RADIUS * 2
      );
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = state.algorithm === 'gmm' && typeof centroid.weight === 'number'
        ? `${index + 1}`
        : `${index + 1}`;
      ctx.fillText(label, centroid.x, centroid.y);
    });
  }

  // In GMM mode blend the point's colour from the component palette weighted
  // by its responsibility vector — a visible measure of "how sure is this
  // point of its membership?" Hard K-means always paints the argmax colour.
  function pointColor(point) {
    if (state.algorithm === 'gmm' && Array.isArray(point.resp) && state.centroids.length) {
      let r = 0;
      let g = 0;
      let b = 0;
      state.centroids.forEach((c, j) => {
        const w = point.resp[j] ?? 0;
        const rgb = hexToRgb(c.color);
        r += w * rgb.r;
        g += w * rgb.g;
        b += w * rgb.b;
      });
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
    if (point.clusterIndex === null) return 'rgba(148, 163, 184, 0.8)';
    return state.centroids[point.clusterIndex]?.color || 'rgba(148, 163, 184, 0.8)';
  }

  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    if (m.length !== 6) return { r: 148, g: 163, b: 184 };
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16)
    };
  }

  function updateCalculationPanel() {
    const hasCentroids = state.centroids.length > 0;
    const selectedPoint = ensureSelectedPoint();

    if (!selectedPoint) {
      selectedPointLabel.textContent = 'none';
      selectedClusterLabel.textContent = '—';
      if (distanceTable) {
        distanceTable.innerHTML = '';
      }
      calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
      return;
    }

    if (!hasCentroids) {
      selectedPointLabel.textContent = `(${selectedPoint.x.toFixed(1)}, ${selectedPoint.y.toFixed(1)})`;
      selectedClusterLabel.textContent = 'Not assigned yet – initialize centroids to begin.';
      if (distanceTable) {
        distanceTable.innerHTML = '';
      }
      calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
      return;
    }

    selectedPointLabel.textContent = `(${selectedPoint.x.toFixed(1)}, ${selectedPoint.y.toFixed(1)})`;
    selectedClusterLabel.textContent = `Assigned to cluster C${(selectedPoint.clusterIndex ?? 0) + 1}`;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    state.centroids.forEach((centroid, index) => {
      const dist = Math.sqrt(distanceSquared(selectedPoint, centroid));
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });

    if (distanceTable) {
      distanceTable.innerHTML = '';
      state.centroids.forEach((centroid, index) => {
        const row = document.createElement('tr');
        const dist = Math.sqrt(distanceSquared(selectedPoint, centroid));

        const cells = [
          `C${index + 1}`,
          `(${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})`,
          dist.toFixed(2),
          index === nearestIndex ? 'Yes' : 'No'
        ];

        cells.forEach((value, cellIndex) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          if (cellIndex === cells.length - 1 && index === nearestIndex) {
            cell.classList.add('ml-table--nearest');
          }
          row.appendChild(cell);
        });

        distanceTable.appendChild(row);
      });
    }

    calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
  }

  function ensureSelectedPoint() {
    if (!state.points.length) {
      state.selectedPointId = null;
      return null;
    }

    const existing = state.points.find((p) => p.id === state.selectedPointId);
    if (existing) return existing;

    const fallback = state.points.find((p) => p.clusterIndex !== null) ?? state.points[0];
    state.selectedPointId = fallback?.id ?? null;
    return fallback ?? null;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  MLPlayground.init();
});
