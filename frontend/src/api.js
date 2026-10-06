async function call(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const getConfig = () => call("/api/config");

export const saveConfig = (patch, pin) =>
  call("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", "x-parent-pin": pin || "" },
    body: JSON.stringify(patch),
  });

export const completeTask = (secondsPracticed) =>
  call("/api/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secondsPracticed }),
  });

export const resetToday = (pin) =>
  call("/api/reset", {
    method: "POST",
    headers: { "x-parent-pin": pin || "" },
  });

export const uploadRecording = async (blob) => {
  const res = await fetch("/api/recordings", {
    method: "POST",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error("Recording upload failed");
};

export const listRecordings = (pin) => call("/api/recordings", { headers: { "x-parent-pin": pin || "" } });

export const fetchRecordingUrl = async (date, pin) => {
  const res = await fetch(`/api/recordings/${date}`, { headers: { "x-parent-pin": pin || "" } });
  if (!res.ok) throw new Error("Could not load recording");
  return URL.createObjectURL(await res.blob());
};
