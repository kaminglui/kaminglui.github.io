import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FourierTerm, Point, InputMode } from './types';
import { generateCircle, generateHeart, generateInfinity, generateMusicNote, generateSquare } from './services/mathUtils';
import { processImage, type EdgeProcessingOptions } from './services/imageProcessing';
import { computeFourier } from './services/fourierEngine';
import { computeEnergyMetrics } from './services/metrics';
import { DEFAULT_VIEW, fitViewToPoints, isValidViewport, screenToWorld, Viewport, ViewState, viewFromWorldAnchor, zoomViewByFactorAt } from './services/viewTransform';
import { termColor } from './services/visualUtils';
import Toolbar from './components/Toolbar';
import MathPanel from './components/MathPanel';

const MAX_FOURIER_TERMS = 2400;
const SAFE_MAX_TERMS = 700;
const MIN_POINT_STEP = 1.75;
const DEFAULT_SPEED = 0.45;
const MAX_UPLOAD_BYTES = 10_000_000;
const AUTO_SAVE_KEY = 'fourier_viz__last_session';
const MIN_VIEW_SCALE = 0.25;
const MAX_VIEW_SCALE = 6;
const ZOOM_BUTTON_FACTOR = 1.25;

type RenderState = {
  mode: InputMode;
  points: Point[];
  fourierX: FourierTerm[];
  time: number;
  isPlaying: boolean;
  numEpicycles: number;
  showMath: boolean;
  canvasBg: string;
  gridColor: string;
  speed: number;
  brushColor: string;
  brushSize: number;
  stepMode: boolean;
  safeMode: boolean;
  stepIndex: number;
  view: ViewState;
};

