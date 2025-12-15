// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetDom = () => {
  document.documentElement.innerHTML = `
    <head></head>
    <body class="theme-light">
      <div id="site-header"></div>
      <div id="site-footer"></div>
    </body>
  `;
  window.history.replaceState({}, '', '/pages/transformer-lab/');
  localStorage.clear();
};

const stubMatchMedia = (queryMatches) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: Boolean(queryMatches?.[query]),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
};

describe('assets/js/nav.js', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDom();
  });

  it('toggles mobile menu open/close via click', async () => {
    stubMatchMedia({
      '(hover: none)': true,
      '(hover: hover)': false,
      '(pointer: fine)': false
    });

    const { initSiteShell } = await import('../siteShell.js');
    initSiteShell('transformer-lab');

    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    expect(navToggle).not.toBeNull();
    expect(navLinks).not.toBeNull();

    navToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(navLinks?.getAttribute('data-visible')).toBe('true');
    expect(document.body.classList.contains('nav-open')).toBe(true);

    navToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(navLinks?.getAttribute('data-visible')).toBe('false');
    expect(document.body.classList.contains('nav-open')).toBe(false);
  });

  it('toggles dropdown menus via click on touch/coarse pointers', async () => {
    stubMatchMedia({
      '(hover: none)': true,
      '(hover: hover)': false,
      '(pointer: fine)': false
    });

    const { initSiteShell } = await import('../siteShell.js');
    initSiteShell('transformer-lab');

    const wrapper = document.querySelector('.nav-item--dropdown');
    const toggle = wrapper?.querySelector('.nav-dropdown-toggle');
    const menu = wrapper?.querySelector('.nav-dropdown-menu');

    expect(wrapper).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(menu?.hasAttribute('hidden')).toBe(true);

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(wrapper?.getAttribute('data-open')).toBe('true');
    expect(menu?.hasAttribute('hidden')).toBe(false);

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(wrapper?.getAttribute('data-open')).toBe('false');
    expect(menu?.hasAttribute('hidden')).toBe(true);
  });

  it('closes the mobile menu via Escape', async () => {
    stubMatchMedia({
      '(hover: none)': true,
      '(hover: hover)': false,
      '(pointer: fine)': false
    });

    const { initSiteShell } = await import('../siteShell.js');
    initSiteShell('transformer-lab');

    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    navToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.classList.contains('nav-open')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(navToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(navLinks?.getAttribute('data-visible')).toBe('false');
    expect(document.body.classList.contains('nav-open')).toBe(false);
  });
});

