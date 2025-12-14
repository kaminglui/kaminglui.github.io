export const chunkSplit = (id: string) => {
  if (id.includes('node_modules/react')) return 'react-vendor';
  if (id.includes('node_modules/katex')) return 'math-vendor';
  if (id.includes('node_modules/lucide-react')) return 'icons-vendor';
  if (id.includes('node_modules')) return 'vendor';
  return undefined;
};
