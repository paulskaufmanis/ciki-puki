import React, { useEffect, useState } from "react";
import { getPinStatus, verifyPin, setPin } from "./api.js";
import Parent from "./Parent.jsx";

const KEY = "parentPin";

export default function ParentGate({ onExit }) {
    const [pin, setPinState] = useState(() => sessionStorage.getItem(KEY) || "");
    const [mode, setMode] = useState("loading"); // loading | setup | login | ok
    const [input, setInput] = useState("");
    const [confirm, setConfirm] = useState("");
    const [err, setErr] = useState("");

    useEffect(() => {
        localStorage.removeItem("pin"); // drop PIN persisted by older versions
        getPinStatus()
            .then(({ pinSet }) => setMode(!pinSet ? "setup" : pin ? "ok" : "login"))
            .catch((e) => { setErr(e.message); setMode("login"); });
    }, []);

    const unlock = (p) => { sessionStorage.setItem(KEY, p); setPinState(p); setInput(""); setConfirm(""); setErr(""); setMode("ok"); };

    const submit = async (e) => {
        e.preventDefault();
        try {
            if (mode === "setup") {
                if (input !== confirm) return setErr("PIN kodi nesakrīt");
                await setPin(input);
            } else {
                await verifyPin(input);
            }
            unlock(input);
        } catch (e) { setErr(e.message); }
    };

    // Called by Parent when the server rejects the stored PIN (e.g. changed elsewhere)
    const relock = () => { sessionStorage.removeItem(KEY); setPinState(""); setMode("login"); };

    if (mode === "ok") return <Parent pin={pin} onPinChanged={unlock} onAuthFailed={relock} onExit={onExit} />;
    if (mode === "loading") return <main className="page center full"><p className="muted">Ielādē…</p></main>;

    return (
        <main className="page center full">
            <h1>{mode === "setup" ? "Izveidot vecāka PIN" : "Vecāka PIN"}</h1>
            <form className="card pin-form" onSubmit={submit}>
                <label className="field">
                    {mode === "setup" ? "Jauns PIN (4-8 cipari)" : "Ievadi PIN"}
                    <input type="password" inputMode="numeric" autoComplete="off" autoFocus pattern="[0-9]{4,8}" required
                        value={input} onChange={(e) => setInput(e.target.value)} />
                </label>
                {mode === "setup" && (
                    <label className="field">
                        Atkārto PIN
                        <input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" required
                            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </label>
                )}
                <div className="row">
                    <button className="btn primary" type="submit">{mode === "setup" ? "Saglabāt PIN" : "Atvērt"}</button>
                    <button className="btn" type="button" onClick={onExit}>Atpakaļ</button>
                </div>
                {err && <p className="muted">{err}</p>}
            </form>
        </main>
    );
}
