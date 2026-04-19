const THEME_KEYS = ['theme', 'circuitforge-theme', 'kaminglui-theme'];

const themeListeners = new Set();
let mediaListenerBound = false;

function readStoredTheme() {
  if (typeof localStorage === 'undefined') return null;
  for (const key of THEME_KEYS) {
    const stored = localStorage.getItem(key);
    if (stored === 'dark' || stored === 'light') return stored;
  }
  return null;
}

function storeTheme(theme) {
  if (typeof localStorage === 'undefined') return;
  THEME_KEYS.forEach((key) => {
    try {
      localStorage.setItem(key, theme);
    } catch (error) {
      console.warn('Unable to store theme preference', error);
    }
  });
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  if (typeof document === 'undefined') return next;
  document.body.classList.toggle('theme-dark', next === 'dark');
  document.body.classList.toggle('theme-light', next === 'light');
  document.documentElement.classList.toggle('dark', next === 'dark');
  storeTheme(next);
  return next;
}

function updateThemeToggle(toggle, theme) {
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  toggle.innerHTML = theme === 'dark'
    ? '<span aria-hidden="true">🌙</span>'
    : '<span aria-hidden="true">☀️</span>';
}

function resolveInitialTheme() {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return 'light';
}

function notifyThemeChange(theme) {
  themeListeners.forEach((listener) => {
    try {
      listener(theme);
    } catch (error) {
      console.warn('Theme change listener failed', error);
    }
  });
}

function initThemeControls({ onChange, forceTheme } = {}) {
  const toggle = document.querySelector('.theme-toggle');
  // Pages that want to lock the theme (e.g. Circuit Lab is dark-only) pass
  // forceTheme: 'dark' | 'light'. We apply it once, skip the toggle/media listeners,
  // and leave localStorage untouched so other pages keep the user's preference.
  if (forceTheme === 'dark' || forceTheme === 'light') {
    document.body.classList.toggle('theme-dark', forceTheme === 'dark');
    document.body.classList.toggle('theme-light', forceTheme === 'light');
    document.documentElement.classList.toggle('dark', forceTheme === 'dark');
    if (toggle) toggle.hidden = true;
    if (typeof onChange === 'function') onChange(forceTheme);
    return forceTheme;
  }

  const initial = applyTheme(resolveInitialTheme());
  updateThemeToggle(toggle, initial);

  if (typeof onChange === 'function') {
    themeListeners.add(onChange);
  }

  const handleMedia = (event) => {
    if (readStoredTheme()) return;
    const next = applyTheme(event.matches ? 'dark' : 'light');
    updateThemeToggle(toggle, next);
    notifyThemeChange(next);
  };

  const media = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  if (media && !mediaListenerBound) {
    mediaListenerBound = true;
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMedia);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleMedia);
    }
  }

  const alreadyBound = toggle?.dataset.themeBound === 'true';
  if (toggle && !alreadyBound) {
    toggle.dataset.themeBound = 'true';
    toggle.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const next = applyTheme(current === 'dark' ? 'light' : 'dark');
      updateThemeToggle(toggle, next);
      notifyThemeChange(next);
    });
  }

  notifyThemeChange(initial);
  return initial;
}

function subscribeTheme(listener) {
  if (typeof listener !== 'function') return () => {};
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export { applyTheme, initThemeControls, readStoredTheme, subscribeTheme };
