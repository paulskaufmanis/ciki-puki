import React, { useEffect, useRef, useState } from "react";
import { completeTask, uploadRecording, saveProgress } from "../../api.js";
import { detectPitch } from "../../pitch.js";
import Metronome from "./Metronome.jsx";

const MIN_HZ = 80, MAX_HZ = 1200; // guitar fundamentals live well below 1.2 kHz
const ANY_SOUND_RMS = 0.002;      // level 1 threshold: almost any sound
const MIN_RMS = 0.01;             // level 10 threshold: above typical quiet-room noise

const MIN_CLARITY = 0.9;    // 0-1; only clean, periodic (musical) tones pass
const HOLD_MS = 1000;        // keep counting through short gaps between notes

// level 1 = any sound counts, level 10 = only loud, clean notes in guitar range
function isTonal(level, { freq, clarity, rms }) {
    const t = (Math.min(10, Math.max(1, level || 1)) - 1) / 9;
    if (rms <= ANY_SOUND_RMS + t * (MIN_RMS - ANY_SOUND_RMS)) return false;
    if (t === 0) return true;
    return clarity >= t * MIN_CLARITY && freq >= MIN_HZ && freq <= MAX_HZ;
}

export const fmt = (s) => { const t = Math.ceil(s); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export const durationLabel = (secs) => {
    const mins = Math.floor(secs / 60), rem = secs % 60;
    if (secs % 60) {
        if (rem === 1) return "1 sekunde";
        return `${rem} sekundes`;
    }
    if (mins === 1) return "1 minūte";
    return `${mins} minūtes`;
};

const SAVE_EVERY_MS = 5000;
const RECORDING_BITRATE = 12000; // mono Opus at 12 kbps ≈ 1.8 MB per 20 minutes (fits a D1 row without R2)

export default function InstrumentPractice({ task, onDone, onBack }) {
    const [phase, setPhase] = useState("idle");   // idle | running | done | error
    const [remaining, setRemaining] = useState(0);
    const [hz, setHz] = useState(0);
    const [listening, setListening] = useState(false);
    const [error, setError] = useState("");
    const [uploadError, setUploadError] = useState("");

    const ctxRef = useRef(null), streamRef = useRef(null), wakeRef = useRef(null);
    const recorderRef = useRef(null);
    const state = useRef({ remaining: 0, total: 0, lastActive: 0, streak: 0, lastSave: 0, running: false, played: 0 });

    const loadPlayed = () => Math.max(task.progressSeconds || 0, state.current.played);

    const persist = () => {
        const s = state.current;
        if (!s.running) return;
        s.played = s.total - s.remaining;
        saveProgress(task.id, s.played);
    };

    useEffect(() => () => { persist(); stop(); }, []);
    useEffect(() => {
        const onHide = () => { if (document.visibilityState === "hidden") persist(); };
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", persist);
        return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", persist); };
    }, []);

    const stop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        ctxRef.current?.close().catch(() => { });
        wakeRef.current?.release?.().catch(() => { });
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
                // Raw signal: browser noise-suppression would strip instrument tones
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
            });
            streamRef.current = stream;
            navigator.wakeLock?.request("screen").then((l) => (wakeRef.current = l)).catch(() => { });

            if (typeof MediaRecorder !== "undefined") {
                const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
                const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: RECORDING_BITRATE });
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

            const total = task.targetSeconds;
            const remainingStart = Math.max(0, total - loadPlayed());
            Object.assign(state.current, { remaining: remainingStart, total, lastActive: 0, streak: 0, lastSave: 0, running: true });
            setRemaining(remainingStart);
            setPhase("running");

            let last = performance.now();
            const tick = async () => {
                if (!ctxRef.current) return;
                const now = performance.now(), dt = (now - last) / 1000;
                last = now;
                analyser.getFloatTimeDomainData(buf);
                const pitch = detectPitch(buf, ctx.sampleRate, MIN_HZ, MAX_HZ);
                const s = state.current;
                const tonal = isTonal(task.params.micLevel, pitch);

                s.streak = tonal ? s.streak + 1 : 0;
                if (s.streak >= 3) s.lastActive = now;   // 3 consecutive frames = a real note

                const active = now - s.lastActive < HOLD_MS;
                setListening(active);
                setHz(active ? Math.round(pitch.freq) : 0);

                if (active) {
                    s.remaining = Math.max(0, s.remaining - dt);
                    setRemaining(s.remaining);
                    if (now - s.lastSave > SAVE_EVERY_MS) { s.lastSave = now; persist(); }
                }
                if (s.remaining === 0) {
                    persist();
                    s.running = false;
                    const recording = await stopRecording();
                    stop(); ctxRef.current = null;
                    try {
                        await completeTask(task.id, s.total);
                        if (recording) await uploadRecording(task.id, recording).catch((e) => setUploadError(e.message));
                        setPhase("done");
                        onDone?.();
                    }
                    catch (e) { setError(e.message); setPhase("error"); }
                    return;
                }
                setTimeout(tick, 60);
            };
            tick();
        } catch (e) {
            setError(e.name === "NotAllowedError" ? "Mikrofona piekļuve tika bloķēta. Atļauj to pārlūka vietnes iestatījumos." : e.message);
            setPhase("error");
        }
    };

    const back = <button className="btn" onClick={onBack}>Atpakaļ uz sarakstu</button>;

    if (phase === "done" || task.completedToday)
        return <main className="page center full done"><h1>{task.name} – gatavs!</h1><p>Lieliski nospēlēts.</p>{uploadError && <p className="muted" role="alert">Ierakstu neizdevās saglabāt: {uploadError}</p>}<button className="btn primary big" onClick={onBack}>Atpakaļ uz sarakstu</button></main>;

    if (phase === "error")
        return <main className="page center full"><h1>Kaut kas nogāja greizi</h1><p className="muted">{error}</p><div className="row"><button className="btn primary" onClick={() => { setError(""); setPhase("idle"); }}>Mēģināt vēlreiz</button>{back}</div></main>;

    if (!task.requiredToday)
        return <main className="page center full"><h1>Nav šodienas sarakstā</h1><p className="muted">Izbaudi savu dienu.</p>{back}</main>;

    if (phase === "idle") {
        const left = Math.max(0, task.targetSeconds - loadPlayed());
        const resuming = left < task.targetSeconds;
        return (
            <main className="page center full">
                <h1>{task.name}</h1>
                <p>{durationLabel(task.targetSeconds)} spēlēšanas</p>
                {resuming
                    ? <p className="muted">Laipni lūdzam atpakaļ! Atlikušas {fmt(left)} no vietas, kur pārtrauci.</p>
                    : <p className="muted">Taimeris darbojas tikai, kamēr tu spēlē.</p>}
                <button className="btn primary big" onClick={start}>{resuming ? "Turpināt" : "Sākt"}</button>
                <p>{back}</p>
            </main>
        );
    }

    return (
        <main className={`page center full ${listening ? "live" : ""}`}>
            <div className="timer" aria-live="off">{fmt(remaining)}</div>
            <p className="muted">{listening ? `Dzirdu ${hz} Hz` : "Spēlē uz sava instrumenta, lai taimeris turpinātu darboties"}</p>
            <div className="bar"><i style={{ width: `${100 * (1 - remaining / state.current.total)}%` }} /></div>
            <Metronome />
        </main>
    );
}
