import React, { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Pause, 
  Trash2, 
  Activity, 
  PenTool, 
  Shapes, 
  Image as ImageIcon,
  Calculator,
  RotateCcw,
  Gauge,
  Palette,
  Circle,
  Waves,
  Save,
  FolderOpen,
  Maximize2,
  Minimize2,
  Shield,
  SkipForward,
  SkipBack,
  ChevronsRight
} from 'lucide-react';
import { InputMode } from '../types';

interface ToolbarProps {
  mode: InputMode;
  setMode: (m: InputMode) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  clear: () => void;
  numEpicycles: number;
  maxEpicycles: number;
  setNumEpicycles: (n: number) => void;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  showMath: boolean;
  setShowMath: (s: boolean) => void;
  onPreset: (name: string) => void;
  speed: number;
  setSpeed: (s: number) => void;
  onReset: () => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (s: number) => void;
  smoothing: number;
  setSmoothing: (s: number) => void;
  outlineDetail: number;
  setOutlineDetail: (v: number) => void;
  isDrawing: boolean;
  onSave: () => void;
  onLoad: (name: string) => void;
  savedDrawings: string[];
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  safeMode: boolean;
  onToggleSafeMode: () => void;
  stepMode: boolean;
  onToggleStepMode: () => void;
  stepIndex: number;
  stepMax: number;
  onStepPrev: () => void;
  onStepNext: () => void;
  onStepPlayOnce: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  mode,
  setMode,
  isPlaying,
  setIsPlaying,
  clear,
  numEpicycles,
  maxEpicycles,
  setNumEpicycles,
  onUpload,
  showMath,
  setShowMath,
  onPreset,
  speed,
  setSpeed,
  onReset,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  smoothing,
  setSmoothing,
  outlineDetail,
  setOutlineDetail,
  isDrawing,
  onSave,
  onLoad,
  savedDrawings,
  isFullscreen,
  onToggleFullscreen,
  safeMode,
  onToggleSafeMode,
  stepMode,
  onToggleStepMode,
  stepIndex,
  stepMax,
  onStepPrev,
  onStepNext,
  onStepPlayOnce
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetsWrapperRef = useRef<HTMLDivElement>(null);
  const loadWrapperRef = useRef<HTMLDivElement>(null);
  const [openDropdown, setOpenDropdown] = useState<null | 'presets' | 'load'>(null);
  const [useClickToggle, setUseClickToggle] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    const hoverNone = window.matchMedia('(hover: none)').matches;
    const hoverCapable = window.matchMedia('(hover: hover)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    return hoverNone || !hoverCapable || !finePointer;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const hoverNoneQuery = window.matchMedia('(hover: none)');
    const hoverCapableQuery = window.matchMedia('(hover: hover)');
    const finePointerQuery = window.matchMedia('(pointer: fine)');

    const update = () => {
      const hoverNone = hoverNoneQuery.matches;
      const hoverCapable = hoverCapableQuery.matches;
      const finePointer = finePointerQuery.matches;
      setUseClickToggle(hoverNone || !hoverCapable || !finePointer);
    };

    const add = (query: MediaQueryList) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', update);
      } else if (typeof query.addListener === 'function') {
        query.addListener(update);
      }
    };
    const remove = (query: MediaQueryList) => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', update);
      } else if (typeof query.removeListener === 'function') {
        query.removeListener(update);
      }
    };

    add(hoverNoneQuery);
    add(hoverCapableQuery);
    add(finePointerQuery);
    update();
    return () => {
      remove(hoverNoneQuery);
      remove(hoverCapableQuery);
      remove(finePointerQuery);
    };
  }, []);

  useEffect(() => {
    if (!openDropdown) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (presetsWrapperRef.current?.contains(target)) return;
      if (loadWrapperRef.current?.contains(target)) return;

      setOpenDropdown(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  const toggleDropdown = useCallback((id: 'presets' | 'load') => {
    setOpenDropdown((current) => (current === id ? null : id));
  }, []);

  const btnClass = (active: boolean) => `
    p-2.5 rounded-lg transition-all duration-200 flex items-center justify-center
    ${active 
      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-transparent'}
  `;

  return (
    <>
      {/* Top Bar */}
      <div className="fourier-toolbar fourier-toolbar--top">
        <div className="flex gap-1 mr-4 pl-2">
            <Activity className="w-5 h-5 text-fuchsia-500" />
            <span className="font-bold text-slate-100 hidden sm:block">Fourier<span className="text-fuchsia-500">Viz</span></span>
        </div>

        <div className="h-6 w-px bg-slate-700 mx-1"></div>

        <button 
          onClick={() => setMode('DRAW')}
          className={btnClass(mode === 'DRAW')}
          title="Freehand Draw"
        >
          <PenTool size={20} />
        </button>

        <div
          className="relative"
          ref={presetsWrapperRef}
          onPointerEnter={() => {
            if (useClickToggle) return;
            setOpenDropdown('presets');
          }}
          onPointerLeave={() => {
            if (useClickToggle) return;
            setOpenDropdown((current) => (current === 'presets' ? null : current));
          }}
        >
          <button
            type="button"
            className={btnClass(mode === 'PRESET')}
            title="Presets"
            aria-expanded={openDropdown === 'presets'}
            aria-controls="fourier-presets-menu"
            onClick={() => toggleDropdown('presets')}
          >
            <Shapes size={20} />
          </button>
          <div
            id="fourier-presets-menu"
            role="menu"
            style={{ display: openDropdown === 'presets' ? 'block' : 'none' }}
            className="absolute top-full left-0 w-32 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPreset('circle');
                setOpenDropdown(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              Circle
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPreset('square');
                setOpenDropdown(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              Square
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPreset('heart');
                setOpenDropdown(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              Heart
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPreset('infinity');
                setOpenDropdown(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              Infinity
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPreset('note');
                setOpenDropdown(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              Note
            </button>
          </div>
        </div>

        {/* Load Saved Dropdown */}
        <div
          className="relative"
          ref={loadWrapperRef}
          onPointerEnter={() => {
            if (useClickToggle) return;
            setOpenDropdown('load');
          }}
          onPointerLeave={() => {
            if (useClickToggle) return;
            setOpenDropdown((current) => (current === 'load' ? null : current));
          }}
        >
          <button
            type="button"
            className={btnClass(false)}
            title="Load Saved Drawing"
            aria-expanded={openDropdown === 'load'}
            aria-controls="fourier-load-menu"
            onClick={() => toggleDropdown('load')}
          >
            <FolderOpen size={20} />
          </button>
          <div
            id="fourier-load-menu"
            role="menu"
            style={{ display: openDropdown === 'load' ? 'block' : 'none' }}
            className="absolute top-full left-0 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar z-50"
          >
            {savedDrawings.length === 0 ? (
              <div className="px-4 py-2 text-sm text-slate-500 italic">No saved drawings</div>
            ) : (
              savedDrawings.map((name) => (
                <button
                  type="button"
                  role="menuitem"
                  key={name}
                  onClick={() => {
                    onLoad(name);
                    setOpenDropdown(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400 truncate border-b border-slate-800 last:border-0"
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Save Button */}
        <button 
            onClick={onSave}
            className={btnClass(false)}
            title="Save Current Drawing"
        >
            <Save size={20} />
        </button>

        <button 
          onClick={() => fileInputRef.current?.click()}
          className={btnClass(mode === 'UPLOAD')}
          title="Upload Image"
        >
          <ImageIcon size={20} />
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onUpload} 
            accept="image/*" 
            className="hidden" 
        />

        <div className="h-6 w-px bg-slate-700 mx-1"></div>

        {/* Brush Settings */}
        <div className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-300 ${isDrawing ? 'bg-fuchsia-900/20 ring-1 ring-fuchsia-500/50' : ''}`}>
            <div className="relative flex items-center group" title="Brush Color">
                <Palette size={18} className={`${isDrawing ? 'text-fuchsia-400' : 'text-slate-400'} mr-2 transition-colors`} />
                <input 
                    type="color" 
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-6 h-6 rounded border-none cursor-pointer bg-transparent"
                />
            </div>
            <div className="flex items-center gap-2" title="Brush Size">
                <Circle size={10} className="text-slate-400" />
                <input 
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-400"
                />
                <Circle size={16} className={`text-slate-400 transition-all ${isDrawing ? 'scale-110 text-fuchsia-300' : ''}`} />
            </div>
        </div>

        <div className="h-6 w-px bg-slate-700 mx-1"></div>

        <button 
          onClick={clear}
          className="p-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          title="Clear Canvas"
        >
          <Trash2 size={20} />
        </button>
        
        <button
          onClick={() => setShowMath(!showMath)}
          className={btnClass(showMath)}
          title="Toggle Math Panel"
        >
            <Calculator size={20} />
        </button>

        <button
          onClick={onToggleSafeMode}
          className={btnClass(safeMode)}
          title="Toggle safe mode (cap epicycles / lighten rendering)"
        >
            <Shield size={20} />
        </button>

        <button
          onClick={onToggleStepMode}
          className={btnClass(stepMode)}
          title="Toggle step-through playback"
        >
            <ChevronsRight size={20} />
        </button>

        <button
          onClick={onToggleFullscreen}
          className={btnClass(isFullscreen)}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Play'}
        >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>

      {/* Bottom Bar */}
      <div className="fourier-toolbar fourier-toolbar--bottom">
         <div className="flex flex-col md:flex-row items-center gap-6">
            
            {/* Controls */}
            <div className="flex items-center gap-3">
                 <button 
                    onClick={onReset}
                    className="p-3 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                    title="Reset Animation"
                >
                    <RotateCcw size={18} />
                </button>
                
                <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                >
                    {isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" className="ml-1" size={24} />}
                </button>

                {stepMode && (
                  <div className="flex items-center gap-2 bg-slate-800/70 rounded-full px-3 py-2 border border-slate-700">
                    <button
                      onClick={onStepPrev}
                      className="p-2 rounded-full bg-slate-900 text-slate-200 hover:bg-slate-700 transition"
                      title="Previous term"
                    >
                      <SkipBack size={16} />
                    </button>
                    <button
                      onClick={onStepPlayOnce}
                      className="px-3 py-2 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 transition"
                      title="Play this term once"
                    >
                      Step
                    </button>
                    <button
                      onClick={onStepNext}
                      className="p-2 rounded-full bg-slate-900 text-slate-200 hover:bg-slate-700 transition"
                      title="Next term"
                    >
                      <SkipForward size={16} />
                    </button>
                    <span className="text-xs text-slate-300 font-semibold ml-1">Term {stepIndex + 1} / {Math.max(stepMax, 1)}</span>
                  </div>
                )}
            </div>

            {/* Sliders Container */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
                {/* Epicycles / Precision */}
                <div className="flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <span>Precision</span>
                        <span className="text-cyan-400">
                          {numEpicycles} / {maxEpicycles}{safeMode ? ' (capped)' : ''}
                        </span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max={maxEpicycles || 1} 
                        value={numEpicycles} 
                        onChange={(e) => setNumEpicycles(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                </div>

                {/* Speed Control */}
                <div className="flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <div className="flex items-center gap-1">
                             <Gauge size={12} />
                             <span>Speed</span>
                        </div>
                        <span className="text-amber-400">{speed.toFixed(2)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.05" 
                        max="3" 
                        step="0.05"
                        value={speed} 
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>

                {/* Smoothing Control */}
                <div className="flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <div className="flex items-center gap-1">
                             <Waves size={12} />
                             <span>Smoothness</span>
                        </div>
                        <span className="text-emerald-400">{smoothing}px</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="20" 
                        step="1"
                        value={smoothing} 
                        onChange={(e) => setSmoothing(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>

                {/* Outline Detail Control */}
                <div className="flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <div className="flex items-center gap-1">
                             <ChevronsRight size={12} />
                             <span>Outline detail</span>
                        </div>
                        <span className="text-violet-300">{outlineDetail}%</span>
                    </div>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        step="1"
                        value={outlineDetail}
                        onChange={(e) => setOutlineDetail(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-400"
                    />
                </div>
            </div>

         </div>
      </div>
    </>
  );
};

export default Toolbar;
