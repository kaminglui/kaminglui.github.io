// Basic DOM helpers so canvas-dependent utilities can run in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(HTMLCanvasElement.prototype as any).getContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    getImageData: () => ({ data: new Uint8ClampedArray(), width: 0, height: 0 }),
    drawImage: () => {},
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {}
  });
}

// jsdom lacks these URL helpers by default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).URL.createObjectURL = () => 'blob:mock';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).URL.revokeObjectURL = () => {};
