import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FourierTerm, Point, InputMode } from './types';
import { generateCircle, generateHeart, generateInfinity, generateMusicNote, generateSquare } from './services/mathUtils';
import { processImage } from './services/imageProcessing';
import { computeFourier, preparePoints } from './services/fourierEngine';
import { computeEnergyMetrics } from './services/metrics';
import { termColor } from './services/visualUtils';
import Toolbar from './components/Toolbar';
import MathPanel from './components/MathPanel';

const MAX_FOURIER_TERMS = 1600;
const SAFE_MAX_TERMS = 700;
const MIN_POINT_STEP = 2.5;
const DEFAULT_SPEED = 0.6;
const MAX_UPLOAD_BYTES = 3_000_000;
const AUTO_SAVE_KEY = 'fourier_viz__last_session';

const App: React.FC = () => {
  // State
  const [mode, setMode] = useState<InputMode>('DRAW');
  const [points, setPoints] = useState<Point[]>([]); 
  const [fourierX, setFourierX] = useState<FourierTerm[]>([]); 
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [numEpicycles, setNumEpicycles] = useState(0);
  const [showMath, setShowMath] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canvasBg, setCanvasBg] = useState('#0f172a');
  const [gridColor, setGridColor] = useState('rgba(148, 163, 184, 0.22)');
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [smoothing, setSmoothing] = useState(0);
  const [savedDrawings, setSavedDrawings] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  
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
  
  // Optimization: Offscreen canvas for path trail
  const pathCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevEpicyclePointRef = useRef<Point | null>(null);

  const clearPathCanvas = useCallback(() => {
    if (pathCanvasRef.current) {
      const ctx = pathCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, pathCanvasRef.current.width, pathCanvasRef.current.height);
    }
    prevEpicyclePointRef.current = null;
  }, []);

  const resizeCanvases = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { width, height } = container.getBoundingClientRect();
    const safeWidth = Math.max(width, 360);
    const safeHeight = Math.max(height, 360);

    canvas.width = safeWidth;
    canvas.height = safeHeight;
    canvas.style.width = `${safeWidth}px`;
    canvas.style.height = `${safeHeight}px`;

    if (!pathCanvasRef.current) {
      pathCanvasRef.current = document.createElement('canvas');
    }
    pathCanvasRef.current.width = safeWidth;
    pathCanvasRef.current.height = safeHeight;
    clearPathCanvas();
  }, [clearPathCanvas]);

  const resetSimulation = useCallback(() => {
    setTime(0);
    clearPathCanvas();
  }, [clearPathCanvas]);

  const handleReset = () => {
    resetSimulation();
  };

  const computeDFT = useCallback((pts: Point[]) => {
    if (pts.length === 0) return;
    const limit = safeMode ? SAFE_MAX_TERMS : MAX_FOURIER_TERMS;
    const { prepared, spectrum } = computeFourier(pts, { smoothing, limit });
    setPoints(prepared);
    setFourierX(spectrum);
    setNumEpicycles(Math.min(spectrum.length, limit));
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
      resizeCanvases();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [resizeCanvases]);

  const toggleFullscreen = useCallback(() => {
    const stage = containerRef.current;
    if (!stage) return;
    if (!document.fullscreenElement) {
      stage.requestFullscreen().catch(() => {
        // noop – fullscreen can be blocked by the browser
      });
    } else {
      document.exitFullscreen().catch(() => {
        // noop – exiting fullscreen failed
      });
    }
  }, []);

  const metrics = React.useMemo(
    () => computeEnergyMetrics(fourierX, points, numEpicycles),
    [fourierX, numEpicycles, points]
  );

  // --- Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'DRAW') return;
    isDrawingRef.current = true;
    setIsDrawing(true);
    setPoints([]); 
    clearPathCanvas();
    setFourierX([]);
    setIsPlaying(false);
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    const p = { x, y };
    setPoints([p]);
    pointsRef.current = [p];
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || mode !== 'DRAW') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    const p = { x, y };
    const last = pointsRef.current[pointsRef.current.length - 1];
    
    if (Math.hypot(p.x - last.x, p.y - last.y) > MIN_POINT_STEP) {
        setPoints(prev => [...prev, p]);
        pointsRef.current.push(p);

        // Real-time update
        if (pointsRef.current.length % 5 === 0 && pointsRef.current.length > 2) {
             const currentPts = pointsRef.current;
             const preview = computeFourier(currentPts, { smoothing, limit: MAX_FOURIER_TERMS });
             setFourierX(preview.spectrum);
             setNumEpicycles(preview.spectrum.length);
             clearPathCanvas(); // Clear path because the shape definition changed
             setIsPlaying(true);
        }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    
    const pts = pointsRef.current;
    let finalPts = pts;
    
    const prepared = preparePoints(pts, smoothing, MAX_FOURIER_TERMS);
    setPoints(prepared);
    computeDFT(prepared);
    // mode remains DRAW
  };

  const handleClear = () => {
    setPoints([]);
    clearPathCanvas();
    setFourierX([]);
    setIsPlaying(false);
    setMode('DRAW');
    setStepIndex(0);
    setStepMode(false);
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_UPLOAD_BYTES) {
        alert("File too large for browser processing. Please pick an image under 3MB.");
        return;
      }
      setIsProcessing(true);
      try {
        const pts = await processImage(file);
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
      }
    }
  };

  const stepTo = (nextIndex: number) => {
    if (!fourierX.length) return;
    setStepMode(true);
    const clamped = Math.min(Math.max(nextIndex, 0), Math.max(effectiveMax - 1, 0));
    setStepIndex(clamped);
    const desired = clamped + 1;
    if (numEpicycles !== desired) {
      setNumEpicycles(desired);
    }
    setTime(0);
    clearPathCanvas();
    prevEpicyclePointRef.current = null;
  };

  const handleStepPrev = () => stepTo(stepIndex - 1);
  const handleStepNext = () => stepTo(stepIndex + 1);
  const handleStepPlayOnce = () => {
    if (!stepMode) setStepMode(true);
    setIsPlaying(true);
  };

  // --- Animation Loop ---

  const drawEpicycles = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    highlightIdx: number,
    maxAmp: number
  ) => {
    let x = width / 2;
    let y = height / 2;

    const activeTerms = fourierX.slice(0, Math.max(numEpicycles, 1));

    for (let i = 0; i < activeTerms.length; i++) {
      const prevX = x;
      const prevY = y;
      
      const { freq, amp, phase } = activeTerms[i];
      const angle = freq * time + phase;
      const isHighlight = i === highlightIdx;
      const stroke = termColor(activeTerms[i], maxAmp || amp, isHighlight);
      const flash = stepMode && isHighlight ? 1 + 0.25 * Math.sin(time * 6) : 1;
      
      x += amp * Math.cos(angle);
      y += amp * Math.sin(angle);

      // Draw Circle
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHighlight ? 1.6 * flash : 1;
      ctx.beginPath();
      ctx.arc(prevX, prevY, amp, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw Radius Line
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
      
      // Tip
      if (i === activeTerms.length - 1) {
          ctx.fillStyle = stroke; // Match dynamic stroke color for tip
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
      }
    }

    return { x, y };
  };

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear Main Screen
    ctx.fillStyle = canvasBg; 
    ctx.fillRect(0, 0, width, height);

    // 2. Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(width/2, 0); ctx.lineTo(width/2, height);
    ctx.moveTo(0, height/2); ctx.lineTo(width, height/2);
    ctx.stroke();

    // 3. User Input (Ghost)
    // Only show ghost if we have points AND we are not drawing actively (cleaner look)
    // Or just always show faint
    if (points.length > 0 && mode !== 'DRAW') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x + width/2, p.y + height/2);
            else ctx.lineTo(p.x + width/2, p.y + height/2);
        });
        ctx.stroke();
    }
    
    // 4. Drawing Mode Input (Active)
    if (mode === 'DRAW' && isDrawingRef.current) {
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        pointsRef.current.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x + width/2, p.y + height/2);
            else ctx.lineTo(p.x + width/2, p.y + height/2);
        });
        ctx.stroke();
    } 

    // 5. Render Epicycles & Path
    if (fourierX.length > 0) {
        // Draw accumulated path from offscreen canvas
        if (pathCanvasRef.current) {
            ctx.drawImage(pathCanvasRef.current, 0, 0);
        }

        const activeLen = Math.min(Math.max(numEpicycles, 1), fourierX.length);
        const highlightIdx = Math.max(activeLen - 1, 0);
        const maxAmp = fourierX[0]?.amp || 1;
        const v = drawEpicycles(ctx, width, height, highlightIdx, maxAmp);
        
        // Update Offscreen Path with continuous strokes
        if (pathCanvasRef.current) {
            const pCtx = pathCanvasRef.current.getContext('2d');
            if (pCtx) {
                pCtx.strokeStyle = brushColor;
                pCtx.lineWidth = brushSize;
                pCtx.lineCap = 'round';
                pCtx.lineJoin = 'round';

                if (prevEpicyclePointRef.current) {
                    pCtx.beginPath();
                    pCtx.moveTo(prevEpicyclePointRef.current.x, prevEpicyclePointRef.current.y);
                    pCtx.lineTo(v.x, v.y);
                    pCtx.stroke();
                }
            }
        }
        prevEpicyclePointRef.current = { x: v.x, y: v.y };

        if (isPlaying) {
             const effectiveTerms = Math.max(numEpicycles || fourierX.length, 1);
             const stepAngle = (2 * Math.PI) / effectiveTerms;
             const dt = stepAngle * speed;
             const newTime = time + dt;
             const willWrap = newTime >= 2 * Math.PI;
             
             if (willWrap) {
                 setTime(0);
                 clearPathCanvas();
                 prevEpicyclePointRef.current = null; // Reset prev point to avoid connecting end to start
                 if (stepMode) {
                   setIsPlaying(false);
                   const cap = safeMode ? Math.min(fourierX.length, SAFE_MAX_TERMS) : fourierX.length;
                   setStepIndex((idx) => Math.min(idx + 1, Math.max(cap - 1, 0)));
                 }
             } else {
                 setTime(newTime);
             }
        }
    }

  }, [fourierX, isPlaying, time, mode, points, numEpicycles, speed, brushColor, brushSize, canvasBg, gridColor, stepMode, safeMode]);

  // Trigger animation
  useEffect(() => {
      requestRef.current = requestAnimationFrame(animate);
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, [animate]);

  // Window + container resize handler
  useEffect(() => {
      const handleResize = () => resizeCanvases();
      handleResize(); // Init with container size

      const observer = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;

      if (observer && containerRef.current) {
        observer.observe(containerRef.current);
      }

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        observer?.disconnect();
      };
  }, [resizeCanvases]);

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
    <div className={`fourier-stage select-none ${isFullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => {
            const touch = e.touches[0];
            handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY } as any);
        }}
        onTouchMove={(e) => {
            const touch = e.touches[0];
            handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as any);
        }}
        onTouchEnd={handleMouseUp}
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
        isDrawing={isDrawing}
        onSave={handleSave}
        onLoad={handleLoad}
        savedDrawings={savedDrawings}
        isFullscreen={isFullscreen}
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
