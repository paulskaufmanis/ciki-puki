// McLeod-style normalised square difference pitch detector.
// Returns { freq, clarity, rms } for one buffer of time-domain samples.
export function detectPitch(buf, sampleRate, minHz = 80, maxHz = 1000) {
  const N = Math.min(buf.length, 2048);
  let e = 0;
  for (let i = 0; i < N; i++) e += buf[i] * buf[i];
  const rms = Math.sqrt(e / N);

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.ceil(sampleRate / minHz), buf.length - N);
  if (maxLag <= minLag) return { freq: 0, clarity: 0, rms };

  const nsdf = new Float32Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0, m = 0;
    for (let i = 0; i < N; i++) {
      const a = buf[i], b = buf[i + lag];
      r += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m ? (2 * r) / m : 0;
    if (nsdf[lag] > best) best = nsdf[lag];
  }
  // Take the first strong local peak (avoids octave-down errors)
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] >= 0.9 * best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // parabolic interpolation for sub-sample accuracy
      const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return { freq: sampleRate / (lag + shift), clarity: b, rms };
    }
  }
  return { freq: 0, clarity: best, rms };
}
