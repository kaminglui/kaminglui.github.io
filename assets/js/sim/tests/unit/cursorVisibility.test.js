import { describe, it, expect } from 'vitest';
import { cursorIsVisible, setCursorVisibility } from '../../../circuitforge.js';

describe('cursor visibility state', () => {
  it('tracks visibility without relying on the DOM', () => {
    setCursorVisibility(1, true);
    setCursorVisibility(2, false);
    expect(cursorIsVisible(1)).toBe(true);
    expect(cursorIsVisible(2)).toBe(false);
  });

  it('ignores invalid cursor ids', () => {
    expect(cursorIsVisible(3)).toBe(false);
    setCursorVisibility(3, true);
    expect(cursorIsVisible(3)).toBe(false);
  });
});
