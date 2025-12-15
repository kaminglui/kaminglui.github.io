// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetDom = () => {
  document.documentElement.innerHTML = `
    <head></head>
    <body class="theme-light">
      <button class="theme-toggle" type="button" aria-label="Toggle color theme"></button>
    </body>
  `;
  localStorage.clear();
};

const stubMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    }))
  });
};

describe('assets/js/layout/theme.js', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDom();
    stubMatchMedia();
  });

  it('supports registering onChange after the toggle is already bound', async () => {
    const { initThemeControls } = await import('../theme.js');

    initThemeControls();

    const onChange = vi.fn();
    initThemeControls({ onChange });

    expect(onChange).toHaveBeenCalledWith('light');

    onChange.mockClear();
    document.querySelector('.theme-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('dark');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('circuitforge-theme')).toBe('dark');
    expect(localStorage.getItem('kaminglui-theme')).toBe('dark');
  });
});

