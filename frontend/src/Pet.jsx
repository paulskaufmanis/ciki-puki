import React, { forwardRef, useEffect, useRef, useImperativeHandle } from "react";

const FUR = "#3b4053", FUR_DARK = "#262a38", FUR_LIGHT = "#6f7690", INK = "#0e0f13";

// Fluffy black puppy companion. mood: idle | cheer | hungry | eat | happy
// play: a one-off trick when the child pets it: flip | scratch | bark | lick
// The pupils follow the pointer so the pet seems to be watching the child.
const Pet = forwardRef(function Pet({ mood = "idle", play = null, className = "" }, ref) {
  const root = useRef(null);
  useImperativeHandle(ref, () => root.current);

  useEffect(() => {
    let frame = 0;
    const look = (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = root.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.35);
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, len / 200) * 4.5;
        el.style.setProperty("--px", `${(dx / len) * k}px`);
        el.style.setProperty("--py", `${(dy / len) * k}px`);
      });
    };
    window.addEventListener("pointermove", look);
    return () => { window.removeEventListener("pointermove", look); cancelAnimationFrame(frame); };
  }, []);

  const eyes = [72, 128];
  return (
    <div ref={root} className={`pet ${className}`} data-mood={mood} data-play={play || undefined} role="img" aria-label="Tavs mazais kucēns">
      <svg viewBox="0 0 200 225" focusable="false" aria-hidden="true">
        <ellipse className="pet-shadow" cx="100" cy="219" rx="66" ry="6" fill="#000" opacity=".3" />
        <g className="pet-body">
          <g className="pet-tail"><path d="M142 190C170 186 178 160 170 146C166 140 158 144 160 152C163 166 154 174 138 176Z" fill={FUR_DARK} /></g>

          <g className="pet-hind pet-hind-l"><ellipse cx="56" cy="188" rx="25" ry="30" fill={FUR_DARK} /><ellipse cx="46" cy="209" rx="19" ry="9" fill={FUR_DARK} /></g>
          <g className="pet-hind pet-hind-r"><ellipse cx="144" cy="188" rx="25" ry="30" fill={FUR_DARK} /><ellipse cx="154" cy="209" rx="19" ry="9" fill={FUR_DARK} /></g>

          <path d="M58 200C46 150 62 118 100 116C138 118 154 150 142 200Z" fill={FUR} />
          <ellipse cx="100" cy="166" rx="27" ry="36" fill={FUR_LIGHT} opacity=".8" />

          <g className="pet-arm pet-arm-l">
            <rect x="68" y="146" width="26" height="60" rx="13" fill={FUR} />
            <ellipse cx="81" cy="206" rx="18" ry="10" fill={FUR_DARK} />
            <g stroke={FUR} strokeWidth="2" strokeLinecap="round" opacity=".7"><line x1="75" y1="203" x2="75" y2="210" /><line x1="82" y1="204" x2="82" y2="211" /><line x1="89" y1="203" x2="89" y2="210" /></g>
          </g>
          <g className="pet-arm pet-arm-r">
            <rect x="106" y="146" width="26" height="60" rx="13" fill={FUR} />
            <ellipse cx="119" cy="206" rx="18" ry="10" fill={FUR_DARK} />
            <g stroke={FUR} strokeWidth="2" strokeLinecap="round" opacity=".7"><line x1="111" y1="203" x2="111" y2="210" /><line x1="118" y1="204" x2="118" y2="211" /><line x1="125" y1="203" x2="125" y2="210" /></g>
          </g>

          <g className="pet-head">
            <g className="pet-ear pet-ear-l"><path d="M58 38C30 40 16 78 24 112C28 126 46 124 54 106C62 88 66 58 58 38Z" fill={FUR_DARK} /></g>
            <g className="pet-ear pet-ear-r"><path d="M142 38C170 40 184 78 176 112C172 126 154 124 146 106C138 88 134 58 142 38Z" fill={FUR_DARK} /></g>

            <ellipse cx="100" cy="82" rx="64" ry="56" fill={FUR} />
            <ellipse cx="86" cy="46" rx="30" ry="11" fill="#fff" opacity=".2" />
            <ellipse cx="100" cy="106" rx="32" ry="25" fill={FUR_LIGHT} />

            {mood === "happy" ? (
              <g fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round">
                <path d="M57 86Q72 66 87 86" /><path d="M113 86Q128 66 143 86" />
              </g>
            ) : (
              <g className="pet-eyes">
                {eyes.map((cx) => (
                  <g key={cx}>
                    <circle cx={cx} cy="80" r="17" fill="#fff" stroke={INK} strokeWidth="3" />
                    <g className="pet-pupil">
                      <circle cx={cx} cy="81" r="12.5" fill="#d9951a" />
                      <circle cx={cx} cy="81" r="7.5" fill={INK} />
                    </g>
                    <circle cx={cx - 5} cy="74" r="4" fill="#fff" /><circle cx={cx + 5} cy="87" r="2" fill="#fff" opacity=".85" />
                  </g>
                ))}
              </g>
            )}

            <ellipse cx="100" cy="94" rx="12" ry="8.5" fill={INK} />
            <ellipse cx="96" cy="91" rx="4" ry="2" fill="#fff" opacity=".5" />

            {mood === "eat" ? (
              <g className="pet-chomp"><ellipse cx="100" cy="114" rx="15" ry="12" fill="#3a1220" /><ellipse cx="100" cy="120" rx="9" ry="5" fill="#ff7a93" /></g>
            ) : mood === "cheer" || mood === "hungry" || mood === "happy" || play === "bark" || play === "lick" ? (
              <g className={mood === "hungry" ? "pet-gape" : ""}>
                <path d="M100 102V106" stroke={INK} strokeWidth="3" strokeLinecap="round" />
                <path d="M82 106Q100 140 118 106Z" fill="#3a1220" />
                <path className="pet-tongue" d="M91 124Q100 114 109 124Q100 134 91 124Z" fill="#ff7a93" />
              </g>
            ) : (
              <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M100 102V107" /><path d="M86 108Q93 117 100 107Q107 117 114 108" />
              </g>
            )}
          </g>
          {play === "scratch" && (
            <g className="pet-scratch-leg">
              <path d="M148 178Q188 150 170 100" fill="none" stroke={FUR_DARK} strokeWidth="20" strokeLinecap="round" />
              <ellipse cx="170" cy="96" rx="15" ry="11" fill={FUR_DARK} stroke={FUR} strokeWidth="2" />
              <g stroke={FUR} strokeWidth="2" strokeLinecap="round" opacity=".7"><line x1="164" y1="90" x2="162" y2="98" /><line x1="170" y1="88" x2="170" y2="97" /><line x1="176" y1="90" x2="178" y2="98" /></g>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
});

export default Pet;
