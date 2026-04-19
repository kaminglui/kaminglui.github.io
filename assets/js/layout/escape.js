// Small HTML / URL escaping helpers for layout renderers that still use innerHTML.
// Today's inputs come from trusted config files, but anything that interpolates into
// markup should pass through these so a future preset sourced from storage or a URL
// parameter can't inject HTML or a javascript: URL.

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

// Allow-list for hrefs: http(s), mailto, fragment, or a relative path with no scheme.
// Returns '#' for anything else (e.g. javascript:, data:). Output is HTML-escaped so
// it is safe to drop into an attribute value wrapped in double quotes.
export function escapeUrl(value) {
  if (typeof value !== 'string') return '#';
  const trimmed = value.trim();
  if (!trimmed) return '#';
  const safe =
    /^(https?:)?\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed); // no scheme => treat as relative
  return safe ? escapeHtml(trimmed) : '#';
}
