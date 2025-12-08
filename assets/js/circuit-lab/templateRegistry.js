import mixerKaraoke from './templates/mixer-karaoke.js';
import baxandallTone from './templates/baxandall-tone.js';

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

/** @type {CircuitTemplate[]} */
const templates = [mixerKaraoke, baxandallTone].filter(Boolean);
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
