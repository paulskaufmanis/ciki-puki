import React, { useEffect, useRef } from "react";

const MAX_ITEMS = 20; // matches MAX_DETAILS in backend/index.js

// Child's list of what they completed: one field per item, "+" adds another.
// When the task has selectable options, each row is a dropdown offering only the options not already picked elsewhere.
export default function WorkDetailsInput({ taskName, value, onChange, disabled, options }) {
    const lastRef = useRef(null);
    const count = useRef(value.length);
    const hasOptions = !!options?.length;

    useEffect(() => {
        if (value.length > count.current) lastRef.current?.focus();
        count.current = value.length;
    }, [value.length]);

    const set = (i, text) => onChange(value.map((v, j) => (j === i ? text : v)));
    const canAdd = hasOptions ? value.length < options.length : value.length < MAX_ITEMS;
    const add = () => canAdd && onChange([...value, ""]);

    return (
        <div className="work-details">
            {value.map((v, i) => {
                const last = i === value.length - 1;
                const availableForRow = hasOptions && options.filter((o) => o === v || !value.includes(o));
                return (
                    <div key={i} className="work-detail-row">
                        {hasOptions ? (
                            <select ref={last ? lastRef : null} value={v} disabled={disabled}
                                aria-label={`${taskName}: paveiktais ${i + 1}`}
                                onChange={(e) => set(i, e.target.value)}>
                                <option value="">Izvēlies…</option>
                                {availableForRow.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                        ) : (
                            <input ref={last ? lastRef : null} value={v} maxLength={100} disabled={disabled}
                                placeholder="Ko tu paveici?" aria-label={`${taskName}: paveiktais ${i + 1}`}
                                onChange={(e) => set(i, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && last && v.trim()) add(); }} />
                        )}
                        {last && canAdd &&
                            <button type="button" className="btn add" disabled={disabled} aria-label="Pievienot vēl vienu" onClick={add}>+</button>}
                    </div>
                );
            })}
        </div>
    );
}
