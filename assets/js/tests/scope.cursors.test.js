import { describe, it, expect, afterEach } from 'vitest';
import {
  getCursorVisibility,
  setCursorVisibility,
  toggleCursorVisibility
} from '../circuitforge.js';

describe('oscilloscope cursor visibility state', () => {
  afterEach(() => {
    setCursorVisibility('cursor-1', true);
    setCursorVisibility('cursor-2', true);
  });

  it('toggles both directions without relying on the DOM', () => {
    setCursorVisibility('cursor-1', false);
    expect(getCursorVisibility('cursor-1')).toBe(false);
    toggleCursorVisibility('cursor-1');
    expect(getCursorVisibility('cursor-1')).toBe(true);

    setCursorVisibility('cursor-2', true);
    toggleCursorVisibility('cursor-2');
    expect(getCursorVisibility('cursor-2')).toBe(false);
  });
});

