import { describe, expect, it } from 'vitest';
import { chunkSplit } from '../chunking';

describe('chunkSplit', () => {
  it('groups react dependencies', () => {
    expect(chunkSplit('/node_modules/react/index.js')).toBe('react-vendor');
  });

  it('groups math and icons separately', () => {
    expect(chunkSplit('/node_modules/katex/dist/katex.js')).toBe('math-vendor');
    expect(chunkSplit('/node_modules/lucide-react/index.js')).toBe('icons-vendor');
  });

  it('falls back to vendor for other node modules', () => {
    expect(chunkSplit('/node_modules/lodash-es/chunk.js')).toBe('vendor');
  });

  it('returns undefined for app code', () => {
    expect(chunkSplit('/src/App.tsx')).toBeUndefined();
  });
});
