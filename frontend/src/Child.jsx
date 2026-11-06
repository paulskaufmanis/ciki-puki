import React, { useEffect, useRef, useState } from "react";
import { getTasks, checkTask, feedPet, UNTICKED_KEY } from "./api.js";
import { templateOf } from "./templates/index.js";
import Pet from "./Pet.jsx";
import HighFive from "./HighFive.jsx";
import Confetti from "./Confetti.jsx";
import FeedBowl, { TREAT_COUNT } from "./FeedBowl.jsx";
import { CoinFlight } from "./Coins.jsx";
import { playCrunch, playFanfare } from "./sound.js";

const EAT_MS = 900;

// Tasks the child unticked today: ticking them again skips the high-five (it was probably a mis-tap)
const readUnticked = (today) => {
  try {
    const v = JSON.parse(localStorage.getItem(UNTICKED_KEY));
    return v?.date === today && Array.isArray(v.ids) ? v.ids : [];
  } catch { return []; }
};
const markUnticked = (today, id) => {
  try { localStorage.setItem(UNTICKED_KEY, JSON.stringify({ date: today, ids: [...new Set([...readUnticked(today), id])] })); } catch { /* storage unavailable */ }
};

// Child home screen: today's to-do list, the pet companion and the end-of-day feeding mode
export default function Child({ onOpen, pet, onPet }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [justDone, setJustDone] = useState(null);
  const [highFive, setHighFive] = useState(null); // task waiting for the child's high-five
  const [confetti, setConfetti] = useState(0);
  const [cheering, setCheering] = useState(false);
  const [treats, setTreats] = useState(TREAT_COUNT);
  const [feedMood, setFeedMood] = useState("hungry");
  const [celebrating, setCelebrating] = useState(false); // from the first bite until the coins have landed
  const [reward, setReward] = useState(null);
  const [feedError, setFeedError] = useState("");
  const petRef = useRef(null);
  const slap = useRef(null);
  const timers = useRef([]);

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const load = () => getTasks().then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // Refresh when the app comes back to the foreground (e.g. the next day)
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  const todo = data ? data.tasks.filter((t) => t.requiredToday) : [];
  const left = todo.filter((t) => !t.completedToday).length;
  const allDone = todo.length > 0 && !left;
  const feeding = allDone && !!pet && (!pet.fedToday || celebrating);

  useEffect(() => {
    document.body.classList.toggle("feeding", feeding);
    return () => document.body.classList.remove("feeding");
  }, [feeding]);

  useEffect(() => {
    if (!feeding) return;
    setTreats(TREAT_COUNT);
    setFeedMood("hungry");
    setFeedError("");
  }, [feeding]);

  const cheer = (ms = 2200) => { setCheering(true); later(() => setCheering(false), ms); };

  // Plain toggle without the high-five: unticking a mis-tap, or re-ticking a task unticked earlier today
  const toggleQuiet = async (task, done) => {
    setBusy(task.id);
    try {
      if (!done) markUnticked(data.today, task.id);
      setData(await checkTask(task.id, done));
      setJustDone(done ? task.id : null);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const onCheck = (task) => {
    if (task.completedToday) toggleQuiet(task, false);
    else if (readUnticked(data.today).includes(task.id)) toggleQuiet(task, true);
    else { setBusy(task.id); setHighFive(task); }
  };

  const onSlap = () => {
    setConfetti((k) => k + 1);
    cheer();
    slap.current = checkTask(highFive.id, true);
    slap.current.catch(() => { });
  };

  const onSlapDone = async () => {
    const task = highFive;
    try {
      setData(await slap.current);
      setJustDone(task.id);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setHighFive(null); setBusy(null); }
  };

  const claim = async () => {
    setFeedError("");
    try {
      const res = await feedPet();
      setFeedMood("happy");
      playFanfare();
      setConfetti((k) => k + 1);
      if (res.awarded) later(() => setReward(res), 900);
      else later(() => { onPet(res); setCelebrating(false); }, 2200);
    } catch (e) { setFeedError(e.message); }
  };

  const onFeed = () => {
    playCrunch();
    setCelebrating(true);
    setFeedMood("eat");
    const remaining = treats - 1;
    setTreats(remaining);
    if (remaining > 0) later(() => setFeedMood("hungry"), EAT_MS);
    else later(claim, EAT_MS);
  };

  if (!data) return <main className="page center full"><p className="muted">{error || "Ielādē…"}</p></main>;

  const petMood = feeding ? feedMood : highFive || cheering ? "cheer" : allDone ? "happy" : "idle";

  return (
    <>
      <main className={`page child${allDone ? " done" : ""}${feeding ? " faded" : ""}`} aria-hidden={feeding || undefined}>
        <h1>{!todo.length ? "Šodien nekas nav jādara" : left ? "Šodienas saraksts" : "Viss šodien paveikts!"}</h1>
        <p className="muted">
          {!todo.length ? "Izbaudi savu dienu." : left ? `Atlikuši ${left} no ${todo.length}` : "Lieliski. Vari izklaidēties!"}
        </p>
        {error && <p className="muted" role="alert">{error}</p>}
        <ul className="todo">
          {todo.map((t) => {
            const tpl = templateOf(t);
            // Only tasks ticked by hand can be unticked by the child
            const canToggle = t.completedToday ? t.completedManually : t.allowManual;
            const label = <><span className="todo-name">{t.name}</span><span className="muted">{tpl?.summary(t)}</span></>;
            return (
              <li key={t.id} className={`todo-item${t.completedToday ? " done" : ""}${justDone === t.id ? " pop" : ""}`}>
                <button className="check" disabled={!canToggle || busy === t.id || !!highFive} aria-pressed={t.completedToday}
                  aria-label={`${t.completedToday ? "Noņemt atzīmi" : "Atzīmēt"} ${t.name}`}
                  onClick={() => onCheck(t)} />
                {tpl?.Runner
                  ? <button className="todo-open" onClick={() => onOpen(t.id)}>{label}</button>
                  : <div className="todo-open static">{label}</div>}
              </li>
            );
          })}
        </ul>
      </main>

      {feeding && (
        <div className="feed-stage" role="region" aria-label="Kucēna barošana">
          <h1 className="feed-title">{feedMood === "happy" ? "Ļoti garšīgi! 🎉" : "Visi uzdevumi paveikti!"}</h1>
          <p className="feed-sub">
            {feedMood === "happy" ? "Tu esi lielisks! Saņem 100 monētas!" : "Pabaro savu kucēnu — velc ēdienu pie tā vai pieskaries."}
          </p>
          {feedError && (
            <p className="feed-error" role="alert">{feedError} <button className="btn" onClick={claim}>Mēģināt vēlreiz</button></p>
          )}
          {treats > 0 && <FeedBowl petRef={petRef} treats={treats} disabled={feedMood === "eat"} onFeed={onFeed} />}
        </div>
      )}

      <div className={`pet-dock${feeding ? " feeding" : ""}`}>
        <Pet ref={petRef} mood={petMood} />
      </div>

      {highFive && <HighFive taskName={highFive.name} onSlap={onSlap} onDone={onSlapDone} />}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
      {reward && <CoinFlight amount={reward.awarded} onFirstLand={() => onPet(reward)} onDone={() => { setReward(null); setCelebrating(false); }} />}
    </>
  );
}
