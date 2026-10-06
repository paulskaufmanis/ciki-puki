import React, { useEffect, useState } from "react";
import Parent from "./Parent.jsx";
import Child from "./Child.jsx";

export default function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (to) => { history.pushState({}, "", to); setPath(to); };

  if (path.startsWith("/parent")) return <Parent />;
  if (path.startsWith("/child")) return <Child />;
  return (
    <main className="page center">
      <h1>Guitar Guard</h1>
      <p className="muted">Who is using this device?</p>
      <div className="row">
        <button className="btn" onClick={() => go("/parent")}>I'm a parent</button>
        <button className="btn primary" onClick={() => go("/child")}>I'm here to practice</button>
      </div>
    </main>
  );
}
