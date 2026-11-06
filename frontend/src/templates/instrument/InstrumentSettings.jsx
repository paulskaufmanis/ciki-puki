import React from "react";

export default function InstrumentSettings({ params, onChange }) {
    return (
        <>
            <label className="field">
                Prakses laiks (minūtēs)
                <input type="number" min="0" max="240" value={params.durationMinutes}
                    onChange={(e) => onChange({ ...params, durationMinutes: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>

            <label className="field">
                Mikrofona filtra līmenis
                <select value={params.micLevel} onChange={(e) => onChange({ ...params, micLevel: Number(e.target.value) })}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((l) => (
                        <option key={l} value={l}>
                            {l}{l === 1 ? " – skaitās jebkura skaņa" : l === 10 ? " – tikai skaidras ģitāras diapazona notis" : ""}
                        </option>
                    ))}
                </select>
            </label>
        </>
    );
}
