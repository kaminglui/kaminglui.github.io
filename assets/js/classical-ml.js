/* Classical ML Lab — three independent demos:
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
