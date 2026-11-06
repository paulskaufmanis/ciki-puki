// Tiny synthesized sound effects (no audio files). Must be first triggered from a user gesture.
let ctx = null;

function audio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c, freq, at, dur, { type = "sine", gain = 0.2, to } = {}) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(c, at, dur, { freq = 1800, gain = 0.3 } = {}) {
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t);
}

export function playHighFive() {
  const c = audio();
  if (!c) return;
  noise(c, 0, 0.12, { freq: 2200, gain: 0.5 });
  tone(c, 180, 0, 0.15, { type: "triangle", gain: 0.35, to: 90 });
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, 0.1 + i * 0.07, 0.35, { gain: 0.15 }));
}

export function playCrunch() {
  const c = audio();
  if (!c) return;
  for (let i = 0; i < 3; i++) noise(c, i * 0.09, 0.07, { freq: 900 + i * 300, gain: 0.35 });
  tone(c, 320, 0.28, 0.18, { type: "triangle", gain: 0.2, to: 640 });
}

export function playCoin() {
  const c = audio();
  if (!c) return;
  tone(c, 988, 0, 0.08, { type: "square", gain: 0.07 });
  tone(c, 1319, 0.07, 0.25, { type: "square", gain: 0.07 });
}

export function playFanfare() {
  const c = audio();
  if (!c) return;
  [523.25, 659.25, 783.99, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, i * 0.12, 0.3, { type: "triangle", gain: 0.2 }));
}

// A puppy "vau vau": two short barks, a rough falling tone with a breathy burst
export function playBark() {
  const c = audio();
  if (!c) return;
  [0, 0.24].forEach((at) => {
    tone(c, 520, at, 0.16, { type: "sawtooth", gain: 0.22, to: 260 });
    tone(c, 780, at, 0.1, { type: "square", gain: 0.06, to: 400 });
    noise(c, at, 0.1, { freq: 1100, gain: 0.25 });
  });
}

// A springy "boing" for the somersault
export function playBoing() {
  const c = audio();
  if (!c) return;
  tone(c, 260, 0, 0.35, { type: "sine", gain: 0.25, to: 720 });
}

// Quick scratchy rustle while the puppy scratches behind its ear
export function playScratch() {
  const c = audio();
  if (!c) return;
  for (let i = 0; i < 5; i++) noise(c, i * 0.1, 0.06, { freq: 2600, gain: 0.18 });
}

// Soft slurp while licking a paw
export function playLick() {
  const c = audio();
  if (!c) return;
  [0, 0.3, 0.6].forEach((at) => tone(c, 420, at, 0.12, { type: "sine", gain: 0.12, to: 640 }));
}
