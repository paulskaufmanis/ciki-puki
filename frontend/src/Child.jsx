import React, { useEffect, useRef, useState } from "react";
import { getConfig, completeTask, uploadRecording } from "./api.js";
import { detectPitch } from "./pitch.js";

// For test: allow all frequencies
const MIN_HZ = 100, MAX_HZ = 20000; // guitar fundamentals live well below 1.2 kHz
// const MIN_HZ = 80, MAX_HZ = 1200; // guitar fundamentals live well below 1.2 kHz
const MIN_RMS = 0.002; //for test - allow more background noise

const MIN_CLARITY = 0.9;    // 0-1; only clean, periodic (musical) tones pass
const HOLD_MS = 1000;        // keep counting through short gaps between notes

const fmt = (s) => { const t = Math.ceil(s); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export default function Child() {
  const [cfg, setCfg] = useState(null);
  const [phase, setPhase] = useState("idle");   // idle | running | done | error
  const [remaining, setRemaining] = useState(0);
  const [hz, setHz] = useState(0);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const ctxRef = useRef(null), streamRef = useRef(null), wakeRef = useRef(null);
  const recorderRef = useRef(null);
  const state = useRef({ remaining: 0, total: 0, lastActive: 0, streak: 0 });

  useEffect(() => { getConfig().then(setCfg).catch((e) => setError(e.message)); }, []);
  useEffect(() => () => stop(), []);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => { });
    wakeRef.current?.release?.().catch(() => { });
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  };

  // Stops the recorder (if any) and resolves with the full session audio
  const stopRecording = () => new Promise((resolve) => {
    const r = recorderRef.current;
    if (!r || r.state === "inactive") return resolve(null);
    r.onstop = () => resolve(new Blob(r.chunks, { type: r.mimeType }));
    r.stop();
  });

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Raw signal: browser noise-suppression would strip guitar tones
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      document.documentElement.requestFullscreen?.().catch(() => { });
      navigator.wakeLock?.request("screen").then((l) => (wakeRef.current = l)).catch(() => { });

      if (typeof MediaRecorder !== "undefined") {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size) recorder.chunks.push(e.data); };
        recorder.start();
        recorderRef.current = recorder;
      }

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      const total = cfg.durationMinutes * 60;
      Object.assign(state.current, { remaining: total, total, lastActive: 0, streak: 0 });
      setRemaining(total);
      setPhase("running");

      let last = performance.now();
      const tick = async () => {
        if (!ctxRef.current) return;
        const now = performance.now(), dt = (now - last) / 1000;
        last = now;
        analyser.getFloatTimeDomainData(buf);
        const { freq, clarity, rms } = detectPitch(buf, ctx.sampleRate, MIN_HZ, MAX_HZ);
        const s = state.current;


        // TEST MODE: count any sound, ignore pitch/clarity filtering
        // const tonal = rms > MIN_RMS && clarity >= MIN_CLARITY && freq >= MIN_HZ && freq <= MAX_HZ;
        const tonal = rms > MIN_RMS;


        s.streak = tonal ? s.streak + 1 : 0;
        if (s.streak >= 3) s.lastActive = now;   // 3 consecutive frames = a real note

        const active = now - s.lastActive < HOLD_MS;
        setListening(active);
        setHz(active ? Math.round(freq) : 0);

        if (active) {
          s.remaining = Math.max(0, s.remaining - dt);
          setRemaining(s.remaining);
          if (s.remaining === 0) {
            const recording = await stopRecording();
            stop(); ctxRef.current = null;
            try {
              await completeTask(s.total);
              if (recording) await uploadRecording(recording).catch(() => {});
              setPhase("done");
            }
            catch (e) { setError(e.message); setPhase("error"); }
            return;
          }
        }
        setTimeout(tick, 60);
      };
      tick();
    } catch (e) {
      setError(e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's site settings." : e.message);
      setPhase("error");
    }
  };

  if (!cfg && !error) return <main className="page center"><p className="muted">Loading…</p></main>;

  if (phase === "done" || cfg?.completedToday)
    return <main className="page center full done"><h1>Done for today</h1><p>Nice playing. Your can have some other fun!</p></main>;

  if (phase === "error")
    return <main className="page center full"><h1>Something went wrong</h1><p className="muted">{error}</p><button className="btn primary" onClick={() => { setError(""); setPhase("idle"); }}>Try again</button></main>;

  if (cfg && !cfg.requiredToday)
    return <main className="page center full"><h1>No practice today</h1><p className="muted">Enjoy your day.</p></main>;

  if (phase === "idle")
    return (
      <main className="page center full">
        <h1>{cfg.durationMinutes} minutes of guitar</h1>
        <p className="muted">The timer only runs while you play. Allow the microphone when asked.</p>
        <button className="btn primary big" onClick={start}>Start practice</button>
      </main>
    );

  return (
    <main className={`page center full ${listening ? "live" : ""}`}>
      <div className="timer" aria-live="off">{fmt(remaining)}</div>
      <p className="muted">{listening ? `Hearing ${hz} Hz` : "Play your guitar to keep the timer going"}</p>
      <div className="bar"><i style={{ width: `${100 * (1 - remaining / state.current.total)}%` }} /></div>
    </main>
  );
}
