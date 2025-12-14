import { FourierTerm } from '../types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const normalizeAmplitude = (amp: number, maxAmp: number) => {
  if (!isFinite(amp) || maxAmp <= 0) return 0;
  return clamp01(amp / maxAmp);
};

export const amplitudeToColor = (amp: number, maxAmp: number, highlight = false) => {
  const ratio = normalizeAmplitude(amp, maxAmp);
  const hue = 210 + (320 - 210) * ratio; // teal -> magenta
  const lightness = highlight ? 62 : 48 + 6 * ratio;
  const alpha = highlight ? 0.95 : 0.6;
  return `hsla(${hue.toFixed(1)}, 82%, ${lightness.toFixed(1)}%, ${alpha})`;
};

export const legendGradient = (maxAmp: number) =>
  `linear-gradient(90deg, ${amplitudeToColor(0, maxAmp)} 0%, ${amplitudeToColor(maxAmp * 0.5, maxAmp)} 50%, ${amplitudeToColor(maxAmp, maxAmp, true)} 100%)`;

export const termColor = (term: FourierTerm, maxAmp: number, isHighlight: boolean) =>
  amplitudeToColor(term.amp, maxAmp, isHighlight);
