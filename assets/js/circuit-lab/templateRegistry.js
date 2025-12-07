import mixerKaraoke from './templates/mixer-karaoke.json' assert { type: 'json' };

const templates = [mixerKaraoke];

function cloneTemplate(template) {
  if (!template) return null;
  if (typeof structuredClone === 'function') return structuredClone(template);
  return JSON.parse(JSON.stringify(template));
}

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
