import React, { ChangeEvent, useRef } from 'react';
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
  FolderOpen
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
  isDrawing: boolean;
  onSave: () => void;
  onLoad: (name: string) => void;
  savedDrawings: string[];
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
  isDrawing,
  onSave,
  onLoad,
  savedDrawings
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        <div className="relative group">
            <button 
            className={btnClass(mode === 'PRESET')}
            title="Presets"
            >
            <Shapes size={20} />
            </button>
            {/* Dropdown for presets */}
            <div className="absolute top-full left-0 mt-2 w-32 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden hidden group-hover:block">
                <button onClick={() => onPreset('circle')} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Circle</button>
                <button onClick={() => onPreset('square')} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Square</button>
                <button onClick={() => onPreset('heart')} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Heart</button>
                <button onClick={() => onPreset('infinity')} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Infinity</button>
                <button onClick={() => onPreset('note')} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Note</button>
            </div>
        </div>

        {/* Load Saved Dropdown */}
        <div className="relative group">
            <button 
                className={btnClass(false)}
                title="Load Saved Drawing"
            >
                <FolderOpen size={20} />
            </button>
            <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden hidden group-hover:block max-h-60 overflow-y-auto custom-scrollbar">
                {savedDrawings.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-slate-500 italic">No saved drawings</div>
                ) : (
                    savedDrawings.map(name => (
                        <button 
                            key={name} 
                            onClick={() => onLoad(name)} 
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
            </div>

            {/* Sliders Container */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {/* Epicycles / Precision */}
                <div className="flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <span>Precision</span>
                        <span className="text-cyan-400">{numEpicycles} / {maxEpicycles}</span>
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
                        <span className="text-amber-400">{speed.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="5" 
                        step="0.1"
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
            </div>

         </div>
      </div>
    </>
  );
};

export default Toolbar;
