import React, { useRef, useState } from "react";
import { submitPhoto } from "../../api.js";
import { exifDateTaken } from "./exif.js";

const MAX_SIDE = 1600; // keeps the stored JPEG well under D1's 2 MB row limit

// Re-encodes as a smaller JPEG. <img> applies EXIF orientation; the canvas output drops all metadata (incl. GPS).
async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Neizdevās nolasīt šo fotoattēlu"))), "image/jpeg", 0.85));
    } catch {
        throw new Error("Neizdevās nolasīt šo fotoattēlu. Lūdzu, mēģini ar citu.");
    } finally {
        URL.revokeObjectURL(url);
    }
}

export default function PhotoEvidence({ task, onDone, onBack }) {
    const [phase, setPhase] = useState("idle"); // idle | checking | done
    const [error, setError] = useState("");
    const cameraRef = useRef(null), pickerRef = useRef(null);

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow choosing the same file again
        if (!file) return;
        setPhase("checking");
        setError("");
        try {
            const takenAt = await exifDateTaken(file);
            await submitPhoto(task.id, await shrink(file), takenAt, file.lastModified);
            setPhase("done");
            onDone?.();
        } catch (err) {
            setError(err.message);
            setPhase("idle");
        }
    };

    const back = <button className="btn" onClick={onBack}>Atpakaļ uz sarakstu</button>;

    if (phase === "done" || task.completedToday)
        return (
            <main className="page center full done">
                <div className="celebrate" aria-hidden="true" />
                <h1>{task.name} – gatavs!</h1>
                <p>Lieliski!</p>
                <button className="btn primary big" onClick={onBack}>Atpakaļ uz sarakstu</button>
            </main>
        );

    if (!task.requiredToday)
        return <main className="page center full"><h1>Nav šodienas sarakstā</h1><p className="muted">Izbaudi savu dienu.</p>{back}</main>;

    const checking = phase === "checking";
    return (
        <main className="page center full">
            <h1>{task.name}</h1>
            <p className="muted">Kad esi beidzis, uzņem fotoattēlu, lai parādītu, ka uzdevums ir izpildīts.</p>
            {error && <p className="photo-error" role="alert">{error}</p>}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
            <input ref={pickerRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button className="btn primary big" disabled={checking} onClick={() => cameraRef.current.click()}>
                {checking ? "Pārbaudu fotoattēlu…" : "Uzņemt foto"}
            </button>
            <button className="btn" disabled={checking} onClick={() => pickerRef.current.click()}>Augšupielādēt attēlu</button>
            <p>{back}</p>
        </main>
    );
}
