import React, { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { FourierTerm } from '../types';

interface MathPanelProps {
  terms: FourierTerm[];
  time: number;
  epicycles: number;
}

const MathPanel: React.FC<MathPanelProps> = ({ terms, time, epicycles }) => {
  const latexContainerRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'dft' | 'reconstruction' | 'phasor'>('dft');

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
        x(t) &\\approx \\sum_{k=0}^{${m - 1}} \\left|X_k\\right| e^{i\\left(2\\pi kt/${n} + \\phi_k\\right)} \\\\
        &\\textcolor{#22c55e}{\\left|X_{${dominantFreq}}\\right| = ${domRadius.toFixed(2)}},\\;
          \\textcolor{#f472b6}{\\phi_{${dominantFreq}} = ${dominantPhase}}\\;\\text{rad}
      \\end{aligned}
      `,
      phasor: `
      \\begin{aligned}
        \\text{Epicycle}_k(t) &= r_k e^{i(\\omega_k t + \\phi_k)} \\\\
        r_k &= \\left|X_k\\right|,\\;
        \\omega_k = 2\\pi k / N,\\;
        t = ${phaseTurns}\\,\\tau
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
  }, [terms.length]);

  return (
    <div className="fourier-math-panel">
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

      <div className="mt-5 text-xs text-slate-500 italic space-y-2">
        <p>* Sorted by amplitude so the largest circles draw first.</p>
        <p>Tip: switch formulas to see how truncating to M epicycles shapes the path.</p>
      </div>
    </div>
  );
};

export default MathPanel;
