import http from 'node:http';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

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

const run = async () => {
  const chromePath = process.env.CHROME_PATH || guessChromePath();
  if (!chromePath) {
    console.error('Could not locate Chrome/Edge. Set CHROME_PATH to run this smoke test.');
    process.exit(2);
  }

  const { server, port } = await serveRepo();
  const url = `http://127.0.0.1:${port}/pages/fourier-epicycles/`;

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (e) => errors.push(e?.stack || String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    errors.push(`requestfailed:${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const stageFound = await page.$('.fourier-stage');

  const info = await page.evaluate(() => {
    const stage = document.querySelector('.fourier-stage');
    const toolbar = document.querySelector('.fourier-toolbar');
    const canvas = document.querySelector('canvas');
    const root = document.getElementById('fourier-root');
    const placeholder = document.querySelector('.fourier-placeholder');
    return {
      stage: !!stage,
      toolbar: !!toolbar,
      canvas: !!canvas,
      rootMounted: root?.classList.contains('is-mounted') ?? false,
      placeholderPresent: !!placeholder,
      placeholderText: placeholder ? placeholder.textContent?.trim() ?? '' : null,
      canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
      drawOverlayPresent: !!Array.from(document.querySelectorAll('h1')).find((n) =>
        (n.textContent ?? '').includes('Draw Something')
      )
    };
  });

  console.log(JSON.stringify({ url, info, errors }, null, 2));

  await browser.close();
  server.close();

  if (!stageFound) process.exit(1);
  if (!info.canvas) process.exit(1);
  if (errors.length) process.exit(1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
