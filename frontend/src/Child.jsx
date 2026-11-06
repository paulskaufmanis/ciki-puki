import React, { useEffect, useRef, useState } from "react";
import { getTasks, checkTask, feedPet, UNTICKED_KEY } from "./api.js";
import { templateOf } from "./templates/index.js";
import Pet from "./Pet.jsx";
import HighFive from "./HighFive.jsx";
import Confetti from "./Confetti.jsx";
import FeedBowl, { TREAT_COUNT } from "./FeedBowl.jsx";
import { CoinFlight } from "./Coins.jsx";
import { playCrunch, playFanfare, playBark, playBoing, playScratch, playLick } from "./sound.js";

const EAT_MS = 900;

// Petting the puppy: it does a random trick per tap; after MAX_TRICKS it says to get to work, and
// playing unlocks again once the child has finished at least one more task
const PLAY_KEY = "ciki-play";
const TRICKS = { flip: { ms: 1100, sound: playBoing }, scratch: { ms: 1800, sound: playScratch }, bark: { ms: 1000, sound: playBark }, lick: { ms: 1600, sound: playLick } };
const MAX_TRICKS = 5;
const readPlay = (today) => {
  try {
    const v = JSON.parse(localStorage.getItem(PLAY_KEY));
    if (v?.date === today) return v;
  } catch { /* ignore */ }
  return { date: today, plays: 0, lockDone: null };
};
const writePlay = (v) => { try { localStorage.setItem(PLAY_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };

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
  const [awarded, setAwarded] = useState(0); // coins the finished feeding pays out
  const [play, setPlay] = useState(null);     // trick the puppy is doing right now
  const [bubble, setBubble] = useState(null); // what the puppy says
  const bubbleTimer = useRef(null);
  const lastTrick = useRef(null);
  useEffect(() => () => clearTimeout(bubbleTimer.current), []);
  const [drafts, setDrafts] = useState({}); // taskId -> work detail texts being typed
  const petRef = useRef(null);
  const slap = useRef(null);
  const pendingDetails = useRef(undefined);
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

  const say = (text, ms = 2600) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  };

  const touchPet = () => {
    if (feeding || highFive || play) return;
    const st = readPlay(data.today);
    const doneNow = todo.filter((t) => t.completedToday).length;
    if (st.lockDone !== null && doneNow > st.lockDone) { st.plays = 0; st.lockDone = null; } // got some work done: play again
    if (st.lockDone !== null) { writePlay(st); say("Ķeries pie darba!"); return; }

    st.plays += 1;
    const names = Object.keys(TRICKS).filter((n) => n !== lastTrick.current);
    const trick = names[Math.floor(Math.random() * names.length)];
    lastTrick.current = trick;
    if (st.plays >= MAX_TRICKS) st.lockDone = doneNow;
    writePlay(st);

    setPlay(trick);
    TRICKS[trick].sound();
    if (trick === "bark") say("Vau! Vau!", TRICKS.bark.ms);
    later(() => {
      setPlay(null);
      if (st.lockDone !== null) say("Ķeries pie darba!");
    }, TRICKS[trick].ms);
  };

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

  const clearDraft = (id) => setDrafts(({ [id]: _, ...rest }) => rest);

  // Plain toggle without the high-five: unticking a mis-tap, or re-ticking a task unticked earlier today
  const toggleQuiet = async (task, done, details) => {
    setBusy(task.id);
    try {
      if (!done) markUnticked(data.today, task.id);
      setData(await checkTask(task.id, done, details));
      setJustDone(done ? task.id : null);
      if (details) clearDraft(task.id);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const onCheck = (task, details) => {
    if (task.completedToday) toggleQuiet(task, false);
    else if (readUnticked(data.today).includes(task.id)) toggleQuiet(task, true, details);
    else { setBusy(task.id); pendingDetails.current = details; setHighFive(task); }
  };

  const onSlap = () => {
    setConfetti((k) => k + 1);
    cheer();
    slap.current = checkTask(highFive.id, true, pendingDetails.current);
    slap.current.catch(() => { });
  };

  const onSlapDone = async () => {
    const task = highFive;
    try {
      setData(await slap.current);
      setJustDone(task.id);
      if (pendingDetails.current) clearDraft(task.id);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setHighFive(null); setBusy(null); }
  };

  const claim = async () => {
    setFeedError("");
    try {
      const res = await feedPet();
      setAwarded(res.awarded);
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
            const askDetails = !t.completedToday && !!tpl?.needsDetails?.(t);
            const draft = drafts[t.id] || [""];
            const filled = draft.map((d) => d.trim()).filter(Boolean);
            // Only tasks ticked by hand can be unticked by the child; tasks needing details wait for at least one item
            const canToggle = t.completedToday ? t.completedManually && t.allowManual : t.allowManual && (!askDetails || filled.length > 0);
            const label = <><span className="todo-name">{t.name}</span><span className="muted">{tpl?.summary(t)}</span></>;
            return (
              <li key={t.id} className={`todo-item${t.completedToday ? " done" : ""}${justDone === t.id ? " pop" : ""}`}>
                <button className="check" disabled={!canToggle || busy === t.id || !!highFive} aria-pressed={t.completedToday}
                  aria-label={`${t.completedToday ? "Noņemt atzīmi" : "Atzīmēt"} ${t.name}`}
                  onClick={() => onCheck(t, askDetails ? filled : undefined)} />
                {tpl?.Runner
                  ? <button className="todo-open" onClick={() => onOpen(t.id)}>{label}</button>
                  : <div className="todo-open static">{label}</div>}
                {askDetails && tpl.DetailsInput &&
                  <tpl.DetailsInput taskName={t.name} value={draft} disabled={busy === t.id} options={t.params.detailOptions}
                    onChange={(v) => setDrafts((d) => ({ ...d, [t.id]: v }))} />}
                {t.detailsToday && (
                  <ul className="detail-list">{t.detailsToday.map((d, i) => <li key={i}>{d}</li>)}</ul>
                )}
              </li>
            );
          })}
        </ul>
      </main>

      {feeding && (
        <div className="feed-stage" role="region" aria-label="Kucēna barošana">
          <h1 className="feed-title">{feedMood === "happy" ? "Ļoti garšīgi! 🎉" : "Visi uzdevumi paveikti!"}</h1>
          <p className="feed-sub">
            {feedMood === "happy" ? (awarded ? `Tu esi lielisks! Saņem ${awarded} monētas!` : "Tu esi lielisks!") : "Pabaro savu kucēnu — velc ēdienu pie tā vai pieskaries."}
          </p>
          {feedError && (
            <p className="feed-error" role="alert">{feedError} <button className="btn" onClick={claim}>Mēģināt vēlreiz</button></p>
          )}
          {treats > 0 && <FeedBowl petRef={petRef} treats={treats} disabled={feedMood === "eat"} onFeed={onFeed} />}
        </div>
      )}

      <div className={`pet-dock${feeding ? " feeding" : ""}`}>
        {bubble && !feeding && <div className="pet-bubble" role="status">{bubble}</div>}
        <button className="pet-touch" disabled={feeding} onClick={touchPet} aria-label="Paspēlēties ar kucēnu">
          <Pet ref={petRef} mood={petMood} play={play} />
        </button>
      </div>

      {highFive && <HighFive onSlap={onSlap} onDone={onSlapDone} />}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
      {reward && <CoinFlight amount={reward.awarded} onFirstLand={() => onPet(reward)} onDone={() => { setReward(null); setCelebrating(false); }} />}
    </>
  );
}
