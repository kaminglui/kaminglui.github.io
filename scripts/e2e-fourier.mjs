import http from 'node:http';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const guessChromePath = () => {
  const candidates = [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe'
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return null;
};

const contentTypeFor = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml; charset=utf-8',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf'
    }[ext] ?? 'application/octet-stream'
  );
};

const serveRepo = () =>
  new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = (req.url ?? '/').split('?')[0];
        const requestPath = decodeURIComponent(url);
        if (requestPath === '/favicon.ico') {
          res.writeHead(204);
          res.end();
          return;
        }
        const relative = requestPath.replace(/^\//, '');
        const resolved = path.resolve(repoRoot, relative || '');
        const safe = resolved.startsWith(repoRoot) ? resolved : null;
        const finalPath = safe && requestPath.endsWith('/') ? path.join(safe, 'index.html') : safe;
        if (!finalPath) {
          res.writeHead(400);
          res.end('bad request');
          return;
        }
        const data = await fs.readFile(finalPath);
        res.setHeader('Content-Type', contentTypeFor(finalPath));
        res.writeHead(200);
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });

const assertNoHorizontalOverflow = async (page, label) => {
  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      bodyClientWidth: document.body?.clientWidth ?? null,
      bodyScrollWidth: document.body?.scrollWidth ?? null
    };
  });

  if (info.scrollWidth > info.clientWidth + 1) {
    throw new Error(
      `[${label}] horizontal overflow: scrollWidth=${info.scrollWidth} clientWidth=${info.clientWidth} (body=${info.bodyScrollWidth}/${info.bodyClientWidth})`
    );
  }
};

const assertToolbarsInViewport = async (page, label) => {
  const result = await page.evaluate(() => {
    const viewportW = document.documentElement.clientWidth;
    const toolbars = Array.from(document.querySelectorAll('.fourier-toolbar')).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return { viewportW, toolbars };
  });

  for (const [idx, r] of result.toolbars.entries()) {
    if (r.left < -1 || r.right > result.viewportW + 1) {
      throw new Error(
        `[${label}] toolbar ${idx} out of viewport: left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} viewportW=${result.viewportW}`
      );
    }
  }
};

const assertKaTeXCheckpoints = async (page, label) => {
  try {
    await page.waitForFunction(
      () => !!document.querySelector('#math-dft .katex') && !!document.querySelector('#math-recon .katex'),
      { timeout: 10_000 }
    );
  } catch {
    const info = await page.evaluate(() => ({
      dft: !!document.querySelector('#math-dft .katex'),
      recon: !!document.querySelector('#math-recon .katex')
    }));
    throw new Error(`[${label}] KaTeX checkpoints not rendered (dft=${info.dft} recon=${info.recon})`);
  }

  const inlineCount = await page.evaluate(() => document.querySelectorAll('.fourier-inline-math .katex').length);
  if (inlineCount < 3) {
    throw new Error(`[${label}] expected inline KaTeX variables in page copy (count=${inlineCount})`);
  }
};

const assertMobileHeaderMenuToggles = async (page, label) => {
  const toggle = await page.$('.nav-toggle');
  if (!toggle) throw new Error(`[${label}] missing .nav-toggle`);

  const navLinks = await page.$('.nav-links');
  if (!navLinks) throw new Error(`[${label}] missing .nav-links`);

  await toggle.click();
  await page.waitForFunction(
    () => document.querySelector('.nav-links')?.getAttribute('data-visible') === 'true',
    { timeout: 5_000 }
  );

  await toggle.click();
  await page.waitForFunction(
    () => document.querySelector('.nav-links')?.getAttribute('data-visible') === 'false',
    { timeout: 5_000 }
  );
};

