import React, { useRef, useState } from "react";

const TREATS = [
  { emoji: "🍖", x: -46, y: 14, r: -20 },
  { emoji: "🦴", x: 44, y: 10, r: 16 },
  { emoji: "🦴", x: 0, y: 34, r: 4 },
];
export const TREAT_COUNT = TREATS.length;

// Jumbled bowl of treats. The top treat can be dragged to the pet, or tapped to fly there.
// `treats` is how many are left; onFeed() is called each time one reaches the pet's mouth.
export default function FeedBowl({ petRef, treats, disabled, onFeed }) {
  const [pos, setPos] = useState({ x: 0, y: 0, mode: "idle" });
  const drag = useRef(null);
  const el = useRef(null);

  const mouthOf = () => {
    const r = petRef.current?.getBoundingClientRect();
    return r && { r, x: r.left + r.width / 2, y: r.top + r.height * 0.5 };
  };

  const deliver = () => {
    const m = mouthOf();
    const t = el.current?.getBoundingClientRect();
    if (!m || !t) { onFeed(); return; }
    setPos((p) => ({
      x: p.x + m.x - (t.left + t.width / 2),
      y: p.y + m.y - (t.top + t.height / 2),
      mode: "fly",
    }));
    setTimeout(() => { setPos({ x: 0, y: 0, mode: "idle" }); onFeed(); }, 280);
  };

  const down = (e) => {
    if (disabled || pos.mode === "fly") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    setPos({ x: 0, y: 0, mode: "drag" });
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 8) d.moved = true;
    setPos({ x: dx, y: dy, mode: "drag" });
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const m = mouthOf(), t = el.current?.getBoundingClientRect();
    const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
    const overPet = m && cx > m.r.left && cx < m.r.right && cy > m.r.top && cy < m.r.bottom;
    if (!d.moved || overPet) deliver();
    else setPos({ x: 0, y: 0, mode: "idle" });
  };
  const cancel = () => { drag.current = null; setPos({ x: 0, y: 0, mode: "idle" }); };
  const key = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled && pos.mode !== "fly") deliver(); }
  };

  return (
    <div className="bowl-area">
      {TREATS.slice(0, treats).map((t, i) => {
        const top = i === treats - 1;
        const style = { left: `calc(50% + ${t.x}px)`, bottom: `${t.y + 74}px` };
        return top ? (
          <span key={i} className="treat-slot top" style={style}>
            <button ref={el} className={`treat ${pos.mode}`} disabled={disabled}
              aria-label="Pabarot kucēnu — velc kārumu pie tā vai pieskaries"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.mode === "drag" ? 0 : t.r}deg) scale(${pos.mode === "drag" ? 1.15 : 1})` }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onKeyDown={key}>
              {t.emoji}
            </button>
          </span>
        ) : (
          <span key={i} className="treat-slot" style={style}>
            <span className="treat static" style={{ transform: `rotate(${t.r}deg)` }} aria-hidden="true">{t.emoji}</span>
          </span>
        );
      })}
      <div className="bowl" aria-hidden="true" />
    </div>
  );
}
