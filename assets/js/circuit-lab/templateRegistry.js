import mixerKaraoke from './templates/mixer-karaoke.js';
import baxandallTone from './templates/baxandall-tone.js';

const JSON_MANIFEST_URL = new URL('./templates/index.json', import.meta.url);
const JSON_BASE_URL = new URL('./templates/', import.meta.url);

/**
 * @typedef {Object} CircuitTemplate
 * @property {string} id
 * @property {string} [label]
 * @property {string} [icon]
 * @property {Array<Object>} [components]
 * @property {Array<Object>} [wires]
 */

function cloneTemplate(template) {
  if (!template) return null;
  if (typeof structuredClone === 'function') return structuredClone(template);
  return JSON.parse(JSON.stringify(template));
}

async function loadJsonTemplate(file) {
  if (!file) return null;
  try {
    const url = new URL(file, JSON_BASE_URL);
    if (typeof fetch === 'function') {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }
  } catch (err) {
    // ignore and fall through to fs path for Node/vitest
  }
  try {
    const { readFile } = await import('fs/promises');
    const data = await readFile(new URL(file, JSON_BASE_URL), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

async function loadJsonManifest() {
  try {
    if (typeof fetch === 'function') {
      const res = await fetch(JSON_MANIFEST_URL);
      if (!res.ok) throw new Error('no manifest');
      return await res.json();
    }
  } catch (err) {
    // fall through to filesystem
  }
  try {
    const { readFile } = await import('fs/promises');
    const data = await readFile(JSON_MANIFEST_URL, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function normalizeTemplateShape(t) {
  if (!t || typeof t !== 'object') return null;
  const comp = Array.isArray(t.components) ? t.components : [];
  const wires = Array.isArray(t.wires) ? t.wires : [];
  return {
    id: t.id || '',
    label: t.label,
    icon: t.icon,
    components: comp,
    wires
  };
}

const staticTemplates = [mixerKaraoke, baxandallTone].filter(Boolean).map(normalizeTemplateShape);
const jsonTemplatesPromise = (async () => {
  const manifest = await loadJsonManifest();
  if (!Array.isArray(manifest)) return [];
  const loaded = await Promise.all(manifest.map((entry) => loadJsonTemplate(entry.file)));
  return loaded.map(normalizeTemplateShape).filter(Boolean);
})();
let templates = staticTemplates.slice();
jsonTemplatesPromise.then((jsonTemplates) => {
  const seen = new Set(templates.map((t) => t.id));
  jsonTemplates.forEach((t) => {
    if (!t || !t.id) return;
    if (seen.has(t.id)) return;
    templates.push(t);
    seen.add(t.id);
  });
});
let warnedEmptyTemplates = false;

function warnEmptyTemplates() {
  if (warnedEmptyTemplates) return;
  warnedEmptyTemplates = true;
  console.warn('Circuit Lab templates not found; template gallery will be empty.');
}

/** @returns {CircuitTemplate[]} */
function listTemplates() {
  if (!templates.length) warnEmptyTemplates();
  return templates.map((t) => cloneTemplate(t));
}

/**
 * @param {string} id
 * @returns {CircuitTemplate|null}
 */
function loadTemplate(id) {
  const template = templates.find((t) => t.id === id);
  if (!template) {
    warnEmptyTemplates();
    return null;
  }
  return cloneTemplate(template);
}

if (typeof window !== 'undefined') {
  window.CIRCUIT_TEMPLATES = listTemplates();
}

export { listTemplates, loadTemplate };
