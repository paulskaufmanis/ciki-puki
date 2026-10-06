import React, { useEffect, useState } from "react";
import { getConfig, saveConfig, listRecordings, fetchRecordingUrl, resetToday } from "./api.js";

// Mon-Sun display order; values are JS weekday numbers (0 = Sun)
const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];

export default function Parent() {
  const [cfg, setCfg] = useState(null);       // last state from server
  const [form, setForm] = useState(null);     // editable copy
  const [pin, setPin] = useState(() => localStorage.getItem("pin") || "");
  const [msg, setMsg] = useState("");
  const [recordings, setRecordings] = useState([]);
  const [recErr, setRecErr] = useState("");
  const [playingUrls, setPlayingUrls] = useState({}); // date -> object URL

  const load = async () => {
    try {
      const c = await getConfig();
      setCfg(c);
      setForm((f) => f || { taskEnabled: c.taskEnabled, durationMinutes: c.durationMinutes, scheduledDays: c.scheduledDays, override: c.override });
    } catch (e) { setMsg(e.message); }
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  useEffect(() => () => Object.values(playingUrls).forEach((u) => URL.revokeObjectURL(u)), [playingUrls]);

  const loadRecordings = async () => {
    try { setRecordings(await listRecordings(pin)); setRecErr(""); }
    catch (e) { setRecErr(e.message); }
  };

  const playRecording = async (date) => {
    try {
      const url = await fetchRecordingUrl(date, pin);
      setPlayingUrls((p) => ({ ...p, [date]: url }));
    } catch (e) { setRecErr(e.message); }
  };

  const save = async (patch = form) => {
    try {
      localStorage.setItem("pin", pin);
      const c = await saveConfig(patch, pin);
      setCfg(c);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) { setMsg(e.message); }
  };

  const toggleDay = (d) =>
    setForm((f) => ({ ...f, scheduledDays: f.scheduledDays.includes(d) ? f.scheduledDays.filter((x) => x !== d) : [...f.scheduledDays, d] }));

  const reset = async () => {
    if (!confirm("Reset today's progress? The child will need to practice again.")) return;
    try {
      localStorage.setItem("pin", pin);
      setCfg(await resetToday(pin));
      setMsg("Today's progress was reset");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) { setMsg(e.message); }
  };

  if (!form || !cfg) return <main className="page center"><p className="muted">{msg || "Loading…"}</p></main>;

  const status = !cfg.requiredToday ? ["off", "No practice required today"]
    : cfg.completedToday ? ["done", "Today's practice is complete"]
      : ["wait", "Waiting for today's practice"];

  return (
    <main className="page">
      <h1>Parent dashboard</h1>

      <section className={`status ${status[0]}`} aria-live="polite">
        <span className="dot" /> {status[1]}
        <small>Device is {cfg.locked ? "locked" : "unlocked"}{cfg.override !== "none" ? " (manual override)" : ""}</small>
      </section>

      <section className="card">
        <label className="switch">
          <input type="checkbox" checked={form.taskEnabled} onChange={(e) => setForm({ ...form, taskEnabled: e.target.checked })} />
          <span>Guitar task is {form.taskEnabled ? "on" : "off"}</span>
        </label>

        <label className="field">
          Practice time (minutes)
          <input type="number" min="1" max="240" value={form.durationMinutes}
            onChange={(e) => setForm({ ...form, durationMinutes: e.target.value === "" ? "" : Number(e.target.value) })} />
        </label>

        <fieldset className="days">
          <legend>Practice days</legend>
          {DAYS.map(([label, n]) => (
            <label key={n} className={form.scheduledDays.includes(n) ? "chip on" : "chip"}>
              <input type="checkbox" checked={form.scheduledDays.includes(n)} onChange={() => toggleDay(n)} />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="field">
          Parent PIN
          <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Required to save changes" />
        </label>

        <button className="btn primary" onClick={() => save()}>Save changes</button>
        <span className="muted"> {msg}</span>
      </section>

      <section className="card">
        <h2>Manual override</h2>
        <div className="row">
          {[["none", "Follow schedule"], ["lock", "Lock now"], ["unlock", "Unlock now"]].map(([v, l]) => (
            <button key={v} className={`btn ${cfg.override === v ? "primary" : ""}`}
              onClick={() => { setForm({ ...form, override: v }); save({ override: v }); }}>{l}</button>
          ))}
        </div>
        {cfg.completedToday && (
          <button className="btn" onClick={reset}>Reset today's progress</button>
        )}
      </section>

      <section className="card">
        <h2>Practice recordings</h2>
        <button className="btn" onClick={loadRecordings}>Refresh recordings</button>
        {recErr && <p className="muted">{recErr}</p>}
        <ul className="recordings">
          {recordings.map((r) => (
            <li key={r.date}>
              <span>{r.date}</span>
              {playingUrls[r.date]
                ? <audio controls autoPlay src={playingUrls[r.date]} />
                : <button className="btn" onClick={() => playRecording(r.date)}>Play</button>}
            </li>
          ))}
          {!recordings.length && <p className="muted">No recordings yet</p>}
        </ul>
      </section>
    </main>
  );
}
