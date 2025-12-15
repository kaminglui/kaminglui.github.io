import React, { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FourierTerm } from '../types';
import { legendGradient } from '../services/visualUtils';

interface MathPanelProps {
  terms: FourierTerm[];
  time: number;
  epicycles: number;
  metrics: {
    energyPct: number;
    rmsError: number;
    topTerms: { freq: number; amp: number; phase: number; energyPct: number; cumulativePct: number }[];
    breakdown: { energyPct: number; cumulativePct: number }[];
  };
  focusIndex?: number;
  stepMode?: boolean;
}

const MathPanel: React.FC<MathPanelProps> = ({ terms, time, epicycles, metrics, focusIndex, stepMode = false }) => {
  const latexContainerRef = useRef<HTMLDivElement>(null);
  const computeAutoIndex = (count: number, total: number) => Math.max(Math.min(count - 1, total - 1), 0);
  const [activeView, setActiveView] = useState<'dft' | 'reconstruction' | 'phasor'>('dft');
  const [inspectIndex, setInspectIndex] = useState(() => computeAutoIndex(epicycles, terms.length));
  const prevAutoIndexRef = useRef(computeAutoIndex(epicycles, terms.length));

  const stats = useMemo(() => {
    const largest = terms[0];
    const n = terms.length || 1;
    const phaseTurns = (time / (2 * Math.PI)).toFixed(2);
    return {
      n,
      largestRadius: largest ? largest.amp.toFixed(1) : '0.0',
      maxFreq: largest ? largest.freq : 0,
      phaseTurns,
      dominantPhase: largest ? largest.phase.toFixed(2) : '0.00'
    };
  }, [terms, time]);

  const inspected = useMemo(() => {
    const t = terms[Math.min(inspectIndex, Math.max(terms.length - 1, 0))];
    if (!t) {
      return { freq: 0, amp: 0, phase: 0 };
    }
    return t;
  }, [inspectIndex, terms]);

  const inspectEnergy = metrics.breakdown
    ? metrics.breakdown[Math.min(inspectIndex, Math.max(metrics.breakdown.length - 1, 0))] ?? { energyPct: 0, cumulativePct: 0 }
    : { energyPct: 0, cumulativePct: 0 };

  const inspectorKatex = useMemo(() => {
    const opts = { throwOnError: false };
    const n = stats.n || 1;
    const k = inspected.freq;
    const amp = inspected.amp.toFixed(3);
    const phase = inspected.phase.toFixed(3);
    const delta = inspectEnergy.energyPct.toFixed(2);
    const cumulative = inspectEnergy.cumulativePct.toFixed(2);

    return {
      paramsHtml: katex.renderToString(
        `k = ${k},\\quad |X_k| = ${amp},\\quad \\phi_k = ${phase}\\,\\text{rad}`,
        opts
      ),
      vectorHtml: katex.renderToString(
        `\\text{Vector}_k(t) = |X_k|\\,e^{i\\left(2\\pi k t/${n} + \\phi_k\\right)}`,
        opts
      ),
      energyHtml: katex.renderToString(
        `\\Delta\\text{energy} = ${delta}\\%\\quad \\text{cum.} = ${cumulative}\\%`,
        opts
      )
    };
  }, [inspectEnergy, inspected.amp, inspected.freq, inspected.phase, stats.n]);

  useEffect(() => {
    if (!latexContainerRef.current) return;

    const { n, phaseTurns, dominantPhase } = stats;
    const m = Math.max(epicycles, 1);
    const dominantFreq = terms[0]?.freq ?? 0;
    const domRadius = terms[0]?.amp ?? 0;

    const equations: Record<typeof activeView, string> = {
      dft: `
      \\begin{aligned}
        X_k &= \\frac{1}{N} \\sum_{n=0}^{N-1} x_n e^{-i 2\\pi kn / N} \\\\
        &\\textcolor{#f472b6}{N = ${n}},\\; \\textcolor{#22c55e}{k \\in [0, N-1]}
      \\end{aligned}
      `,
      reconstruction: `
      \\begin{aligned}
        x(t) &\\approx \\sum_{j=1}^{${m}} \\left|X_{k_j}\\right| e^{i\\left(k_j t + \\phi_{k_j}\\right)} \\\\
        t &= 2\\pi n/N,\\; k_j \\in \\left[-\\frac{N}{2}, \\frac{N}{2}\\right] \\\\
        &\\textcolor{#22c55e}{\\left|X_{${dominantFreq}}\\right| = ${domRadius.toFixed(2)}},\\;
          \\textcolor{#f472b6}{\\phi_{${dominantFreq}} = ${dominantPhase}}\\;\\text{rad}
      \\end{aligned}
      `,
      phasor: `
      \\begin{aligned}
        \\text{Epicycle}_k(t) &= r_k \\\\
        &\\cdot e^{i(\\omega_k t + \\phi_k)} \\\\
        r_k &= \\left|X_k\\right| \\\\
        \\omega_k &= k \\\\
        t &= ${phaseTurns}\\,\\tau
      \\end{aligned}
      `
    };

    katex.render(equations[activeView], latexContainerRef.current, {
      throwOnError: false,
      displayMode: true
    });
  }, [activeView, epicycles, stats, terms]);

  useEffect(() => {
    setActiveView('dft');
    const nextAuto = computeAutoIndex(epicycles, terms.length);
    prevAutoIndexRef.current = nextAuto;
    setInspectIndex(nextAuto);
  }, [terms.length]);

  useEffect(() => {
    const nextAuto = computeAutoIndex(epicycles, terms.length);
    const prevAuto = prevAutoIndexRef.current;
    prevAutoIndexRef.current = nextAuto;
    if (typeof focusIndex === 'number') return;
    setInspectIndex((current) => (current === prevAuto ? nextAuto : current));
  }, [epicycles, focusIndex, terms.length]);

  useEffect(() => {
    if (typeof focusIndex === 'number' && terms.length > 0) {
      const clamped = Math.min(Math.max(focusIndex, 0), terms.length - 1);
      setInspectIndex(clamped);
    }
  }, [focusIndex, terms.length]);

  return (
    <div className="fourier-math-panel custom-scrollbar">
      <h3 className="text-xl font-bold mb-4 text-cyan-400">Fourier Engine</h3>

      <div className="fourier-math-toggle" role="group" aria-label="Toggle formulas">
        <button
          type="button"
          className={activeView === 'dft' ? 'is-active' : ''}
          onClick={() => setActiveView('dft')}
        >
          DFT basis
        </button>
        <button
          type="button"
          className={activeView === 'reconstruction' ? 'is-active' : ''}
          onClick={() => setActiveView('reconstruction')}
        >
          Reconstruction
        </button>
        <button
          type="button"
          className={activeView === 'phasor' ? 'is-active' : ''}
          onClick={() => setActiveView('phasor')}
        >
          Phasor anatomy
        </button>
      </div>

      <div className="mb-4" ref={latexContainerRef} aria-live="polite"></div>

      <div className="space-y-4 text-sm font-mono">
        <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Total Vectors (N)</span>
            <span className="text-cyan-300">{terms.length}</span>
        </div>
        <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Active Epicycles</span>
            <span className="text-fuchsia-400">{epicycles}</span>
        </div>
        <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Current Phase (t)</span>
            <span className="text-amber-400">{(time / (2 * Math.PI)).toFixed(2)}τ</span>
        </div>
         <div className="flex justify-between">
            <span className="text-slate-400">Largest Radius</span>
            <span className="text-emerald-400">
                {terms.length > 0 ? terms[0].amp.toFixed(1) : '0.0'} px
            </span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Amplitude color map</p>
        <div
          className="fourier-legend"
          style={{ backgroundImage: legendGradient(terms[0]?.amp || 1) }}
          aria-label="Amplitude legend from low to high magnitude"
        ></div>
        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
          <span>low |X_k|</span>
          <span>high |X_k|</span>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm font-mono">
        <div className="flex justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-400">Energy captured (M terms)</span>
          <span className="text-cyan-300">{metrics.energyPct.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">RMS error vs. original path</span>
          <span className="text-amber-300">{metrics.rmsError.toFixed(2)} px</span>
        </div>
      </div>

      {metrics.topTerms.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Top terms (by amplitude)</p>
          <div className="grid grid-cols-5 text-[11px] text-slate-300 gap-2 border border-slate-800 rounded-lg p-2">
            <span className="font-semibold text-slate-200">k</span>
            <span className="font-semibold text-slate-200">|X_k|</span>
            <span className="font-semibold text-slate-200">phase</span>
            <span className="font-semibold text-slate-200">energy</span>
            <span className="font-semibold text-slate-200">cum.</span>
            {metrics.topTerms.map((t, idx) => (
              <React.Fragment key={idx}>
                <span>{t.freq}</span>
                <span>{t.amp.toFixed(2)}</span>
                <span>{t.phase.toFixed(2)} rad</span>
                <span>{t.energyPct.toFixed(1)}%</span>
                <span>{t.cumulativePct.toFixed(1)}%</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border border-slate-800 rounded-lg p-3 space-y-2 bg-slate-900/40">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
          <span>Term inspector</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-cyan-300 hover:text-cyan-100"
              onClick={() => setInspectIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous term"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="text-slate-200">{inspectIndex + 1} / {terms.length || 1}</span>
            <button
              type="button"
              className="text-cyan-300 hover:text-cyan-100"
              onClick={() => setInspectIndex((i) => Math.min(terms.length - 1, i + 1))}
              aria-label="Next term"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-200 leading-relaxed space-y-2">
          <div className="fourier-katex-inline" dangerouslySetInnerHTML={{ __html: inspectorKatex.paramsHtml }} />
          <div className="fourier-katex-inline" dangerouslySetInnerHTML={{ __html: inspectorKatex.vectorHtml }} />
          <div className="fourier-katex-inline" dangerouslySetInnerHTML={{ __html: inspectorKatex.energyHtml }} />
          <p>
            {stepMode
              ? 'Step mode: play once to view this term, then advance.'
              : 'Track this circle while playing to see how its phase and magnitude shape the trace.'}
          </p>
        </div>
      </div>

      <div className="mt-5 text-xs text-slate-500 italic space-y-2">
        <p>* Sorted by amplitude so the largest circles draw first.</p>
        <p>Tip: switch formulas to see how truncating to M epicycles shapes the path.</p>
      </div>
    </div>
  );
};

export default MathPanel;
