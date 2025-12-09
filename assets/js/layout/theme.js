const THEME_KEYS = ['theme', 'circuitforge-theme'];

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

function initThemeControls({ onChange } = {}) {
  const toggle = document.querySelector('.theme-toggle');
  const alreadyBound = toggle?.dataset.themeBound === 'true';
  const initial = applyTheme(resolveInitialTheme());
  updateThemeToggle(toggle, initial);

  const notify = (theme) => {
    if (typeof onChange === 'function') onChange(theme);
  };

  const handleMedia = (event) => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEYS[0])) return;
    const next = applyTheme(event.matches ? 'dark' : 'light');
    updateThemeToggle(toggle, next);
    notify(next);
  };

  const media = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  if (media) {
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMedia);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleMedia);
    }
  }

  if (toggle && !alreadyBound) {
    toggle.dataset.themeBound = 'true';
    toggle.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const next = applyTheme(current === 'dark' ? 'light' : 'dark');
      updateThemeToggle(toggle, next);
      notify(next);
    });
  }

  notify(initial);
  return initial;
}

export { applyTheme, initThemeControls, readStoredTheme };
