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

    // The legacy "Sections" dropdown was removed — only the Labs dropdown
    // remains in the primary nav. Per-page section navigation is handled
    // by the side-nav module instead.
    expect(header?.querySelector('#section-menu')).toBeNull();
    expect(header?.querySelector('#labs-menu')).not.toBeNull();
    expect(header?.querySelector('.edit-toggle')).not.toBeNull();
  });

  it('applies root prefix on lab pages and renders a minimal footer', async () => {
    window.history.replaceState({}, '', '/pages/transformer-lab/');
    const { initMainLayout } = await import('../mainLayout.js');
    initMainLayout('transformer-lab');

    const activeLab = Array.from(document.querySelectorAll('#labs-menu a')).find((link) =>
      link.textContent?.includes('Transformer Lab')
    );
    expect(activeLab?.getAttribute('aria-current')).toBe('page');

    // The footer was simplified to a single "Back to top" link — preset
    // heading / body / action buttons / meta lines are intentionally gone.
    expect(document.querySelector('.footer__actions')).toBeNull();
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
