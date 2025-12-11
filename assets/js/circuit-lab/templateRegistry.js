import mixerKaraoke from './templates/mixer-karaoke.js';
import baxandallTone from './templates/baxandall-tone.js';

const JSON_MANIFEST_URL = new URL('./templates/index.json', import.meta.url);
const JSON_BASE_URL = new URL('./templates/', import.meta.url);
const DEFAULT_ICON = 'fas fa-puzzle-piece';

/**
 * @typedef {Object} CircuitTemplate
 * @property {string} id
 * @property {string} [label]
 * @property {string} [icon]
 * @property {Array<Object>} [components]
 * @property {Array<Object>} [wires]
 */

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

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

function normalizeEndpoint(ep = {}) {
  const idx = Number.isFinite(ep.index) ? ep.index : Number.isFinite(ep.i) ? ep.i : null;
  const pin = Number.isFinite(ep.pin) ? ep.pin : Number.isFinite(ep.p) ? ep.p : 0;
  const id = typeof ep.id === 'string' ? ep.id : null;
  return { id, index: idx, pin };
}

function validateTemplate(template, { defaultIcon = DEFAULT_ICON } = {}) {
  const warnings = [];
  if (!isObject(template)) return { ok: false, template: null, warnings };

  const id = (template.id || '').trim();
  if (!id) {
    warnings.push('Template missing id');
    return { ok: false, template: null, warnings };
  }

  const components = [];
  (Array.isArray(template.components) ? template.components : []).forEach((c, idx) => {
    const type = (c?.type || c?.kind || '').trim();
    if (!type) {
      warnings.push(`Component ${idx} missing type; skipped`);
      return;
    }
    const props = isObject(c?.props) ? c.props : {};
    components.push({
      id: typeof c.id === 'string' ? c.id : undefined,
      type,
      x: Number.isFinite(c.x) ? c.x : 0,
      y: Number.isFinite(c.y) ? c.y : 0,
      rotation: Number.isFinite(c.rotation) ? c.rotation : 0,
      mirrorX: !!c.mirrorX,
      props: { ...props }
    });
  });

  const wires = [];
  (Array.isArray(template.wires) ? template.wires : []).forEach((w, idx) => {
    const from = normalizeEndpoint(w?.from || {});
    const to = normalizeEndpoint(w?.to || {});
    const hasAnchor = (from.id || Number.isFinite(from.index)) && (to.id || Number.isFinite(to.index));
    if (!hasAnchor) {
      warnings.push(`Wire ${idx} missing endpoints; skipped`);
      return;
    }
    const vertices = Array.isArray(w?.vertices) ? w.vertices.map((v) => ({
      x: Number.isFinite(v?.x) ? v.x : 0,
      y: Number.isFinite(v?.y) ? v.y : 0
    })) : [];
    wires.push({ from, to, vertices });
  });

  if (!components.length) warnings.push('Template has no valid components');

  const normalized = {
    id,
    label: template.label || id,
    icon: template.icon || defaultIcon,
    components,
    wires
  };

  return { ok: !!components.length, template: normalized, warnings };
}

function mergeTemplateLists(staticList, jsonList, warn = console.warn) {
  const byId = new Map();
  (staticList || []).forEach((t) => {
    if (!t?.id) return;
    byId.set(t.id, t);
  });
  (jsonList || []).forEach((t) => {
    if (!t?.id) return;
    if (byId.has(t.id)) {
      warn?.(`Template "${t.id}" skipped (duplicate id already loaded).`);
      return;
    }
    byId.set(t.id, t);
  });
  return Array.from(byId.values());
}

function validateManifestEntry(entry) {
  if (!isObject(entry)) return null;
  if (!entry.file || !entry.id) return null;
  return { id: entry.id, file: entry.file };
}

function logWarnings(id, warnings = [], warn = console.warn) {
  if (!warnings.length) return;
  const prefix = id ? `[template:${id}]` : '[template]';
  warnings.forEach((w) => warn?.(`${prefix} ${w}`));
}

const staticTemplates = [mixerKaraoke, baxandallTone]
  .filter(Boolean)
  .map(normalizeTemplateShape)
  .map((t) => {
    const { template, warnings } = validateTemplate(t);
    logWarnings(t?.id, warnings);
    return template;
  })
  .filter(Boolean);

const jsonTemplatesPromise = (async () => {
  const manifestRaw = await loadJsonManifest();
  const manifest = Array.isArray(manifestRaw) ? manifestRaw.map(validateManifestEntry).filter(Boolean) : [];
  const loaded = await Promise.all(manifest.map((entry) => loadJsonTemplate(entry.file)));
  return loaded
    .map(normalizeTemplateShape)
    .map((t) => {
      const { template, warnings, ok } = validateTemplate(t);
      logWarnings(t?.id, warnings);
      return ok ? template : null;
    })
    .filter(Boolean);
})();

let templates = staticTemplates.slice();
jsonTemplatesPromise.then((jsonTemplates) => {
  templates = mergeTemplateLists(staticTemplates, jsonTemplates);
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

export { listTemplates, loadTemplate, validateTemplate, mergeTemplateLists, DEFAULT_ICON };