const App: React.FC = () => {
  // State
  const [mode, setMode] = useState<InputMode>('DRAW');
  const [points, setPoints] = useState<Point[]>([]); 
  const [fourierX, setFourierX] = useState<FourierTerm[]>([]); 
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [numEpicycles, setNumEpicycles] = useState(0);
  const [showMath, setShowMath] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canvasBg, setCanvasBg] = useState('#0f172a');
  const [gridColor, setGridColor] = useState('rgba(148, 163, 184, 0.22)');
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [smoothing, setSmoothing] = useState(0);
  const [outlineDetail, setOutlineDetail] = useState(90);
  const [savedDrawings, setSavedDrawings] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  
  // Brush Settings
  const [brushColor, setBrushColor] = useState('#ec4899'); // Default pink
  const [brushSize, setBrushSize] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const pointsRef = useRef<Point[]>([]); 
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const dprRef = useRef(1);
  const lastUploadFileRef = useRef<File | null>(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastUiTimeUpdateRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const needsRedrawRef = useRef(true);
  
  // Optimization: Offscreen canvas for path trail
  const pathCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevEpicyclePointRef = useRef<Point | null>(null);
  const tracePointsRef = useRef<Point[]>([]);
  const traceNeedsRedrawRef = useRef(false);

  type ScreenPoint = { x: number; y: number };
  type PanState = { pointerId: number; start: ScreenPoint; startOffsetX: number; startOffsetY: number };
  type TouchDrawState = {
    pointerId: number;
    start: ScreenPoint;
    viewport: Viewport;
    startView: ViewState;
  };
  type PinchState = {
    ids: [number, number];
    startDist: number;
    startView: ViewState;
    worldAtMid: Point;
    viewport: Viewport;
  };

  const panRef = useRef<PanState | null>(null);
  const touchDrawRef = useRef<TouchDrawState | null>(null);
  const touchPointsRef = useRef<Map<number, ScreenPoint>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const spacePressedRef = useRef(false);

  const renderStateRef = useRef<RenderState>({
    mode,
    points,
    fourierX,
    time,
    isPlaying,
    numEpicycles,
    showMath,
    canvasBg,
    gridColor,
    speed,
    brushColor,
    brushSize,
    stepMode,
    safeMode,
    stepIndex,
    view
  });

  const clearPathCanvas = useCallback(() => {
    if (pathCanvasRef.current) {
      const ctx = pathCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pathCanvasRef.current.width, pathCanvasRef.current.height);
      }
    }
    prevEpicyclePointRef.current = null;
    tracePointsRef.current = [];
    traceNeedsRedrawRef.current = false;
  }, []);

  const resizeCanvases = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { width, height } = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(width));
    const cssHeight = Math.max(1, Math.floor(height));
    if (cssWidth <= 1 || cssHeight <= 1) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    if (!pathCanvasRef.current) {
      pathCanvasRef.current = document.createElement('canvas');
    }
    pathCanvasRef.current.width = canvas.width;
    pathCanvasRef.current.height = canvas.height;
    clearPathCanvas();
  }, [clearPathCanvas]);

  const setPlaybackTime = useCallback((nextTime: number) => {
    timeRef.current = nextTime;
    lastFrameTimeRef.current = null;
    lastUiTimeUpdateRef.current = null;
    setTime(nextTime);
  }, []);

  const resetSimulation = useCallback(() => {
    setPlaybackTime(0);
    clearPathCanvas();
  }, [clearPathCanvas, setPlaybackTime]);

  const handleReset = () => {
    resetSimulation();
  };

  const resetView = useCallback(() => {
    setView(DEFAULT_VIEW);
  }, []);

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const viewport: Viewport = { width: rect.width, height: rect.height };
    if (!isValidViewport(viewport)) return;
    const pts = pointsRef.current.length ? pointsRef.current : points;
    if (!pts.length) {
      setView(DEFAULT_VIEW);
      return;
    }
    setView(fitViewToPoints(pts, viewport, { padding: 0.9, minScale: MIN_VIEW_SCALE, maxScale: MAX_VIEW_SCALE }));
  }, [points]);

  const zoomAtCenter = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const viewport: Viewport = { width: rect.width, height: rect.height };
    if (!isValidViewport(viewport)) return;
    const screen = { x: viewport.width / 2, y: viewport.height / 2 };
    setView((prev) => zoomViewByFactorAt(prev, viewport, screen, factor, MIN_VIEW_SCALE, MAX_VIEW_SCALE));
  }, []);

  const zoomIn = useCallback(() => zoomAtCenter(ZOOM_BUTTON_FACTOR), [zoomAtCenter]);
  const zoomOut = useCallback(() => zoomAtCenter(1 / ZOOM_BUTTON_FACTOR), [zoomAtCenter]);

  const computeDFT = useCallback((pts: Point[]) => {
    if (pts.length === 0) return;
    const limit = safeMode ? SAFE_MAX_TERMS : MAX_FOURIER_TERMS;
    const { prepared, spectrum } = computeFourier(pts, { smoothing, limit });
    setPoints(prepared);
    setFourierX(spectrum);
    const cap = Math.min(spectrum.length, limit);
    // Default to the highest precision we can afford so the initial reconstruction
    // captures ~100% of the available energy (users can dial it back with the slider).
    setNumEpicycles(Math.max(1, cap));

    const rect = canvasRef.current?.getBoundingClientRect();
    const viewport = rect ? { width: rect.width, height: rect.height } : null;
    setView(
      viewport && isValidViewport(viewport)
        ? fitViewToPoints(prepared, viewport, { padding: 0.9, minScale: MIN_VIEW_SCALE, maxScale: MAX_VIEW_SCALE })
        : DEFAULT_VIEW
    );
    try {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(prepared));
    } catch {
      // ignore autosave failures
    }
    resetSimulation();
    setIsPlaying(true);
    setStepIndex(0);
  }, [resetSimulation, safeMode, smoothing]);

  useEffect(() => {
    // Load saved drawings list on mount
    const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('fourier_viz_'))
        .map(k => k.replace('fourier_viz_', ''))
        .sort();
    setSavedDrawings(keys);

    // Try to resume last session if present
    const last = localStorage.getItem(AUTO_SAVE_KEY);
    if (last) {
      try {
        const pts: Point[] = JSON.parse(last);
        if (pts.length) {
          setMode('PRESET');
          setPoints(pts);
          computeDFT(pts);
        }
      } catch {
        // ignore corrupted autosave
      }
    }
  }, []);

  useEffect(() => {
    const updateColors = () => {
      const styles = getComputedStyle(document.documentElement);
      const nextBg = styles.getPropertyValue('--color-code-bg').trim();
      const nextGrid = styles.getPropertyValue('--fourier-grid').trim();
      setCanvasBg(nextBg || '#0f172a');
      setGridColor(nextGrid || 'rgba(148, 163, 184, 0.22)');
    };
    updateColors();

    const observer = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(updateColors)
      : null;

    if (observer) {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }

    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const max = safeMode ? Math.min(fourierX.length, SAFE_MAX_TERMS) : fourierX.length;
    if (max === 0) return;
    setNumEpicycles((prev) => Math.min(Math.max(prev || 1, 1), max));
  }, [fourierX.length, safeMode]);

  useEffect(() => {
    if (!stepMode && stepIndex !== 0) {
      setStepIndex(0);
    }
  }, [stepMode, stepIndex]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
      if (document.fullscreenElement) {
        setIsPseudoFullscreen(false);
      }
      resizeCanvases();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [resizeCanvases]);

  useEffect(() => {
    document.body.classList.toggle('fourier-pseudo-fullscreen', isPseudoFullscreen);
    const raf = window.requestAnimationFrame(() => {
      resizeCanvases();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.classList.remove('fourier-pseudo-fullscreen');
    };
  }, [isPseudoFullscreen, resizeCanvases]);

  useEffect(() => {
    if (!isPseudoFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPseudoFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPseudoFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const stage = containerRef.current;
    if (!stage) return;
    const nativeActive = document.fullscreenElement === stage;

    if (nativeActive || isPseudoFullscreen) {
      if (nativeActive) {
        document.exitFullscreen().catch(() => {
          // noop – exiting fullscreen failed
        });
      } else {
        setIsPseudoFullscreen(false);
      }
      return;
    }

    if (typeof stage.requestFullscreen === 'function') {
      // Some environments (notably iOS Safari + certain embedded/webview contexts)
      // expose requestFullscreen but never actually enter fullscreen. Detect that and
      // fall back to CSS fullscreen so mobile always has a working "fullscreen" mode.
      const fallbackTimer = window.setTimeout(() => {
        if (document.fullscreenElement !== stage) {
          setIsPseudoFullscreen(true);
        }
      }, 450);

      let nativeRequest: Promise<void> | null = null;
      try {
        nativeRequest = stage.requestFullscreen();
      } catch {
        window.clearTimeout(fallbackTimer);
        setIsPseudoFullscreen(true);
        return;
      }

      Promise.resolve(nativeRequest).catch(() => {
        // Fullscreen can be blocked; fall back to CSS fullscreen.
        setIsPseudoFullscreen(true);
      }).finally(() => {
        window.clearTimeout(fallbackTimer);
        // If the promise resolved but fullscreen was not entered, keep the CSS fallback.
        if (document.fullscreenElement !== stage) {
          setIsPseudoFullscreen(true);
        }
      });
      return;
    }

    setIsPseudoFullscreen(true);
  }, [isPseudoFullscreen]);

  const metrics = React.useMemo(
    () => computeEnergyMetrics(fourierX, points, numEpicycles),
    [fourierX, numEpicycles, points]
  );

  // --- Handlers ---

  const getPointerContext = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const viewport: Viewport = { width: rect.width, height: rect.height };
    if (!isValidViewport(viewport)) return null;
    return { viewport, screen: { x: clientX - rect.left, y: clientY - rect.top } };
  };

  const beginPan = (pointerId: number, start: ScreenPoint) => {
    const startView = renderStateRef.current.view;
    panRef.current = {
      pointerId,
      start,
      startOffsetX: startView.offsetX,
      startOffsetY: startView.offsetY
    };
  };

  const beginPinch = (viewport: Viewport) => {
    const entries = Array.from(touchPointsRef.current.entries());
    if (entries.length < 2) return;
    const [a, b] = entries;
    const id1 = a[0];
    const id2 = b[0];
    const p1 = a[1];
    const p2 = b[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 2) return;

    const startView = renderStateRef.current.view;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    pinchRef.current = {
      ids: [id1, id2],
      startDist: dist,
      startView,
      worldAtMid: screenToWorld(mid, viewport, startView),
      viewport
    };
    panRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = getPointerContext(e.clientX, e.clientY);
    if (!ctx) return;

    const { viewport, screen } = ctx;

    if (e.pointerType === 'touch') {
      if (isDrawingRef.current && activePointerIdRef.current !== e.pointerId) {
        return;
      }
      touchPointsRef.current.set(e.pointerId, screen);
      if (touchPointsRef.current.size === 2) {
        touchDrawRef.current = null;
        beginPinch(viewport);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore pointer-capture failures
        }
        return;
      }

      if (touchPointsRef.current.size > 1) return;

      if (mode !== 'DRAW') {
        touchDrawRef.current = null;
        beginPan(e.pointerId, screen);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore pointer-capture failures
        }
        return;
      }

      // In DRAW mode, delay starting the stroke until the finger actually moves.
      // This prevents accidental dots/strokes when the user is trying to pinch-zoom.
      touchDrawRef.current = {
        pointerId: e.pointerId,
        start: screen,
        viewport,
        startView: renderStateRef.current.view
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore pointer-capture failures
      }
      return;
    }

    if (e.pointerType === 'mouse' && e.button === 0 && spacePressedRef.current) {
      beginPan(e.pointerId, screen);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore pointer-capture failures
      }
      return;
    }

    if (mode !== 'DRAW') return;
    if (isDrawingRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDrawingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    setIsDrawing(true);
    setPoints([]);
    clearPathCanvas();
    setFourierX([]);
    setIsPlaying(false);
    setStepIndex(0);
    setStepMode(false);

    const world = screenToWorld(screen, viewport, renderStateRef.current.view);
    setPoints([world]);
    pointsRef.current = [world];
    touchDrawRef.current = null;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer-capture failures
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = getPointerContext(e.clientX, e.clientY);
    if (!ctx) return;

    const { viewport, screen } = ctx;

    if (e.pointerType === 'touch' && touchPointsRef.current.has(e.pointerId)) {
      touchPointsRef.current.set(e.pointerId, screen);

      const pinch = pinchRef.current;
      if (pinch && (e.pointerId === pinch.ids[0] || e.pointerId === pinch.ids[1])) {
        const p1 = touchPointsRef.current.get(pinch.ids[0]);
        const p2 = touchPointsRef.current.get(pinch.ids[1]);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        if (!Number.isFinite(dist) || dist < 2) return;
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const factor = dist / pinch.startDist;
        const targetScale = pinch.startView.scale * factor;
        setView(() => viewFromWorldAnchor(pinch.worldAtMid, pinch.viewport, mid, targetScale, MIN_VIEW_SCALE, MAX_VIEW_SCALE));
        return;
      }
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      const dx = screen.x - pan.start.x;
      const dy = screen.y - pan.start.y;
      setView((prev) => ({ ...prev, offsetX: pan.startOffsetX + dx, offsetY: pan.startOffsetY + dy }));
      return;
    }

    if (e.pointerType === 'touch' && mode === 'DRAW' && !isDrawingRef.current) {
      const pending = touchDrawRef.current;
      if (pending && pending.pointerId === e.pointerId && touchPointsRef.current.size === 1) {
        const moved = Math.hypot(screen.x - pending.start.x, screen.y - pending.start.y);
        if (moved < 3) {
          return;
        }

        isDrawingRef.current = true;
        activePointerIdRef.current = e.pointerId;
        setIsDrawing(true);
        clearPathCanvas();
        setFourierX([]);
        setIsPlaying(false);
        setStepIndex(0);
        setStepMode(false);

        const startWorld = screenToWorld(pending.start, pending.viewport, pending.startView);
        pointsRef.current = [startWorld];
        setPoints([startWorld]);
        touchDrawRef.current = null;
      }
    }

    if (!isDrawingRef.current || mode !== 'DRAW') return;
    if (activePointerIdRef.current !== e.pointerId) return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      // Mouse button released outside canvas; stop drawing to avoid "stuck" scribbles.
      isDrawingRef.current = false;
      activePointerIdRef.current = null;
      setIsDrawing(false);
      return;
    }

    const activeView = renderStateRef.current.view;
    const world = screenToWorld(screen, viewport, activeView);
    const last = pointsRef.current[pointsRef.current.length - 1];
    const minStep = MIN_POINT_STEP / Math.max(activeView.scale, 0.001);

    if (Math.hypot(world.x - last.x, world.y - last.y) > minStep) {
      pointsRef.current.push(world);
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e) return;

    if (e.pointerType === 'touch') {
      touchPointsRef.current.delete(e.pointerId);
      if (pinchRef.current && (pinchRef.current.ids[0] === e.pointerId || pinchRef.current.ids[1] === e.pointerId)) {
        pinchRef.current = null;
      }
      if (!isDrawingRef.current && touchDrawRef.current?.pointerId === e.pointerId) {
        touchDrawRef.current = null;
        return;
      }
    }

    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
    }

    if (!isDrawingRef.current) return;
    if (typeof e.pointerId === 'number' && activePointerIdRef.current !== e.pointerId) return;

    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    setIsDrawing(false);

    const pts = pointsRef.current;
    if (pts.length > 1) {
      computeDFT(pts);
    } else {
      setPoints([]);
      setFourierX([]);
      setIsPlaying(false);
    }
  };

  const handlePointerCancel = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e?.pointerType === 'touch') {
      touchPointsRef.current.delete(e.pointerId);
      pinchRef.current = null;
      if (typeof e.pointerId === 'number' && touchDrawRef.current?.pointerId === e.pointerId) {
        touchDrawRef.current = null;
      }
    }
    if (typeof e?.pointerId === 'number' && panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    setIsDrawing(false);
  };

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // Trackpad "pinch" on desktop typically arrives as Ctrl+wheel.
      if (!event.ctrlKey && !event.metaKey) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const viewport: Viewport = { width: rect.width, height: rect.height };
      if (!isValidViewport(viewport)) return;
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((prev) => zoomViewByFactorAt(prev, viewport, screen, factor, MIN_VIEW_SCALE, MAX_VIEW_SCALE));
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    const handleGlobalEnd = (ev: Event) => {
      const pointerId = (ev as PointerEvent).pointerId;

      if (typeof pointerId === 'number') {
        touchPointsRef.current.delete(pointerId);
        if (touchDrawRef.current?.pointerId === pointerId) {
          touchDrawRef.current = null;
        }
        if (panRef.current?.pointerId === pointerId) {
          panRef.current = null;
        }
        if (pinchRef.current && (pinchRef.current.ids[0] === pointerId || pinchRef.current.ids[1] === pointerId)) {
          pinchRef.current = null;
        }
      }

      if (!isDrawingRef.current) return;
      if (typeof pointerId === 'number' && activePointerIdRef.current !== null && pointerId !== activePointerIdRef.current) {
        return;
      }

      isDrawingRef.current = false;
      activePointerIdRef.current = null;
      setIsDrawing(false);

      const pts = pointsRef.current;
      if (pts.length > 1) {
        computeDFT(pts);
      } else {
        setPoints([]);
        setFourierX([]);
        setIsPlaying(false);
      }
    };

    const handleBlur = () => {
      panRef.current = null;
      pinchRef.current = null;
      touchPointsRef.current.clear();
      touchDrawRef.current = null;
      spacePressedRef.current = false;
      handleGlobalEnd(new Event('blur'));
    };

    window.addEventListener('pointerup', handleGlobalEnd);
    window.addEventListener('pointercancel', handleGlobalEnd);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointerup', handleGlobalEnd);
      window.removeEventListener('pointercancel', handleGlobalEnd);
      window.removeEventListener('blur', handleBlur);
    };
  }, [computeDFT]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (isTypingTarget(event.target)) return;
      spacePressedRef.current = true;
      event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spacePressedRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleClear = () => {
    setPoints([]);
    clearPathCanvas();
    setFourierX([]);
    setIsPlaying(false);
    setMode('DRAW');
    setStepIndex(0);
    setStepMode(false);
    setView(DEFAULT_VIEW);
    pointsRef.current = [];
  };

  const handlePreset = (name: string) => {
      let pts: Point[] = [];
      switch(name) {
          case 'circle': pts = generateCircle(); break;
          case 'square': pts = generateSquare(); break;
          case 'heart': pts = generateHeart(); break;
          case 'infinity': pts = generateInfinity(); break;
          case 'note': pts = generateMusicNote(); break;
      }
      setMode('PRESET');
      setPoints(pts);
      computeDFT(pts);
  };

  const handleSave = () => {
    if (points.length < 2) {
        alert("Draw something first!");
        return;
    }
    const name = prompt("Enter a name for this drawing:");
    if (name) {
        try {
            localStorage.setItem(`fourier_viz_${name}`, JSON.stringify(points));
            // Update list
            setSavedDrawings(prev => {
                const newList = [...prev];
                if (!newList.includes(name)) newList.push(name);
                return newList.sort();
            });
        } catch (e) {
            alert("Failed to save. Storage might be full.");
        }
    }
  };

  const handleLoad = (name: string) => {
    const data = localStorage.getItem(`fourier_viz_${name}`);
    if (data) {
        try {
            const pts = JSON.parse(data);
            setPoints(pts);
            setMode('PRESET'); // Use preset mode to prevent accidental clearing by mouse down
            computeDFT(pts);
        } catch (e) {
            console.error("Error loading drawing", e);
        }
    }
  };

  const buildUploadEdgeOptions = (detailValue: number, relaxed = false): EdgeProcessingOptions => {
    const detail = detailValue / 100;
    if (!relaxed) return { detail };
    return {
      detail,
      highPercentile: 80,
      lowRatio: 0.35
    };
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type && !file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        alert("File too large for in-browser processing. Please pick an image under 10MB.");
        return;
      }
      setIsProcessing(true);
      lastUploadFileRef.current = file;
      try {
        let pts = await processImage(file, 900, buildUploadEdgeOptions(outlineDetail));
        if (pts.length === 0) {
          alert("No clear edges detected. Retrying with higher sensitivity.");
          pts = await processImage(file, 900, buildUploadEdgeOptions(outlineDetail, true));
        }
        if (pts.length > 0) {
            setPoints(pts);
            setMode('UPLOAD');
            computeDFT(pts);
        } else {
            alert("No clear shape found. Try an image with higher contrast.");
        }
      } catch (err) {
        console.error(err);
        alert("Error processing image.");
      } finally {
        setIsProcessing(false);
        e.target.value = '';
      }
    }
  };

  useEffect(() => {
    if (mode !== 'UPLOAD') return;
    const file = lastUploadFileRef.current;
    if (!file) return;

    const timer = window.setTimeout(async () => {
      setIsProcessing(true);
      try {
        let pts = await processImage(file, 900, buildUploadEdgeOptions(outlineDetail));
        if (pts.length === 0) {
          pts = await processImage(file, 900, buildUploadEdgeOptions(outlineDetail, true));
        }
        if (pts.length > 0) {
          setPoints(pts);
          computeDFT(pts);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [mode, outlineDetail, computeDFT]);

  const stepTo = (nextIndex: number) => {
    if (!fourierX.length) return;
    setStepMode(true);
    const clamped = Math.min(Math.max(nextIndex, 0), Math.max(effectiveMax - 1, 0));
    setStepIndex(clamped);
    const desired = clamped + 1;
    if (numEpicycles !== desired) {
      setNumEpicycles(desired);
    }
    setPlaybackTime(0);
    clearPathCanvas();
  };

  const handleStepPrev = () => stepTo(stepIndex - 1);
  const handleStepNext = () => stepTo(stepIndex + 1);
  const handleStepPlayOnce = () => {
    if (!stepMode) setStepMode(true);
    setIsPlaying(true);
  };

  // --- Animation Loop ---

  const drawEpicycles = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      terms: FourierTerm[],
      termCount: number,
      t: number,
      stepModeActive: boolean,
      viewScale: number
    ) => {
      let x = 0;
      let y = 0;

      const activeTerms = terms.slice(0, Math.max(termCount, 1));
      const highlightIdx = Math.max(activeTerms.length - 1, 0);
      const maxAmp = terms[0]?.amp || 1;
      const invScale = 1 / Math.max(viewScale, 0.001);

      for (let i = 0; i < activeTerms.length; i++) {
        const prevX = x;
        const prevY = y;

        const { freq, amp, phase } = activeTerms[i];
        const angle = freq * t + phase;
        const isHighlight = i === highlightIdx;
        const stroke = termColor(activeTerms[i], maxAmp || amp, isHighlight);
        const flash = stepModeActive && isHighlight ? 1 + 0.25 * Math.sin(t * 6) : 1;

        x += amp * Math.cos(angle);
        y += amp * Math.sin(angle);

        ctx.strokeStyle = stroke;
        ctx.lineWidth = (isHighlight ? 1.6 * flash : 1) * invScale;
        ctx.beginPath();
        ctx.arc(prevX, prevY, amp, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        if (i === activeTerms.length - 1) {
          ctx.fillStyle = stroke;
          ctx.beginPath();
          ctx.arc(x, y, 3 * invScale, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      return { x, y };
    },
    []
  );

  const drawFrame = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const state = renderStateRef.current;

      const dpr = dprRef.current || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const viewScale = Math.max(state.view.scale, 0.001);
      const originX = width / 2 + state.view.offsetX;
      const originY = height / 2 + state.view.offsetY;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.fillStyle = state.canvasBg;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = state.gridColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
      ctx.stroke();

      if (state.points.length > 0 && state.mode !== 'DRAW') {
        ctx.save();
        ctx.translate(originX, originY);
        ctx.scale(viewScale, viewScale);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 / viewScale;
        ctx.beginPath();
        state.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      if (state.mode === 'DRAW' && isDrawingRef.current) {
        ctx.save();
        ctx.translate(originX, originY);
        ctx.scale(viewScale, viewScale);
        ctx.strokeStyle = state.brushColor;
        ctx.lineWidth = state.brushSize / viewScale;
        ctx.beginPath();
        pointsRef.current.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      const t = timeRef.current;

      if (state.fourierX.length > 0) {
        if (pathCanvasRef.current) {
          const pCtx = pathCanvasRef.current.getContext('2d');
          if (pCtx && traceNeedsRedrawRef.current) {
            traceNeedsRedrawRef.current = false;
            pCtx.setTransform(1, 0, 0, 1, 0, 0);
            pCtx.clearRect(0, 0, pathCanvasRef.current.width, pathCanvasRef.current.height);
            const trace = tracePointsRef.current;
            if (trace.length > 1) {
              pCtx.setTransform(1, 0, 0, 1, 0, 0);
              pCtx.scale(dpr, dpr);
              pCtx.lineCap = 'round';
              pCtx.lineJoin = 'round';
              pCtx.translate(originX, originY);
              pCtx.scale(viewScale, viewScale);
              pCtx.strokeStyle = state.brushColor;
              pCtx.lineWidth = state.brushSize / viewScale;
              pCtx.beginPath();
              pCtx.moveTo(trace[0].x, trace[0].y);
              for (let i = 1; i < trace.length; i++) {
                pCtx.lineTo(trace[i].x, trace[i].y);
              }
              pCtx.stroke();
            }
          }

          ctx.drawImage(pathCanvasRef.current, 0, 0, width, height);
        }

        const activeLen = Math.min(Math.max(state.numEpicycles, 1), state.fourierX.length);
        ctx.save();
        ctx.translate(originX, originY);
        ctx.scale(viewScale, viewScale);
        const v = drawEpicycles(ctx, state.fourierX, activeLen, t, state.stepMode, viewScale);
        ctx.restore();

        if (state.isPlaying) {
          const worldPoint = { x: v.x, y: v.y };
          const trace = tracePointsRef.current;

          if (trace.length === 0) {
            trace.push(worldPoint);
          } else {
            const prev = trace[trace.length - 1];
            if (prev.x !== worldPoint.x || prev.y !== worldPoint.y) {
              trace.push(worldPoint);
              if (pathCanvasRef.current) {
                const pCtx = pathCanvasRef.current.getContext('2d');
                if (pCtx) {
                  pCtx.setTransform(1, 0, 0, 1, 0, 0);
                  pCtx.scale(dpr, dpr);
                  pCtx.lineCap = 'round';
                  pCtx.lineJoin = 'round';
                  pCtx.translate(originX, originY);
                  pCtx.scale(viewScale, viewScale);
                  pCtx.strokeStyle = state.brushColor;
                  pCtx.lineWidth = state.brushSize / viewScale;
                  pCtx.beginPath();
                  pCtx.moveTo(prev.x, prev.y);
                  pCtx.lineTo(worldPoint.x, worldPoint.y);
                  pCtx.stroke();
                }
              }
            }
          }
          prevEpicyclePointRef.current = worldPoint;
        } else {
          prevEpicyclePointRef.current = { x: v.x, y: v.y };
        }

        if (state.isPlaying) {
          const sampleCount = Math.max(state.points.length || state.fourierX.length, 1);
          const stepAngle = (2 * Math.PI) / sampleCount;

          const prevTs = lastFrameTimeRef.current;
          const deltaMs = prevTs == null ? 0 : Math.min(Math.max(timestamp - prevTs, 0), 80);
          lastFrameTimeRef.current = timestamp;

          const frameScale = deltaMs / (1000 / 60);
          const dt = stepAngle * state.speed * frameScale;
          const newTime = t + dt;
          const willWrap = newTime >= 2 * Math.PI;

          if (willWrap) {
            timeRef.current = 0;
            clearPathCanvas();
            if (state.stepMode) {
              setIsPlaying(false);
              const cap = state.safeMode ? Math.min(state.fourierX.length, SAFE_MAX_TERMS) : state.fourierX.length;
              setStepIndex((idx) => Math.min(idx + 1, Math.max(cap - 1, 0)));
            }
          } else {
            timeRef.current = newTime;
          }
        } else {
          lastFrameTimeRef.current = timestamp;
        }
      } else {
        lastFrameTimeRef.current = timestamp;
      }

      if (state.showMath) {
        const prevUi = lastUiTimeUpdateRef.current;
        const shouldUpdate = prevUi == null || timestamp - prevUi >= 50;
        if (shouldUpdate) {
          setTime(timeRef.current);
          lastUiTimeUpdateRef.current = timestamp;
        }
      } else {
        lastUiTimeUpdateRef.current = null;
      }
    },
    [clearPathCanvas, drawEpicycles]
  );

  const frameLoop = useCallback(
    (timestamp: number) => {
      const state = renderStateRef.current;
      const shouldAnimate = state.isPlaying || isDrawingRef.current;
      const shouldDraw = needsRedrawRef.current || shouldAnimate;

      if (shouldDraw) {
        drawFrame(timestamp);
        needsRedrawRef.current = false;
      }

      if (shouldAnimate) {
        requestRef.current = requestAnimationFrame(frameLoop);
      } else {
        isAnimatingRef.current = false;
        lastFrameTimeRef.current = null;
        lastUiTimeUpdateRef.current = null;
      }
    },
    [drawFrame]
  );

  const requestRedraw = useCallback(() => {
    needsRedrawRef.current = true;
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    lastFrameTimeRef.current = null;
    requestRef.current = requestAnimationFrame(frameLoop);
  }, [frameLoop]);

  useEffect(() => {
    renderStateRef.current = {
      mode,
      points,
      fourierX,
      time,
      isPlaying,
      numEpicycles,
      showMath,
      canvasBg,
      gridColor,
      speed,
      brushColor,
      brushSize,
      stepMode,
      safeMode,
      stepIndex,
      view
    };
    requestRedraw();
  }, [
    mode,
    points,
    fourierX,
    time,
    isPlaying,
    numEpicycles,
    showMath,
    canvasBg,
    gridColor,
    speed,
    brushColor,
    brushSize,
    stepMode,
    safeMode,
    stepIndex,
    view,
    requestRedraw
  ]);

  useEffect(() => {
    traceNeedsRedrawRef.current = true;
  }, [view.offsetX, view.offsetY, view.scale]);

  useEffect(() => {
    requestRedraw();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [requestRedraw]);

  // Window + container resize handler
  useEffect(() => {
      const handleResize = () => {
        resizeCanvases();
        requestRedraw();
      };
      handleResize(); // Init with container size

      const observer = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;

      if (observer) {
        if (containerRef.current) observer.observe(containerRef.current);
        if (canvasRef.current) observer.observe(canvasRef.current);
      }

       window.addEventListener('resize', handleResize);
       return () => {
           window.removeEventListener('resize', handleResize);
           observer?.disconnect();
       };
  }, [resizeCanvases, requestRedraw]);

  // Clear path when parameters that change the shape trajectory change
  useEffect(() => {
      clearPathCanvas();
  }, [numEpicycles, fourierX]);

  useEffect(() => {
    const host = document.getElementById('fourier-root');
    host?.classList.add('is-mounted');
    return () => {
      host?.classList.remove('is-mounted');
    };
  }, []);

  const effectiveMax = safeMode ? Math.min(fourierX.length, SAFE_MAX_TERMS) : fourierX.length;
  const focusIdx = Math.max(Math.min(numEpicycles - 1, (metrics.breakdown?.length || 1) - 1), 0);
  const deltaEnergy = metrics.breakdown?.[focusIdx]?.energyPct ?? 0;
  const cumulativeEnergy = metrics.breakdown?.[focusIdx]?.cumulativePct ?? metrics.energyPct;
  const fullscreenActive = isFullscreen || isPseudoFullscreen;

  useEffect(() => {
    if (!stepMode) return;
    const desired = Math.min(Math.max(stepIndex + 1, 1), Math.max(effectiveMax, 1));
    if (numEpicycles !== desired) {
      setNumEpicycles(desired);
    }
  }, [stepMode, stepIndex, effectiveMax, numEpicycles]);

  useEffect(() => {
    const maxIdx = Math.max(Math.min(numEpicycles - 1, effectiveMax - 1), 0);
    if (stepIndex > maxIdx) setStepIndex(maxIdx);
  }, [numEpicycles, effectiveMax, stepIndex]);


  return (
    <div
      className={`fourier-stage select-none ${fullscreenActive ? 'is-fullscreen' : ''} ${isPseudoFullscreen ? 'is-pseudo-fullscreen' : ''}`}
      ref={containerRef}
      data-mode={mode}
      data-drawing={isDrawing ? 'true' : 'false'}
      data-has-spectrum={fourierX.length > 0 ? 'true' : 'false'}
      data-points={points.length}
      data-epicycles={numEpicycles}
      data-terms={fourierX.length}
      data-view-scale={view.scale.toFixed(4)}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`fourier-canvas cursor-${mode === 'DRAW' ? 'crosshair' : 'default'}`}
      />

      <Toolbar 
        mode={mode}
        setMode={setMode}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        clear={handleClear}
        numEpicycles={numEpicycles}
        maxEpicycles={effectiveMax}
        setNumEpicycles={setNumEpicycles}
        onUpload={handleUpload}
        showMath={showMath}
        setShowMath={setShowMath}
        onPreset={handlePreset}
        speed={speed}
        setSpeed={setSpeed}
        onReset={handleReset}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        smoothing={smoothing}
        setSmoothing={setSmoothing}
        outlineDetail={outlineDetail}
        setOutlineDetail={setOutlineDetail}
        isDrawing={isDrawing}
        onSave={handleSave}
        onLoad={handleLoad}
        savedDrawings={savedDrawings}
        isFullscreen={fullscreenActive}
        onToggleFullscreen={toggleFullscreen}
        safeMode={safeMode}
        onToggleSafeMode={() => setSafeMode((s) => !s)}
        stepMode={stepMode}
        onToggleStepMode={() => setStepMode((s) => !s)}
        stepIndex={stepIndex}
        stepMax={effectiveMax}
        onStepPrev={handleStepPrev}
        onStepNext={handleStepNext}
        onStepPlayOnce={handleStepPlayOnce}
        viewScale={view.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={fitView}
        onResetView={resetView}
      />

      {showMath && fourierX.length > 0 && (
        <MathPanel 
            terms={fourierX} 
            time={time} 
            epicycles={numEpicycles} 
            metrics={metrics}
            focusIndex={stepMode ? Math.max(numEpicycles - 1, 0) : undefined}
            stepMode={stepMode}
        />
      )}

      {stepMode && fourierX.length > 0 && (
        <div className="absolute top-4 left-4 z-[60] bg-slate-900/80 text-slate-100 border border-slate-700 rounded-lg px-4 py-3 shadow-lg space-y-1">
          <div className="text-xs uppercase tracking-wide text-slate-400">Step mode</div>
          <div className="text-sm font-semibold">
            Term {Math.min(numEpicycles, effectiveMax)} / {Math.max(effectiveMax, 1)}
          </div>
          <div className="text-xs text-slate-200">
            Δenergy {deltaEnergy.toFixed(2)}% · Cumulative {cumulativeEnergy.toFixed(2)}% · RMS {metrics.rmsError.toFixed(2)} px
          </div>
        </div>
      )}

      {isProcessing && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
              <div className="text-cyan-400 font-mono text-xl animate-pulse">
                  Processing Image...
              </div>
          </div>
      )}

      {/* Start Instruction */}
      {mode === 'DRAW' && points.length === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
             <h1 className="text-4xl font-bold text-slate-200 mb-2 drop-shadow">Draw Something</h1>
             <p className="text-slate-300">Trace a continuous line to begin</p>
          </div>
      )}

    </div>
  );
};

export default App;
