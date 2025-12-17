// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetDom = (path = '/') => {
  document.documentElement.innerHTML = `
    <head></head>
    <body class="theme-light">
      <div id="site-header"></div>
      <div id="site-footer"></div>
    </body>
  `;
  window.history.replaceState({}, '', path);
  document.documentElement.dataset.navRoot = '';
  document.body.dataset.navRoot = '';
  localStorage.clear();
};

describe('main layout header/footer', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDom();
  });

  it('renders home header with local anchors and edit toggle', async () => {
    const { initMainLayout } = await import('../mainLayout.js');
    initMainLayout('home', { showEditToggle: true, useLocalAnchors: true });

    const header = document.querySelector('.site-header');
    expect(header).not.toBeNull();
    expect(header?.querySelector('.logo')?.getAttribute('href')).toBe('#hero');

    const sectionLinks = Array.from(header?.querySelectorAll('#section-menu a') ?? []);
    expect(sectionLinks.length).toBeGreaterThan(0);
    expect(sectionLinks.every((link) => link.getAttribute('href')?.startsWith('#'))).toBe(true);
    expect(header?.querySelector('.edit-toggle')).not.toBeNull();
  });

  it('applies root prefix and footer preset on lab pages', async () => {
    window.history.replaceState({}, '', '/pages/transformer-lab/');
    const { initMainLayout } = await import('../mainLayout.js');
    initMainLayout('transformer-lab');

    const sectionLink = document.querySelector('#section-menu a');
    expect(sectionLink?.getAttribute('href')).toBe('../../index.html#about');

    const activeLab = Array.from(document.querySelectorAll('#labs-menu a')).find((link) =>
      link.textContent?.includes('Transformer Lab')
    );
    expect(activeLab?.getAttribute('aria-current')).toBe('page');

    const footerAction = document.querySelector('.footer__actions a.button--primary');
    expect(footerAction?.getAttribute('href')).toBe('../../index.html#projects');
    expect(document.querySelector('.back-to-top')?.getAttribute('href')).toBe('#top');
  });

  it('respects footer opt-out for circuit-lab', async () => {
    window.history.replaceState({}, '', '/pages/circuit-lab/');
    const { initMainLayout } = await import('../mainLayout.js');
    initMainLayout('circuit-lab');

    const footer = document.getElementById('site-footer');
    expect(footer?.innerHTML).toBe('');
  });
});
