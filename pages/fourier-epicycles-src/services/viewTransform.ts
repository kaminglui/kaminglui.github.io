import { Point } from '../types';

export type Viewport = { width: number; height: number };

export type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_VIEW: ViewState = { scale: 1, offsetX: 0, offsetY: 0 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const clampScale = (scale: number, minScale: number, maxScale: number) => {
  if (!Number.isFinite(scale)) return clamp(1, minScale, maxScale);
  return clamp(scale, minScale, maxScale);
};

export const isValidViewport = (viewport: Viewport) =>
  Number.isFinite(viewport.width) &&
  Number.isFinite(viewport.height) &&
  viewport.width > 0 &&
  viewport.height > 0;

export const screenToWorld = (screen: Point, viewport: Viewport, view: ViewState): Point => {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const inv = view.scale !== 0 ? 1 / view.scale : 1;
  return {
    x: (screen.x - cx - view.offsetX) * inv,
    y: (screen.y - cy - view.offsetY) * inv
  };
};

export const worldToScreen = (world: Point, viewport: Viewport, view: ViewState): Point => {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  return {
    x: cx + view.offsetX + world.x * view.scale,
    y: cy + view.offsetY + world.y * view.scale
  };
};

export const viewFromWorldAnchor = (
  world: Point,
  viewport: Viewport,
  screen: Point,
  scale: number,
  minScale: number,
  maxScale: number
): ViewState => {
  const nextScale = clampScale(scale, minScale, maxScale);
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  return {
    scale: nextScale,
    offsetX: screen.x - cx - world.x * nextScale,
    offsetY: screen.y - cy - world.y * nextScale
  };
};

export const zoomViewAt = (
  view: ViewState,
  viewport: Viewport,
  screen: Point,
  scale: number,
  minScale: number,
  maxScale: number
): ViewState => {
  const world = screenToWorld(screen, viewport, view);
  return viewFromWorldAnchor(world, viewport, screen, scale, minScale, maxScale);
};

export const zoomViewByFactorAt = (
  view: ViewState,
  viewport: Viewport,
  screen: Point,
  factor: number,
  minScale: number,
  maxScale: number
): ViewState => {
  const nextScale = view.scale * factor;
  return zoomViewAt(view, viewport, screen, nextScale, minScale, maxScale);
};

export const panView = (view: ViewState, dx: number, dy: number): ViewState => ({
  ...view,
  offsetX: view.offsetX + dx,
  offsetY: view.offsetY + dy
});

export const fitViewToPoints = (
  points: Point[],
  viewport: Viewport,
  options: { padding?: number; minScale: number; maxScale: number } = { padding: 0.9, minScale: 0.25, maxScale: 6 }
): ViewState => {
  if (!isValidViewport(viewport) || points.length === 0) return DEFAULT_VIEW;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return DEFAULT_VIEW;
  }

  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const pad = clamp(options.padding ?? 0.9, 0.1, 1);
  const scaleFit = pad * Math.min(viewport.width / w, viewport.height / h);
  const scale = clampScale(scaleFit, options.minScale, options.maxScale);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    scale,
    offsetX: -centerX * scale,
    offsetY: -centerY * scale
  };
};

