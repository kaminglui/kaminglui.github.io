const body = document.body;
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
const themeToggle = document.querySelector('.theme-toggle');
const yearElement = document.querySelector('#year');

const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const storedTheme = window.localStorage.getItem('theme');

const setTheme = (isDark) => {
  body.classList.toggle('theme-dark', isDark);
  body.classList.toggle('theme-light', !isDark);
  if (themeToggle) {
    themeToggle.innerHTML = isDark
      ? '<span aria-hidden="true">☀️</span>'
      : '<span aria-hidden="true">🌙</span>';
  }
};

if (storedTheme === 'dark' || (!storedTheme && prefersDarkScheme.matches)) {
  setTheme(true);
} else {
  setTheme(false);
}

prefersDarkScheme.addEventListener('change', (event) => {
  if (window.localStorage.getItem('theme')) return;
  setTheme(event.matches);
});

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isExpanded));
    navLinks?.setAttribute('data-visible', String(!isExpanded));
    body.classList.toggle('nav-open', !isExpanded);
  });

  navLinks?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks?.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
      navToggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 720) {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks?.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
    }
  });
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = !body.classList.contains('theme-dark');
    setTheme(isDark);
    window.localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}
