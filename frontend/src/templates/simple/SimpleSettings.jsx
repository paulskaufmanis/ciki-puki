import React from "react";

const MAX_OPTIONS = 20; // matches MAX_DETAILS in backend/index.js

export default function SimpleSettings({ params, onChange }) {
    const options = params.detailOptions || [];

    const setOption = (i, text) => onChange({ ...params, detailOptions: options.map((o, j) => (j === i ? text : o)) });
    const addOption = () => options.length < MAX_OPTIONS && onChange({ ...params, detailOptions: [...options, ""] });
    const removeOption = (i) => onChange({ ...params, detailOptions: options.filter((_, j) => j !== i) });

    return (
        <>
            <label className="switch">
                <input type="checkbox" checked={!!params.requireDetails}
                    onChange={(e) => onChange({ ...params, requireDetails: e.target.checked })} />
                <span>Jānorāda paveiktais darbs</span>
            </label>

            {params.requireDetails && (
                <fieldset className="work-detail-options">
                    <legend>Izvēles varianti (atstāj tukšu, lai bērns raksta brīvu tekstu)</legend>
                    {options.map((o, i) => (
                        <div key={i} className="work-detail-row">
                            <input value={o} maxLength={100} placeholder="piem. Matemātika"
                                onChange={(e) => setOption(i, e.target.value)} />
                            <button type="button" className="btn danger" aria-label="Noņemt variantu" onClick={() => removeOption(i)}>×</button>
                        </div>
                    ))}
                    {options.length < MAX_OPTIONS &&
                        <button type="button" className="btn add" aria-label="Pievienot vēl vienu variantu" onClick={addOption}>+</button>}
                </fieldset>
            )}
        </>
    );
}
