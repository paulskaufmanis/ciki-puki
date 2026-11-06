import React, { useEffect, useRef, useState } from "react";

const BPM_MIN = 40, BPM_MAX = 160;
const TRAVEL = 270; // degrees the knob sweeps
const START_ANGLE = -135;

const SIGS = [1, 2, 3, 4]; // 1/4, 2/4, 3/4, 4/4

const clampBpm = (n) => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)));

function bpmToAngle(bpm) {
  return START_ANGLE + ((clampBpm(bpm) - BPM_MIN) / (BPM_MAX - BPM_MIN)) * TRAVEL;
}

// Shared white-noise buffer per AudioContext, for the drum hits
function getNoise(ctx) {
  if (ctx._noiseBuf) return ctx._noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.15);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  ctx._noiseBuf = buf;
  return buf;
}

// Accent (downbeat): a punchy kick drum with a short click transient for precision
function playAccent(ctx) {
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.14);

  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 3000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  n.connect(hp).connect(ng).connect(ctx.destination);
  n.start(t); n.stop(t + 0.03);
}

// Other beats: a closed hi-hat
function playBeat(ctx) {
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(hp).connect(g).connect(ctx.destination);
  n.start(t); n.stop(t + 0.06);
}

// Classic metronome with a rotatable BPM knob, selectable time signature and drum sounds
export default function Metronome() {
  const [bpm, setBpm] = useState(120);
  const [sig, setSig] = useState(4);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);

  const knobRef = useRef(null);
  const ctxRef = useRef(null);
  const timerRef = useRef(null);
  const nextTRef = useRef(0);
  const beatRef = useRef(0);
  const bpmRef = useRef(120);
  const sigRef = useRef(4);
  const runningRef = useRef(false);
  bpmRef.current = bpm;
  sigRef.current = sig;
  runningRef.current = running;

  // Map a pointer position over the knob to an angle, then to BPM
  const onPointer = (e) => {
    const rect = knobRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const deg = (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI;
    const clamped = Math.min(START_ANGLE + TRAVEL, Math.max(START_ANGLE, deg));
    setBpm(Math.round(BPM_MIN + ((clamped - START_ANGLE) / TRAVEL) * (BPM_MAX - BPM_MIN)));
  };

  const startDrag = (e) => {
    e.preventDefault();
    onPointer(e);
    const move = (ev) => onPointer(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Lookahead scheduler: wakes up every 25 ms and places clicks slightly ahead of time
  useEffect(() => {
    if (!running) return;
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    nextTRef.current = ctx.currentTime + 0.05;
    beatRef.current = 0;
    setBeat(0);

    const tick = () => {
      if (!runningRef.current) return;
      const beats = sigRef.current;
      const period = 60 / bpmRef.current;
      while (nextTRef.current < ctx.currentTime + 0.12) {
        if (beatRef.current === 0) playAccent(ctx);
        else playBeat(ctx);
        setBeat(beatRef.current);
        beatRef.current = (beatRef.current + 1) % beats;
        nextTRef.current += period;
      }
      timerRef.current = setTimeout(tick, 25);
    };
    timerRef.current = setTimeout(tick, 25);
    return () => clearTimeout(timerRef.current);
  }, [running]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    ctxRef.current?.close().catch(() => { });
  }, []);

  const deg = bpmToAngle(bpm);
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    ticks.push(<i key={i} className="metro-tick" style={{ transform: `rotate(${START_ANGLE + (TRAVEL / 10) * i}deg) translateY(-56px)` }} />);
  }

  return (
    <div className="metro-card">
      <span className="metro-title">Metronoms</span>
      <div
        ref={knobRef}
        className={`metro-knob ${running ? "on" : ""}`}
        onPointerDown={startDrag}
        role="slider"
        aria-valuemin={BPM_MIN}
        aria-valuemax={BPM_MAX}
        aria-valuenow={bpm}
        aria-label="Metronoma ātrums"
        tabIndex="0"
      >
        {ticks}
        <div className="metro-needle" style={{ transform: `rotate(${deg}deg)` }} />
        <div className="metro-bpm">{bpm}</div>
        <div className="metro-unit">BPM</div>
      </div>
      <div className="metro-signatures" role="group" aria-label="Taktmērs">
        {SIGS.map((s) => (
          <button key={s} className={`chip ${sig === s ? "on" : ""}`} onClick={() => setSig(s)}>
            {s}/4
          </button>
        ))}
      </div>
      <div className="metro-beat" aria-hidden="true">
        {Array.from({ length: sig }, (_, i) => (
          <span key={i} className={`metro-dot ${i === 0 ? "acc" : ""} ${beat === i ? "hit" : ""}`} />
        ))}
      </div>
      <button className="btn" onClick={() => setRunning((r) => !r)}>
        {running ? "Apturēt" : "Sākt"}
      </button>
    </div>
  );
}
