import React, { useEffect, useMemo, useRef, useState } from "react";
import { playCoin } from "./sound.js";

export function CoinIcon({ className = "", style }) {
  return (
    <svg className={`coin-icon ${className}`} style={style} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#f5b81c" stroke="#b9800b" strokeWidth="2" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#b9800b" strokeWidth="1.5" opacity=".6" />
      <path d="M16 9l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fff3b0" />
    </svg>
  );
}

// Persistent balance in the top-right corner. Counts up smoothly when the balance grows.
export function CoinCounter({ coins }) {
  const [shown, setShown] = useState(coins);
  const [bump, setBump] = useState(0);
  const prev = useRef(coins);

  useEffect(() => {
    const from = prev.current;
    prev.current = coins;
    if (coins === from) return;
    if (coins < from) { setShown(coins); return; }
    setBump((b) => b + 1);
    const t0 = performance.now();
    let frame;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1200);
      setShown(Math.round(from + (coins - from) * p));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [coins]);

  return (
    <div id="coin-counter" className="coin-counter" role="status" aria-label={`Monētas: ${coins}`}>
      <CoinIcon />
      <span key={bump} className={bump ? "coin-count bump" : "coin-count"}>{shown}</span>
    </div>
  );
}

const COINS = 14;
const FLIGHT_MS = 1200;
const STAGGER_MS = 70;
const START_DELAY_MS = 150;

// Coins burst from the screen center and fly into the counter. onFirstLand fires when the first one
// arrives (update the balance then), onDone once all have landed.
export function CoinFlight({ amount, onFirstLand, onDone }) {
  const coins = useMemo(() => {
    const target = document.getElementById("coin-counter")?.getBoundingClientRect();
    const sx = innerWidth / 2, sy = innerHeight / 2;
    const tx = target ? target.left + target.width / 2 - 14 : innerWidth - 50;
    const ty = target ? target.top + target.height / 2 - 14 : 30;
    return Array.from({ length: COINS }, (_, i) => ({
      key: i,
      style: {
        left: sx - 14, top: sy - 14,
        "--sx": `${(Math.random() - 0.5) * 220}px`,
        "--sy": `${(Math.random() - 0.5) * 220}px`,
        "--dx": `${tx - sx}px`,
        "--dy": `${ty - sy}px`,
        animationDelay: `${START_DELAY_MS + i * STAGGER_MS}ms`,
        animationDuration: `${FLIGHT_MS}ms`,
      },
    }));
  }, []);

  useEffect(() => {
    const timers = coins.map((c, i) => setTimeout(() => {
      playCoin();
      if (i === 0) onFirstLand?.();
    }, START_DELAY_MS + i * STAGGER_MS + FLIGHT_MS * 0.9));
    timers.push(setTimeout(() => onDone?.(), START_DELAY_MS + COINS * STAGGER_MS + FLIGHT_MS + 200));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="coin-flight" aria-hidden="true">
      <div className="coin-reward">+{amount}</div>
      {coins.map((c) => <CoinIcon key={c.key} className="flying-coin" style={c.style} />)}
    </div>
  );
}
