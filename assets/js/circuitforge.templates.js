import { listTemplates, loadTemplate } from './circuit-lab/templateRegistry.js';

// Maintain the legacy global so non-module consumers can see available templates.
window.CIRCUIT_TEMPLATES = listTemplates();

export { listTemplates, loadTemplate };
