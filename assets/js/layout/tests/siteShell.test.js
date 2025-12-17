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
  window.history.replaceState({}, '', '/');
  localStorage.clear();
};

describe('assets/js/layout/mainLayout.js', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDom();
  });

  it('renders standardized header/footer for home', async () => {
    const { initMainLayout } = await import('../mainLayout.js');

    initMainLayout('home', { showEditToggle: true, useLocalAnchors: true });

    const header = document.querySelector('[data-site-header]');
    expect(header).not.toBeNull();
    expect(header?.classList.contains('site-header')).toBe(true);
    expect(header?.querySelector('.nav')).not.toBeNull();
    expect(header?.querySelector('.theme-toggle')).not.toBeNull();
    expect(header?.querySelector('.edit-toggle')).not.toBeNull();

    const footer = document.querySelector('[data-site-footer]');
    expect(footer).not.toBeNull();
    expect(footer?.classList.contains('site-footer')).toBe(true);
    expect(footer?.querySelector('a.back-to-top')?.getAttribute('href')).toBe('#top');
  });

  it('does not render footer for circuit-lab', async () => {
    window.history.replaceState({}, '', '/pages/circuit-lab/');
    const { initMainLayout } = await import('../mainLayout.js');

    initMainLayout('circuit-lab');

    const footerTarget = document.getElementById('site-footer');
    expect(footerTarget?.classList.contains('site-footer')).toBe(false);
    expect(footerTarget?.innerHTML).toBe('');
  });

  it('uses transformer-lab footer preset content and rootPrefix', async () => {
    window.history.replaceState({}, '', '/pages/transformer-lab/');
    const { initMainLayout } = await import('../mainLayout.js');

    initMainLayout('transformer-lab');

    const footer = document.querySelector('[data-site-footer]');
    expect(footer?.textContent).toContain('Ready for more machine learning stories?');
    expect(footer?.querySelector('a[href="../../index.html#projects"]')).not.toBeNull();
  });
});
