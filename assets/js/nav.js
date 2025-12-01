const body = document.body;
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

function setupNav() {
  const dropdownWrappers = Array.from(
    document.querySelectorAll('.nav-item--dropdown')
  );
  const dropdownInstances = [];

  const hoverNoneQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: none)')
      : null;

  const shouldUseClickToggle = () => hoverNoneQuery?.matches ?? false;

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

    wrapper.addEventListener('pointerenter', () => {
      if (shouldUseClickToggle()) return;
      openExclusive();
    });

    wrapper.addEventListener('pointerleave', () => {
      if (shouldUseClickToggle()) return;
      instance.close();
    });

    wrapper.addEventListener('focusin', (event) => {
      const target = event.target;
      if (
        shouldUseClickToggle() &&
        target instanceof HTMLElement &&
        !target.matches(':focus-visible')
      ) {
        return;
      }
      openExclusive();
    });

    wrapper.addEventListener('focusout', (event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !wrapper.contains(nextTarget)) {
        instance.close();
      }
    });

    toggle.addEventListener('click', (event) => {
      if (!shouldUseClickToggle()) return;
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

  if (hoverNoneQuery) {
    const handleHoverChange = () => {
      closeAllDropdowns();
    };
    if (typeof hoverNoneQuery.addEventListener === 'function') {
      hoverNoneQuery.addEventListener('change', handleHoverChange);
    } else if (typeof hoverNoneQuery.addListener === 'function') {
      hoverNoneQuery.addListener(handleHoverChange);
    }
  }

  if (dropdownInstances.length > 0) {
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
}

setupNav();

export { setupNav };
