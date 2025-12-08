function peakToPeak(values = []) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function rms(values = []) {
  if (!values.length) return 0;
  const meanSq = values.reduce((acc, v) => acc + v * v, 0) / values.length;
  return Math.sqrt(meanSq);
}

function singleToneAmplitude(samples = [], freq) {
  if (!samples.length) return 0;
  const dt = samples[1] ? (samples[1].t - samples[0].t) : 0;
  if (dt <= 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  samples.forEach(({ t, v }) => {
    const ph = 2 * Math.PI * freq * t;
    sumCos += v * Math.cos(ph);
    sumSin += v * Math.sin(ph);
  });
  const n = samples.length;
  const aCos = (2 / n) * sumCos;
  const aSin = (2 / n) * sumSin;
  return Math.sqrt(aCos * aCos + aSin * aSin);
}

function toneProjection(samples = [], freq) {
  if (!samples.length) return { amplitude: 0, sin: 0, cos: 0, phase: 0 };
  const dt = samples[1] ? (samples[1].t - samples[0].t) : 0;
  if (dt <= 0) return { amplitude: 0, sin: 0, cos: 0, phase: 0 };
  let sumSin = 0;
  let sumCos = 0;
  samples.forEach(({ t, v }) => {
    const ph = 2 * Math.PI * freq * t;
    sumCos += v * Math.cos(ph);
    sumSin += v * Math.sin(ph);
  });
  const n = samples.length;
  const sin = (2 / n) * sumSin;
  const cos = (2 / n) * sumCos;
  const amplitude = Math.sqrt(cos * cos + sin * sin);
  const phase = Math.atan2(sin, cos);
  return { amplitude, sin, cos, phase };
}

export { peakToPeak, rms, singleToneAmplitude, toneProjection };