const assertToolbarDropdownHoverStable = async (page, label) => {
  const buttonSelector = '.fourier-toolbar--top button[title="Presets"]';
  const menuSelector = `${buttonSelector} + div`;

  const button = await page.$(buttonSelector);
  if (!button) throw new Error(`[${label}] missing presets dropdown button`);

  await page.hover(buttonSelector);
  await page.waitForFunction(
    (selector) => {
      const menu = document.querySelector(selector);
      return !!menu && getComputedStyle(menu).display !== 'none';
    },
    { timeout: 5_000 },
    menuSelector
  );

  const menu = await page.$(menuSelector);
  if (!menu) throw new Error(`[${label}] missing presets dropdown menu`);
  const box = await menu.boundingBox();
  if (!box) throw new Error(`[${label}] missing presets dropdown menu bounding box`);

  await page.mouse.move(box.x + Math.min(12, box.width / 2), box.y + Math.min(12, box.height / 2));
  await delay(200);

  const stillVisible = await page.evaluate((selector) => {
    const menu = document.querySelector(selector);
    return !!menu && getComputedStyle(menu).display !== 'none';
  }, menuSelector);

  if (!stillVisible) {
    throw new Error(`[${label}] presets dropdown collapsed while hovering menu`);
  }
};

const drawAndAssertFinalizes = async (page, label) => {
  const canvas = await page.$('canvas');
  if (!canvas) throw new Error(`[${label}] missing canvas`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`[${label}] missing canvas bounding box`);

  const within = (dx, dy) => [box.x + box.width * dx, box.y + box.height * dy];
  const start = within(0.25, 0.3);
  const mid = within(0.55, 0.55);
  const end = within(0.35, 0.75);
  const outside = [box.x + box.width + 60, box.y + box.height * 0.4];

  await page.evaluate(
    ({ start, mid, end, outside }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('missing canvas');
      const pointerId = 1;
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        width: 1,
        height: 1,
        pressure: 0.5
      };

      const dispatch = (target, type, x, y, buttons) => {
        const ev = new PointerEvent(type, {
          ...base,
          clientX: x,
          clientY: y,
          button: 0,
          buttons
        });
        target.dispatchEvent(ev);
      };

      const lerp = (a, b, t) => a + (b - a) * t;
      const moveSteps = (from, to, steps, buttons) => {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          dispatch(canvas, 'pointermove', lerp(from[0], to[0], t), lerp(from[1], to[1], t), buttons);
        }
      };

      dispatch(canvas, 'pointerdown', start[0], start[1], 1);
      moveSteps(start, mid, 12, 1);
      moveSteps(mid, end, 12, 1);
      moveSteps(end, outside, 6, 1);
      dispatch(window, 'pointerup', outside[0], outside[1], 0);
    },
    { start, mid, end, outside }
  );

  await delay(800);

  const state = await page.$eval('.fourier-stage', (el) => ({
    drawing: el.getAttribute('data-drawing'),
    hasSpectrum: el.getAttribute('data-has-spectrum'),
    points: el.getAttribute('data-points')
  }));

  if (state.drawing !== 'false') {
    throw new Error(`[${label}] drawing did not stop (data-drawing=${state.drawing})`);
  }
  if (state.hasSpectrum !== 'true') {
    throw new Error(`[${label}] Fourier spectrum not computed after draw (data-has-spectrum=${state.hasSpectrum})`);
  }
  if (!state.points || Number(state.points) < 2) {
    throw new Error(`[${label}] expected points>=2 after draw (data-points=${state.points})`);
  }

  const after = within(0.2, 0.2);
  await page.evaluate(({ after }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const ev = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      pointerType: 'mouse',
      isPrimary: false,
      clientX: after[0],
      clientY: after[1],
      button: 0,
      buttons: 0
    });
    canvas.dispatchEvent(ev);
  }, { after });
  await delay(200);
  const drawingAfterMove = await page.$eval('.fourier-stage', (el) => el.getAttribute('data-drawing'));
  if (drawingAfterMove !== 'false') {
    throw new Error(`[${label}] drawing resumed without button pressed (data-drawing=${drawingAfterMove})`);
  }
};

