import { renderSiteHeader } from './site-header.js';

let globalDropdownHandlersBound = false;
let navReady = false;

function setupNav() {
  if (navReady) return;

  const navElement = renderSiteHeader();
  const navRoot = navElement ?? document.querySelector('.nav');
  const navToggle =
    navRoot?.querySelector('.nav-toggle') ??
    document.querySelector('.nav-toggle');
  const navLinks =
    navRoot?.querySelector('.nav-links') ??
    document.querySelector('.nav-links');

  if (!navRoot || !navToggle || !navLinks) {
    return;
  }

  if (navRoot.dataset.navEnhanced === 'true') {
    navReady = true;
    return;
  }

  const body = document.body;
  const dropdownWrappers = Array.from(
    navRoot.querySelectorAll('.nav-item--dropdown')
  );
  const dropdownInstances = [];

  // Dropdowns are always click-to-toggle. The previous code gated on
  // `(hover: hover) and (pointer: fine)` media queries so it could hover-open
  // on desktop, but those queries report inconsistently on iPads / touch
  // laptops / hybrid devices and the click branch never fires there — giving
  // the impression that the mobile menu "doesn't expand." Click-only is
  // universal: tap works on touch, click works on desktop, keyboard still
  // gets its own Enter / ArrowDown / Escape path.

  const closeAllDropdowns = ({ except } = {}) => {
    let changed = false;
    dropdownInstances.forEach((instance) => {
      if (instance === except) return;
      if (instance.isOpen()) {
        instance.close();
        changed = true;
      }
    });
    return changed;
  };

  dropdownWrappers.forEach((wrapper) => {
    const toggle = wrapper.querySelector('.nav-dropdown-toggle');
    const menu = wrapper.querySelector('.nav-dropdown-menu');

    if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
      return;
    }

    const instance = {
      wrapper,
      toggle,
      menu,
      isOpen: () => toggle.getAttribute('aria-expanded') === 'true',
      open: () => {
        toggle.setAttribute('aria-expanded', 'true');
        wrapper.setAttribute('data-open', 'true');
        menu.hidden = false;
      },
      close: () => {
        toggle.setAttribute('aria-expanded', 'false');
        wrapper.setAttribute('data-open', 'false');
        menu.hidden = true;
      }
    };

    instance.close();
    dropdownInstances.push(instance);

    const openExclusive = () => {
      closeAllDropdowns({ except: instance });
      instance.open();
    };

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (instance.isOpen()) {
        instance.close();
      } else {
        openExclusive();
      }
    });

    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!instance.isOpen()) {
          openExclusive();
        }
        const firstLink = menu.querySelector('a');
        if (firstLink instanceof HTMLElement) {
          firstLink.focus();
        }
      } else if (event.key === 'Escape') {
        instance.close();
      }
    });

    menu.addEventListener('click', (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        closeAllDropdowns();
      }
    });

    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        instance.close();
        toggle.focus();
      }
    });
  });

  window.addEventListener('resize', () => {
    closeAllDropdowns();
  });

  if (dropdownInstances.length > 0 && !globalDropdownHandlersBound) {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (target instanceof Node) {
        if (dropdownInstances.some(({ wrapper }) => wrapper.contains(target))) {
          return;
        }
      }
      closeAllDropdowns();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAllDropdowns();
      }
    });

    globalDropdownHandlersBound = true;
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      closeAllDropdowns();
      navToggle.setAttribute('aria-expanded', String(!isExpanded));
      navLinks?.setAttribute('data-visible', String(!isExpanded));
      body.classList.toggle('nav-open', !isExpanded);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeAllDropdowns();
        navToggle.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 720) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeAllDropdowns();
      }
    });
  }

  navLinks?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle?.setAttribute('aria-expanded', 'false');
      navLinks.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
      closeAllDropdowns();
    }
  });

  navRoot.dataset.navEnhanced = 'true';
  navReady = true;
}

const runWhenReady = () => setupNav();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runWhenReady, { once: true });
} else {
  runWhenReady();
}

export { setupNav };
