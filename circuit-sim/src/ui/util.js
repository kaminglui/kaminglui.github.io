/** Utility helpers for UI. */
export function parseValue(str) {
  const s = String(str).trim();
  const match = s.match(/([0-9.eE+-]+)\s*([kKmMuUnNpP]?)/);
  if (!match) return parseFloat(s) || 0;
  const value = parseFloat(match[1]);
  const suffix = match[2].toLowerCase();
  const map = {
    k: 1e3,
    m: 1e-3,
    u: 1e-6,
    n: 1e-9,
    p: 1e-12
  };
  return value * (map[suffix] || 1);
}

export function formatEngineering(v) {
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
  if (Math.abs(v) >= 1) return v.toFixed(2);
  if (Math.abs(v) >= 1e-3) return `${(v * 1e3).toFixed(2)}m`;
  if (Math.abs(v) >= 1e-6) return `${(v * 1e6).toFixed(2)}u`;
  if (Math.abs(v) >= 1e-9) return `${(v * 1e9).toFixed(2)}n`;
  return v.toExponential(2);
}
