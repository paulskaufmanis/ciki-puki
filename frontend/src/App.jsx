import React, { useCallback, useEffect, useState } from "react";
import ParentGate from "./ParentGate.jsx";
import Child from "./Child.jsx";
import TaskView from "./TaskView.jsx";
import Pet from "./Pet.jsx";
import { CoinCounter } from "./Coins.jsx";
import { getPet } from "./api.js";

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const [pet, setPet] = useState(null); // { coins, fedToday }
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (to) => { history.pushState({}, "", to); setPath(to); };

  const loadPet = useCallback(() => getPet().then(setPet).catch(() => {}), []);
  useEffect(() => {
    loadPet();
    // fedToday resets with the date, so refresh when the app returns to the foreground
    const onShow = () => { if (document.visibilityState === "visible") loadPet(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [loadPet]);

  if (path.startsWith("/parent")) return <ParentGate onExit={() => go("/")} />;
  const taskMatch = path.match(/^\/task\/([0-9]+)$/);
  return (
    <>
      {pet && <CoinCounter coins={pet.coins} />}
      {taskMatch
        ? <>
            <TaskView key={taskMatch[1]} id={Number(taskMatch[1])} onBack={() => go("/")} />
            <div className="pet-dock"><Pet mood="idle" /></div>
          </>
        : <Child onOpen={(id) => go(`/task/${id}`)} pet={pet} onPet={setPet} />}
      <button className="parent-switch" onClick={() => go("/parent")} aria-label="Vecāka skats">Vecāks</button>
    </>
  );
}
