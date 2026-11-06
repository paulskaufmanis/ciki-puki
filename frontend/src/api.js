async function call(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Pieprasījums neizdevās (${res.status})`);
  return data;
}

const pinHeader = (pin) => ({ "x-parent-pin": pin || "" });

const send = (method, path, body, headers = {}) =>
  call(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  });

// All task endpoints that change data respond with the fresh { today, tasks } list
export const getTasks = () => call("/api/tasks");

// { coins, fedToday }; feedPet also returns { awarded } (0 if today's reward was already paid)
export const getPet = () => call("/api/pet");

export const feedPet = () => send("POST", "/api/pet/feed", {});

// Parent sets the exact coin balance
export const setPetCoins = (coins, pin) => send("PUT", "/api/pet/coins", { coins }, pinHeader(pin));

export const getPinStatus = () => call("/api/pin");

export const verifyPin = (pin) => send("POST", "/api/pin/verify", { pin });

export const setPin = (newPin, currentPin) => send("POST", "/api/pin", { newPin, currentPin });

export const createTask = (task, pin) => send("POST", "/api/tasks", task, pinHeader(pin));

export const updateTask = (id, patch, pin) => send("PUT", `/api/tasks/${id}`, patch, pinHeader(pin));

export const deleteTask = (id, pin) => call(`/api/tasks/${id}`, { method: "DELETE", headers: pinHeader(pin) });

// Tasks the child unticked today (see Child.jsx) skip the high-five when ticked again. A parent
// changing task state starts that task fresh, so their action clears the list.
export const UNTICKED_KEY = "ciki-unticked";
const clearUnticked = () => { try { localStorage.removeItem(UNTICKED_KEY); } catch { /* storage unavailable */ } };

export const resetTaskToday = (id, pin) => { clearUnticked(); return send("POST", `/api/tasks/${id}/reset`, {}, pinHeader(pin)); };

export const checkTask = (id, done, details) => send("POST", `/api/tasks/${id}/check`, { done, details });

// Parent dashboard variant: sends the PIN so the backend allows checking/unchecking any task by hand
export const checkTaskAsParent = (id, done, pin) => { clearUnticked(); return send("POST", `/api/tasks/${id}/check`, { done }, pinHeader(pin)); };

export const saveProgress = (id, seconds) =>
  fetch(`/api/tasks/${id}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seconds }),
    keepalive: true, // lets the save finish while the page is closing
  }).catch(() => {});

export const completeTask = (id, secondsPracticed) => send("POST", `/api/tasks/${id}/complete`, { secondsPracticed });

export const uploadRecording = async (id, blob) => {
  const res = await fetch(`/api/tasks/${id}/recording`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Ieraksta augšupielāde neizdevās (${res.status})`);
  }
};

// Extra practice round after the task is done: resolves with { bonusId, awarded, coins, fedToday }
export const completeBonus = (id, secondsPracticed) => send("POST", `/api/tasks/${id}/bonus`, { secondsPracticed });

export const uploadBonusRecording = async (bonusId, blob) => {
  const res = await fetch(`/api/bonus/${bonusId}/recording`, {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Ieraksta augšupielāde neizdevās (${res.status})`);
  }
};

export const submitPhoto = (id, photo, takenAt, takenMs) => {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  if (takenAt) form.append("takenAt", takenAt);
  form.append("takenMs", String(takenMs || 0));
  return call(`/api/tasks/${id}/photo`, { method: "POST", body: form });
};

export const fetchPhotoUrl = async (taskId, date, pin) => {
  const res = await fetch(`/api/photos/${taskId}/${date}`, { headers: pinHeader(pin) });
  if (!res.ok) throw new Error("Neizdevās ielādēt fotoattēlu");
  return URL.createObjectURL(await res.blob());
};

export const listRecordings = (pin) => call("/api/recordings", { headers: pinHeader(pin) });

export const listPhotos = (pin) => call("/api/photos", { headers: pinHeader(pin) });

export const fetchRecordingUrl = async (taskId, date, pin, bonusId) => {
  const res = await fetch(bonusId ? `/api/bonus/${bonusId}/recording` : `/api/recordings/${taskId}/${date}`, { headers: pinHeader(pin) });
  if (!res.ok) throw new Error("Neizdevās ielādēt ierakstu");
  return URL.createObjectURL(await res.blob());
};