const assertMathPanelToggleFits = async (page, label) => {
  const toggleSelector = '.fourier-toolbar--top button[title="Toggle Math Panel"]';
  const panelSelector = '.fourier-math-panel';

  const existing = await page.$(panelSelector);
  if (existing) {
    throw new Error(`[${label}] math panel should be hidden by default`);
  }

  const toggle = await page.$(toggleSelector);
  if (!toggle) throw new Error(`[${label}] missing math toggle button`);
  await toggle.click();

  await page.waitForSelector(panelSelector, { timeout: 10_000 });

  const info = await page.evaluate(() => {
    const panel = document.querySelector('.fourier-math-panel');
    const stage = document.querySelector('.fourier-stage');
    if (!panel || !stage) return null;
    const pr = panel.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const style = getComputedStyle(panel);
    return {
      overflowY: style.overflowY,
      top: pr.top,
      left: pr.left,
      right: pr.right,
      bottom: pr.bottom,
      stageTop: sr.top,
      stageLeft: sr.left,
      stageRight: sr.right,
      stageBottom: sr.bottom
    };
  });

  if (!info) throw new Error(`[${label}] missing math panel/stage for fit check`);
  if (info.overflowY !== 'auto' && info.overflowY !== 'scroll') {
    throw new Error(`[${label}] expected math panel overflow-y auto/scroll (got ${info.overflowY})`);
  }
  if (info.top < info.stageTop - 1 || info.left < info.stageLeft - 1 || info.right > info.stageRight + 1 || info.bottom > info.stageBottom + 1) {
    throw new Error(
      `[${label}] math panel out of stage bounds: panel=(${info.left.toFixed(1)},${info.top.toFixed(1)})-(${info.right.toFixed(1)},${info.bottom.toFixed(1)}) stage=(${info.stageLeft.toFixed(1)},${info.stageTop.toFixed(1)})-(${info.stageRight.toFixed(1)},${info.stageBottom.toFixed(1)})`
    );
  }
};

const runCase = async (browser, baseUrl, { label, viewport }) => {
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (e) => errors.push(e?.stack || String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    errors.push(`requestfailed:${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
  });

  await page.setViewport(viewport);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.fourier-stage', { timeout: 30_000 });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  // Wait for Tailwind CDN to apply (toolbars rely on utility classes).
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('.fourier-toolbar');
    if (!toolbar) return false;
    const flexCandidate = toolbar.querySelector('.flex') ?? toolbar;
    return getComputedStyle(flexCandidate).display === 'flex';
  }, { timeout: 30_000 });
  await delay(500);

  if (errors.length) {
    throw new Error(`[${label}] console/page errors:\n${errors.join('\n')}`);
  }

  await assertNoHorizontalOverflow(page, label);
  await assertToolbarsInViewport(page, label);
  await assertKaTeXCheckpoints(page, label);
  if (label === 'mobile') {
    await assertMobileHeaderMenuToggles(page, label);
  } else {
    await assertToolbarDropdownHoverStable(page, label);
  }
  await drawAndAssertFinalizes(page, label);
  await assertMathPanelToggleFits(page, label);

  await page.close();
};

const run = async () => {
  const chromePath = process.env.CHROME_PATH || guessChromePath();
  if (!chromePath) {
    console.error('Could not locate Chrome/Edge. Set CHROME_PATH to run this test.');
    process.exit(2);
  }

  const { server, port } = await serveRepo();
  const baseUrl = `http://127.0.0.1:${port}/pages/fourier-epicycles/`;

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox']
  });

  try {
    await runCase(browser, baseUrl, {
      label: 'desktop',
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }
    });

    await runCase(browser, baseUrl, {
      label: 'mobile',
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true }
    });

    console.log(JSON.stringify({ ok: true, url: baseUrl }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
