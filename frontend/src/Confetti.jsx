import React, { useEffect, useMemo } from "react";

const COLORS = ["#e2b23c", "#3fb68b", "#ff6b9d", "#6ec1ff", "#b388ff", "#ff9a3c"];

// One-shot confetti burst from the middle of the screen; unmounts itself via onDone
export default function Confetti({ count = 70, onDone }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const power = 25 + Math.random() * 45;
    return {
      key: i,
      style: {
        "--x": `${Math.cos(angle) * power}vmin`,
        "--y": `${Math.sin(angle) * power - 15}vmin`,
        "--fall": `${40 + Math.random() * 40}vmin`,
        "--rot": `${(Math.random() - 0.5) * 1440}deg`,
        background: COLORS[i % COLORS.length],
        animationDelay: `${Math.random() * 0.15}s`,
        animationDuration: `${1.6 + Math.random() * 1}s`,
        width: `${8 + Math.random() * 6}px`,
        height: `${12 + Math.random() * 8}px`,
        borderRadius: i % 3 === 0 ? "50%" : "2px",
      },
    };
  }), [count]);

  useEffect(() => {
    const id = setTimeout(() => onDone?.(), 2800);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => <i key={p.key} style={p.style} />)}
    </div>
  );
}
