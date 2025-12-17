// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { computeRootPrefix, normalizeRootPrefix, resolveRootPrefix } from '../rootPrefix.js';

const resetDom = () => {
  document.documentElement.dataset.navRoot = '';
  document.body.dataset.navRoot = '';
  window.history.replaceState({}, '', '/');
};

describe('layout root prefix helpers', () => {
  beforeEach(() => {
    resetDom();
  });

  it('normalizes prefixes with trailing slash', () => {
    expect(normalizeRootPrefix('')).toBe('');
    expect(normalizeRootPrefix('/')).toBe('/');
    expect(normalizeRootPrefix('../root')).toBe('../root/');
  });

  it('computes prefix for nested paths and strips filenames', () => {
    window.history.replaceState({}, '', '/pages/ml-playground/index.html');
    expect(computeRootPrefix(window.location.pathname)).toBe('../../');

    window.history.replaceState({}, '', '/pages/transformer-lab/');
    expect(computeRootPrefix(window.location.pathname)).toBe('../../');
  });

  it('honors document-level navRoot overrides', () => {
    document.documentElement.dataset.navRoot = '/custom';
    expect(computeRootPrefix('/pages/anywhere/')).toBe('/custom/');
  });

  it('prefers explicit prefixes and element data attributes', () => {
    const el = document.createElement('div');
    el.dataset.navRoot = '../assets';

    expect(resolveRootPrefix({ explicitPrefix: '/static' })).toBe('/static/');
    expect(resolveRootPrefix({ element: el })).toBe('../assets/');
  });

  it('falls back to window location when no overrides are provided', () => {
    window.history.replaceState({}, '', '/pages/transformer-lab/');
    expect(resolveRootPrefix()).toBe('../../');
  });
});
