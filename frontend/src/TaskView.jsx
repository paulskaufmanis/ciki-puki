import React, { useEffect, useRef, useState } from "react";
import { getTasks } from "./api.js";
import { templateOf } from "./templates/index.js";
import HighFive from "./HighFive.jsx";
import Confetti from "./Confetti.jsx";
import Pet from "./Pet.jsx";
import { CoinFlight } from "./Coins.jsx";
import { playFanfare } from "./sound.js";

// Opens one task in its template's own view
export default function TaskView({ id, onBack, onPet }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const [highFive, setHighFive] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [bonus, setBonus] = useState(null); // result of a finished bonus round while its celebration plays
  const [flight, setFlight] = useState(false); // coins flying into the counter
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const load = () =>
    getTasks()
      .then(({ tasks }) => {
        const t = tasks.find((x) => x.id === id);
        t ? setTask(t) : setError("Šis uzdevums vairs nav sarakstā.");
      })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [id]);

  // A runner calls onDone the moment it completes the task: celebrate with a high-five
  const finished = () => { load(); setHighFive(true); };

  // Extra practice round done: like after a full day, the happy puppy takes the centre of the screen
  // and the bonus coins fly into the counter
  const bonusDone = (result) => {
    playFanfare();
    setConfetti((k) => k + 1);
    setFlight(false);
    setBonus(result);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlight(true), 900);
  };

  const petDock = <div className={`pet-dock${bonus ? " feeding" : ""}`}><Pet mood={bonus ? "happy" : "idle"} /></div>;

  const Runner = task && templateOf(task)?.Runner;
  if (error || (task && !Runner))
    return (
      <main className="page center full">
        <h1>Ups</h1>
        <p className="muted">{error || "Šāda veida uzdevumu nevar atvērt šajā lietotnes versijā."}</p>
        <button className="btn" onClick={onBack}>Atpakaļ uz sarakstu</button>
      </main>
    );
  if (!task) return <main className="page center full"><p className="muted">Ielādē…</p></main>;

  return (
    <>
      <Runner task={task} onDone={finished} onBonus={bonusDone} onBack={onBack} />
      {bonus && (
        <div className="feed-stage" role="status">
          <h1 className="feed-title">Lieliski nospēlēts! 🎉</h1>
          <p className="feed-sub">Saņem {bonus.awarded} monētas!</p>
        </div>
      )}
      {petDock}
      {highFive && (
        <HighFive onSlap={() => setConfetti((k) => k + 1)}
          onDone={() => setHighFive(false)} />
      )}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
      {bonus && flight && (
        <CoinFlight amount={bonus.awarded} onFirstLand={() => onPet?.({ coins: bonus.coins, fedToday: bonus.fedToday })}
          onDone={() => { setBonus(null); setFlight(false); }} />
      )}
    </>
  );
}
