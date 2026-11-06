import React, { useEffect, useState } from "react";
import { getTasks } from "./api.js";
import { templateOf } from "./templates/index.js";
import HighFive from "./HighFive.jsx";
import Confetti from "./Confetti.jsx";

// Opens one task in its template's own view
export default function TaskView({ id, onBack }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const [highFive, setHighFive] = useState(false);
  const [confetti, setConfetti] = useState(0);

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
      <Runner task={task} onDone={finished} onBack={onBack} />
      {highFive && (
        <HighFive taskName={task.name} onSlap={() => setConfetti((k) => k + 1)}
          onDone={() => setHighFive(false)} />
      )}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
    </>
  );
}
