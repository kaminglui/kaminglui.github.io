function normalizeRootPrefix(prefix = '') {
  if (!prefix) return '';
  if (prefix === '/') return '/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function computeRootPrefix(pathname = '') {
  const rootAttr =
    (typeof document !== 'undefined' && document.documentElement?.dataset?.navRoot) ??
    (typeof document !== 'undefined' && document.body?.dataset?.navRoot) ??
    null;

  if (typeof rootAttr === 'string' && rootAttr.trim()) {
    return normalizeRootPrefix(rootAttr.trim());
  }

  const safePath = typeof pathname === 'string' ? pathname : '';
  const cleanPath = safePath.split(/[?#]/)[0].replace(/\\/g, '/');
  const segments = cleanPath.split('/').filter(Boolean);

  if (segments.length && segments[segments.length - 1].includes('.')) {
    segments.pop();
  }

  if (segments.length === 0) return '';

  return '../'.repeat(segments.length);
}

function resolveRootPrefix({ explicitPrefix, element, fallbackPathname } = {}) {
  if (typeof explicitPrefix === 'string' && explicitPrefix.trim()) {
    return normalizeRootPrefix(explicitPrefix.trim());
  }

  const attr =
    element?.dataset?.footerRoot ??
    element?.dataset?.navRoot ??
    null;

  if (typeof attr === 'string' && attr.trim()) {
    return normalizeRootPrefix(attr.trim());
  }

  const path =
    typeof window !== 'undefined'
      ? window.location?.pathname
      : fallbackPathname;
  return normalizeRootPrefix(computeRootPrefix(path));
}

export { computeRootPrefix, normalizeRootPrefix, resolveRootPrefix };
