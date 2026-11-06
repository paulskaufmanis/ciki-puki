import React, { useEffect, useRef, useState } from "react";
import { getTasks, createTask, updateTask, deleteTask, checkTaskAsParent, listRecordings, listPhotos, fetchRecordingUrl, fetchPhotoUrl, setPin } from "./api.js";
import { TEMPLATES, templateOf } from "./templates/index.js";

// Mon-Sun display order; values are JS weekday numbers (0 = Sun)
const DAYS = [["Pr", 1], ["Ot", 2], ["Tr", 3], ["Ce", 4], ["Pk", 5], ["Se", 6], ["Sv", 0]];

const statusOf = (t) =>
  !t.requiredToday ? ["off", "Šodien nav ieplānots"]
    : t.completedToday ? ["done", t.completedManually ? "Šodien atzīmēts ar roku" : "Šodien paveikts"]
      : ["wait", t.progressSeconds > 0 ? "Notiek" : "Gaida"];

function TaskEditor({ task, pin, onData, onFail }) {
  const [form, setForm] = useState(() => ({
    name: task.name, enabled: task.enabled, allowManual: task.allowManual, scheduledDays: task.scheduledDays, params: task.params,
  }));
  const [msg, setMsg] = useState("");
  const tpl = templateOf(task);
  const Settings = tpl?.Settings;
  const status = statusOf(task);

  const run = async (request, okMsg) => {
    try {
      onData(await request());
      if (okMsg) { setMsg(okMsg); setTimeout(() => setMsg(""), 2000); }
    } catch (e) { onFail(e, setMsg); }
  };

  const toggleDay = (d) =>
    setForm((f) => ({ ...f, scheduledDays: f.scheduledDays.includes(d) ? f.scheduledDays.filter((x) => x !== d) : [...f.scheduledDays, d] }));

  const remove = () => {
    if (confirm(`Dzēst "${task.name}"? Tiks izdzēsta arī tā vēsture un ieraksti.`))
      run(() => deleteTask(task.id, pin));
  };

  return (
    <details className="card task-card">
      <summary>
        <span className={`status-dot ${status[0]}`} aria-hidden="true" />
        <span className="task-card-name">{task.name}</span>
        <span className="muted">{tpl?.label || task.template}{task.enabled ? "" : " · izslēgts"}</span>
      </summary>

      <div className="task-card-body">
        <div className={`status ${status[0]}`} aria-live="polite"><span className="dot" /> {status[1]}</div>

        <label className="field">
          Nosaukums
          <input value={form.name} maxLength={60} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>

        <label className="switch">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <span>Uzdevums ir {form.enabled ? "ieslēgts" : "izslēgts"}</span>
        </label>

        {!tpl?.checkOnly && (
          <label className="switch">
            <input type="checkbox" checked={form.allowManual} onChange={(e) => setForm({ ...form, allowManual: e.target.checked })} />
            <span>Bērns to var atzīmēt pats ar roku</span>
          </label>
        )}

        {Settings && <Settings params={form.params} onChange={(params) => setForm({ ...form, params })} />}

        <fieldset className="days">
          <legend>Dienas</legend>
          {DAYS.map(([label, n]) => (
            <label key={n} className={form.scheduledDays.includes(n) ? "chip on" : "chip"}>
              <input type="checkbox" checked={form.scheduledDays.includes(n)} onChange={() => toggleDay(n)} />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="row">
          <button className="btn primary" onClick={() => run(() => updateTask(task.id, form, pin), "Saglabāts")}>Saglabāt izmaiņas</button>
          <button className="btn danger" onClick={remove}>Dzēst</button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
    </details>
  );
}

function PhotoModal({ photo, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="photo-modal" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <h2>{photo.name}</h2>
      <img src={photo.url} alt={`Fotoattēls iesniegts uzdevumam ${photo.name}`} />
      <form method="dialog"><button className="btn primary">Aizvērt</button></form>
    </dialog>
  );
}

export default function Parent({ pin, onPinChanged, onAuthFailed, onExit }) {
  const [data, setData] = useState(null);     // { today, tasks } from server
  const [msg, setMsg] = useState("");
  const [newTask, setNewTask] = useState({ template: Object.keys(TEMPLATES)[0], name: "", params: {} });
  const [addMsg, setAddMsg] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [recordings, setRecordings] = useState([]);
  const [recErr, setRecErr] = useState("");
  const [player, setPlayer] = useState(null); // { place, key, url } – only one audio player at a time
  const urlsRef = useRef({});                 // "taskId/date" -> object URL, reused across players
  const [photo, setPhoto] = useState(null);   // { name, url } shown in the photo modal
  const [busy, setBusy] = useState(null);     // id of the task whose checkbox is being toggled

  const load = async () => {
    try { setData(await getTasks()); setMsg(""); }
    catch (e) { setMsg(e.message); }
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  const fail = (e, set) => (e.message === "Wrong PIN" || e.message === "Nepareizs PIN" ? onAuthFailed() : set(e.message));

  // Ref so the polling interval always uses the current PIN after it is changed
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const loadRecordings = async () => {
    try { setRecordings(await listRecordings(pinRef.current)); setRecErr(""); }
    catch (e) { fail(e, setRecErr); }
  };

  useEffect(() => { loadRecordings(); const t = setInterval(loadRecordings, 15000); return () => clearInterval(t); }, []);

  const [photos, setPhotos] = useState([]);
  const [photosErr, setPhotosErr] = useState("");

  const loadPhotos = async () => {
    try { setPhotos(await listPhotos(pinRef.current)); setPhotosErr(""); }
    catch (e) { fail(e, setPhotosErr); }
  };

  useEffect(() => { loadPhotos(); const t = setInterval(loadPhotos, 15000); return () => clearInterval(t); }, []);

  const changePin = async (e) => {
    e.preventDefault();
    try {
      await setPin(newPin, pin);
      setNewPin("");
      setPinMsg("PIN nomainīts");
      onPinChanged(newPin);
    } catch (e) { fail(e, setPinMsg); }
  };

  const playRecording = async (r, place) => {
    const key = `${r.taskId}/${r.date}`;
    try {
      urlsRef.current[key] ||= await fetchRecordingUrl(r.taskId, r.date, pin);
      setPlayer({ place, key, url: urlsRef.current[key] });
    } catch (e) { setRecErr(e.message); }
  };

  const viewPhoto = async (taskId, date, name) => {
    try { setPhoto({ name, url: await fetchPhotoUrl(taskId, date, pin) }); }
    catch (e) { setMsg(e.message); }
  };

  const closePhoto = () => { URL.revokeObjectURL(photo.url); setPhoto(null); };

  // Marks/unmarks a task from the parent side; existing recordings/photos are untouched and get overwritten if the child does the task again
  const toggleTask = async (t) => {
    setBusy(t.id);
    try { setData(await checkTaskAsParent(t.id, !t.completedToday, pin)); setMsg(""); }
    catch (e) { fail(e, setMsg); }
    finally { setBusy(null); }
  };

  const playerAt = (place, key) => (player?.place === place && player.key === key ? player.url : null);

  const addTask = async (e) => {
    e.preventDefault();
    try {
      setData(await createTask(newTask, pin));
      setNewTask({ ...newTask, name: "" });
      setAddMsg("Uzdevums pievienots");
      setTimeout(() => setAddMsg(""), 2000);
    } catch (e) { fail(e, setAddMsg); }
  };

  if (!data) return <main className="page center"><p className="muted">{msg || "Ielādē…"}</p></main>;

  const todo = data.tasks.filter((t) => t.requiredToday);
  const done = todo.filter((t) => t.completedToday).length;
  const status = !todo.length ? ["off", "Šodien nekas nav ieplānots"]
    : done === todo.length ? ["done", "Visi šodienas uzdevumi ir paveikti"]
      : ["wait", `${done} no ${todo.length} uzdevumiem šodien paveikti`];
  const newTpl = TEMPLATES[newTask.template];
  const NewSettings = newTpl?.settingsOnCreate && newTpl.Settings;

  return (
    <main className="page">
      <div className="row header">
        <h1>Vecāka panelis</h1>
        <button className="btn" onClick={onExit}>Atpakaļ uz sarakstu</button>
      </div>

      <section className={`status ${status[0]}`} aria-live="polite">
        <span className="dot" /> {status[1]}
        {msg && <small>{msg}</small>}
      </section>

      {todo.length > 0 && (
        <section className="card">
          <h2>Šodien</h2>
          <ul className="quick">
            {todo.map((t) => {
              const rec = templateOf(t)?.recordsAudio && recordings.find((r) => r.taskId === t.id && r.date === data.today);
              const url = rec && playerAt("today", `${rec.taskId}/${rec.date}`);
              return (
                <li key={t.id} className={t.completedToday ? "done" : ""}>
                  <button className="mark" disabled={busy === t.id} aria-pressed={t.completedToday}
                    aria-label={`${t.completedToday ? "Noņemt atzīmi" : "Atzīmēt"} ${t.name}`}
                    onClick={() => toggleTask(t)} />
                  <span className="quick-name">
                    {t.name}
                    <small className="muted">{statusOf(t)[1]}</small>
                  </span>
                  {templateOf(t)?.photoEvidence && t.hasPhotoToday &&
                    <button className="btn" onClick={() => viewPhoto(t.id, data.today, t.name)}>Skatīt attēlu</button>}
                  {rec && (url
                    ? <audio controls autoPlay src={url} />
                    : <button className="btn" onClick={() => playRecording(rec, "today")}>Atskaņot</button>)}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {photo && <PhotoModal key={photo.url} photo={photo} onClose={closePhoto} />}

      <h2 className="section-title">Visi uzdevumi</h2>
      {data.tasks.map((t) => <TaskEditor key={t.id} task={t} pin={pin} onData={setData} onFail={fail} />)}
      {!data.tasks.length && <p className="muted">Pagaidām nav uzdevumu. Pievieno zemāk.</p>}

      <section className="card">
        <h2>Pievienot uzdevumu</h2>
        <form onSubmit={addTask}>
          <label className="field">
            Tips
            <select value={newTask.template} onChange={(e) => setNewTask({ ...newTask, template: e.target.value, params: {} })}>
              {Object.entries(TEMPLATES).map(([key, tpl]) => <option key={key} value={key}>{tpl.label}</option>)}
            </select>
          </label>
          {NewSettings && <NewSettings params={newTask.params} onChange={(params) => setNewTask({ ...newTask, params })} />}
          <label className="field">
            Nosaukums
            <input value={newTask.name} maxLength={60} required placeholder={TEMPLATES[newTask.template]?.namePlaceholder}
              onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} />
          </label>
          <button className="btn primary" type="submit">Pievienot uzdevumu</button>
          <span className="muted"> {addMsg}</span>
        </form>
      </section>

      <section className="card">
        <h2>Audio ieraksti</h2>
        <button className="btn" onClick={loadRecordings}>Atsvaidzināt ierakstus</button>
        {recErr && <p className="muted">{recErr}</p>}
        <ul className="recordings">
          {recordings.map((r) => {
            const key = `${r.taskId}/${r.date}`;
            return (
              <li key={key}>
                <span>{r.date} · {r.taskName}</span>
                {playerAt("list", key)
                  ? <audio controls autoPlay src={playerAt("list", key)} />
                  : <button className="btn" onClick={() => playRecording(r, "list")}>Atskaņot</button>}
              </li>
            );
          })}
          {!recordings.length && <p className="muted">Pagaidām nav ierakstu</p>}
        </ul>
      </section>

      <section className="card">
        <h2>Attēli</h2>
        <button className="btn" onClick={loadPhotos}>Atsvaidzināt attēlus</button>
        {photosErr && <p className="muted">{photosErr}</p>}
        <ul className="recordings">
          {photos.map((p) => (
            <li key={`${p.taskId}/${p.date}`}>
              <span>{p.date} · {p.taskName}</span>
              <button className="btn" onClick={() => viewPhoto(p.taskId, p.date, p.taskName)}>Skatīt attēlu</button>
            </li>
          ))}
          {!photos.length && <p className="muted">Pagaidām nav attēlu</p>}
        </ul>
      </section>

      <section className="card">
        <h2>Mainīt vecāka PIN</h2>
        <form onSubmit={changePin}>
          <label className="field">
            Jauns PIN (4-8 cipari)
            <input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" required
              value={newPin} onChange={(e) => setNewPin(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">Mainīt PIN</button>
          <span className="muted"> {pinMsg}</span>
        </form>
      </section>
    </main>
  );
}
