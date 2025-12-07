const mixerKaraokeUrl = new URL('./templates/mixer-karaoke.json', import.meta.url);

async function loadJson(url) {
  // Prefer fetch in browsers; use fs when running under Node.
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const fetchable = typeof fetch === 'function';
  const target = url instanceof URL ? url.href : String(url);

  if (!isNode && fetchable) {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`Failed to load template ${url}: ${res.status}`);
    return res.json();
  }

  if (isNode) {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const filePath = fileURLToPath(url);
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }

  throw new Error('Unable to load template in this environment');
}

function cloneTemplate(template) {
  if (!template) return null;
  if (typeof structuredClone === 'function') return structuredClone(template);
  return JSON.parse(JSON.stringify(template));
}

const templates = [];

const mixerKaraoke = await loadJson(mixerKaraokeUrl);
templates.push(mixerKaraoke);

function listTemplates() {
  return templates.map((t) => cloneTemplate(t));
}

function loadTemplate(id) {
  const template = templates.find((t) => t.id === id);
  return cloneTemplate(template);
}

if (typeof window !== 'undefined') {
  window.CIRCUIT_TEMPLATES = listTemplates();
}

export { listTemplates, loadTemplate };
