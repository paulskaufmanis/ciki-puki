const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// Practice time is set in minutes. 0 is a special test value meaning 10 seconds.
const DURATION_UNIT_SECONDS = 60;
const ZERO_DURATION_TEST_SECONDS = 10;

const intIn = (v, min, max, message) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, message);
  return n;
};

// Task template types. To add one (homework, chores…) add an entry here and a matching one in frontend/src/templates.
// parseParams validates the template's own settings; targetSeconds is the timed work that completes it (0 = check-off only).
const TEMPLATES = {
  instrument: {
    defaults: { durationMinutes: 10, micLevel: 1 },
    parseParams: (p) => ({
      durationMinutes: intIn(p.durationMinutes, 0, 240, "Duration must be 0-240"),
      micLevel: intIn(p.micLevel, 1, 10, "Mic level must be 1-10"),
    }),
    targetSeconds: (p) => (p.durationMinutes === 0 ? ZERO_DURATION_TEST_SECONDS : p.durationMinutes * DURATION_UNIT_SECONDS),
  },
  // Completed by uploading a photo taken today (see postPhoto)
  photo: {
    defaults: {},
    manualDefault: false,
    parseParams: () => ({}),
    targetSeconds: () => 0,
  },
  // Ticked off from the list
  simple: {
    defaults: {},
    checkOnly: true,
    parseParams: () => ({}),
    targetSeconds: () => 0,
  },
};
const templateOf = (key) => (Object.hasOwn(TEMPLATES, key) ? TEMPLATES[key] : null);

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

// Local date (YYYY-MM-DD) and weekday (0=Sun) in the configured timezone
function localNow(tz) {
  const d = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return { date, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
}

// Keep in sync with backend/schema.sql
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    template       TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    params         TEXT    NOT NULL DEFAULT '{}',
    scheduled_days TEXT    NOT NULL DEFAULT '[1,2,3,4,5]',
    enabled        INTEGER NOT NULL DEFAULT 1,
    allow_manual   INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS task_logs (
    task_id      INTEGER NOT NULL,
    date         TEXT    NOT NULL,
    completed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    seconds      INTEGER NOT NULL DEFAULT 0,
    manual       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS task_progress (
    task_id    INTEGER NOT NULL,
    date       TEXT    NOT NULL,
    seconds    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS task_recordings (
    task_id    INTEGER NOT NULL,
    date       TEXT    NOT NULL,
    mime_type  TEXT    NOT NULL,
    audio      BLOB    NOT NULL DEFAULT x'',
    bytes      INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS task_photos (
    task_id    INTEGER NOT NULL,
    date       TEXT    NOT NULL,
    image      BLOB    NOT NULL,
    bytes      INTEGER NOT NULL,
    taken_on   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS parent_pin (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    salt         TEXT,
    hash         TEXT,
    failed       INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0
  )`,
  "INSERT OR IGNORE INTO parent_pin (id) VALUES (1)",
  "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)",
];

// One-time copy of the old single-task (guitar) data into the multi-task tables. Old tables are left untouched.
async function migrateLegacy(db) {
  if (await db.prepare("SELECT 1 FROM app_meta WHERE key = 'legacy_migrated'").first()) return;
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const has = new Set(results.map((r) => r.name));
  const steps = [];
  const s = has.has("settings") && (await db.prepare("SELECT * FROM settings WHERE id = 1").first());
  if (s) {
    const params = { durationMinutes: s.duration_minutes, micLevel: s.mic_level ?? 1 };
    steps.push(db.prepare("INSERT OR IGNORE INTO tasks (id, template, name, params, scheduled_days, enabled) VALUES (1, 'instrument', 'Guitar Practice', ?, ?, ?)")
      .bind(JSON.stringify(params), s.scheduled_days, s.task_enabled));
    if (has.has("daily_logs"))
      steps.push(db.prepare("INSERT OR IGNORE INTO task_logs (task_id, date, completed_at, seconds) SELECT 1, date, completed_at, seconds_practiced FROM daily_logs"));
    if (has.has("practice_progress"))
      steps.push(db.prepare("INSERT OR IGNORE INTO task_progress (task_id, date, seconds, updated_at) SELECT 1, date, seconds, updated_at FROM practice_progress"));
    if (has.has("recordings"))
      steps.push(db.prepare("INSERT OR IGNORE INTO task_recordings (task_id, date, mime_type, audio, bytes, created_at) SELECT 1, date, mime_type, audio, bytes, created_at FROM recordings"));
  }
  steps.push(db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('legacy_migrated', datetime('now'))"));
  await db.batch(steps);
}

let schemaReady = null;
function ensureSchema(env) {
  schemaReady ||= (async () => {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    await migrateLegacy(env.DB);
  })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

function toView(r, weekday) {
  const tpl = templateOf(r.template);
  const params = JSON.parse(r.params);
  const scheduledDays = JSON.parse(r.scheduled_days);
  return {
    id: r.id,
    template: r.template,
    name: r.name,
    params,
    scheduledDays,
    enabled: !!r.enabled,
    allowManual: !!r.allow_manual || !!tpl?.checkOnly,
    targetSeconds: tpl ? tpl.targetSeconds(params) : 0,
    requiredToday: !!r.enabled && scheduledDays.includes(weekday),
    completedToday: !!r.done_date,
    completedManually: !!r.done_manual,
    progressSeconds: r.progress || 0,
    hasPhotoToday: !!r.photo_bytes,
  };
}

async function loadTasks(env) {
  await ensureSchema(env);
  const { date, weekday } = localNow(env.TIMEZONE || "UTC");
  const { results } = await env.DB.prepare(`
    SELECT t.*, l.date AS done_date, l.manual AS done_manual, p.seconds AS progress, ph.bytes AS photo_bytes
    FROM tasks t
    LEFT JOIN task_logs l ON l.task_id = t.id AND l.date = ?1
    LEFT JOIN task_progress p ON p.task_id = t.id AND p.date = ?1
    LEFT JOIN task_photos ph ON ph.task_id = t.id AND ph.date = ?1
    ORDER BY t.id
  `).bind(date).all();
  return { today: date, tasks: results.map((r) => toView(r, weekday)) };
}

async function loadTask(env, id) {
  const { today, tasks } = await loadTasks(env);
  return { today, task: tasks.find((t) => t.id === id) || fail(404, "Uzdevums nav atrasts") };
}

const readBody = (request) => request.json().catch(() => ({}));

function cleanName(v) {
  const name = String(v ?? "").trim();
  if (!name || name.length > 60) fail(400, "Nosaukumam jābūt 1-60 rakstzīmēm");
  return name;
}

function parseDays(v) {
  if (!Array.isArray(v) || !v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) fail(400, "Nederīgas dienas");
  return JSON.stringify([...new Set(v)].sort());
}

async function createTask(request, env) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  const b = await readBody(request);
  const tpl = templateOf(b.template) || fail(400, "Nezināms uzdevuma tips");
  const params = tpl.parseParams({ ...tpl.defaults, ...b.params });
  const allowManual = typeof b.allowManual === "boolean" ? b.allowManual : tpl.manualDefault !== false;
  await env.DB.prepare("INSERT INTO tasks (template, name, params, scheduled_days, enabled, allow_manual) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(b.template, cleanName(b.name), JSON.stringify(params), parseDays(b.scheduledDays ?? DEFAULT_DAYS),
      b.enabled === false ? 0 : 1, +allowManual)
    .run();
  return json(await loadTasks(env));
}

async function updateTask(request, env, id) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  const { task } = await loadTask(env, id);
  const b = await readBody(request);
  const sets = [], vals = [];

  if (b.name !== undefined) { sets.push("name = ?"); vals.push(cleanName(b.name)); }
  if (typeof b.enabled === "boolean") { sets.push("enabled = ?"); vals.push(+b.enabled); }
  if (typeof b.allowManual === "boolean") { sets.push("allow_manual = ?"); vals.push(+b.allowManual); }
  if (b.scheduledDays !== undefined) { sets.push("scheduled_days = ?"); vals.push(parseDays(b.scheduledDays)); }
  if (b.params !== undefined) {
    const tpl = templateOf(task.template) || fail(400, "Nezināms uzdevuma tips");
    sets.push("params = ?"); vals.push(JSON.stringify(tpl.parseParams({ ...task.params, ...b.params })));
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    await env.DB.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
  }
  return json(await loadTasks(env));
}

async function deleteTask(request, env, id) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  await loadTask(env, id);
  await env.DB.batch([
    ...["task_logs", "task_progress", "task_recordings", "task_photos"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE task_id = ?`).bind(id)),
    env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id),
  ]);
  for (let cursor; env.AUDIO;) {
    const page = await env.AUDIO.list({ prefix: `${id}/`, cursor });
    if (page.objects.length) await env.AUDIO.delete(page.objects.map((o) => o.key));
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return json(await loadTasks(env));
}

async function postProgress(request, env, id) {
  const { today, task } = await loadTask(env, id);
  if (!task.requiredToday || task.completedToday || !task.targetSeconds) return json({ ok: true });
  const b = await readBody(request);
  const secs = Math.round(Math.max(0, Math.min(Number(b.seconds) || 0, task.targetSeconds)));
  // MAX() so a delayed, older save can never move progress backwards
  await env.DB.prepare(
    "INSERT INTO task_progress (task_id, date, seconds) VALUES (?, ?, ?) ON CONFLICT(task_id, date) DO UPDATE SET seconds = MAX(seconds, excluded.seconds), updated_at = datetime('now')"
  ).bind(id, today, secs).run();
  return json({ ok: true });
}

async function postComplete(request, env, id) {
  const { today, task } = await loadTask(env, id);
  if (!task.requiredToday) fail(409, "Šis uzdevums šodien nav ieplānots");
  const b = await readBody(request);
  const secs = Math.max(0, Math.min(Number(b.secondsPracticed) || 0, 86400));
  // Light sanity check: client must claim at least the required time
  if (secs < task.targetSeconds - 5) fail(400, "Nepietiek prakses laika");
  await env.DB.prepare(
    "INSERT INTO task_logs (task_id, date, seconds, manual) VALUES (?, ?, ?, 0) ON CONFLICT(task_id, date) DO UPDATE SET seconds = excluded.seconds, manual = 0"
  ).bind(id, today, Math.round(secs)).run();
  return json(await loadTasks(env));
}

// Ticks a task off by hand (or unticks one ticked by mistake). Child requests (no PIN header) are
// still limited to allowManual/completedManually; a verified parent PIN can check/uncheck any task.
async function postCheck(request, env, id) {
  const { today, task } = await loadTask(env, id);
  if (!task.requiredToday) fail(409, "Šis uzdevums šodien nav ieplānots");
  const { done } = await readBody(request);
  const isParent = request.headers.get("x-parent-pin") !== null;
  if (isParent) {
    const denied = await requirePin(request, env);
    if (denied) return denied;
  }
  if (done) {
    if (!isParent && !task.allowManual) fail(403, "Šo uzdevumu nevar atzīmēt ar roku");
    await env.DB.prepare("INSERT OR IGNORE INTO task_logs (task_id, date, seconds, manual) VALUES (?, ?, ?, 1)")
      .bind(id, today, task.progressSeconds).run();
  } else if (task.completedToday) {
    if (!isParent && !task.completedManually) fail(409, "Var noņemt atzīmi tikai uzdevumiem, kas atzīmēti ar roku");
    // Unchecking clears today's timed progress too, so the child starts the task over from the beginning
    await env.DB.batch([
      env.DB.prepare("DELETE FROM task_logs WHERE task_id = ? AND date = ?").bind(id, today),
      env.DB.prepare("DELETE FROM task_progress WHERE task_id = ? AND date = ?").bind(id, today),
    ]);
  }
  return json(await loadTasks(env));
}

// Coin balance and the date the pet was last fed live in app_meta ('coins', 'fed_date')
const DAILY_REWARD_COINS = 100;

async function loadPet(env) {
  await ensureSchema(env);
  const { date } = localNow(env.TIMEZONE || "UTC");
  const { results } = await env.DB.prepare("SELECT key, value FROM app_meta WHERE key IN ('coins', 'fed_date')").all();
  const meta = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { coins: Number(meta.coins) || 0, fedToday: meta.fed_date === date };
}

// Feeding is only allowed once every task scheduled today is done, and pays out once per day
async function postFeedPet(env) {
  const { today, tasks } = await loadTasks(env);
  const required = tasks.filter((t) => t.requiredToday);
  if (!required.length || required.some((t) => !t.completedToday)) fail(409, "Vēl nav paveikti visi šodienas uzdevumi");
  const res = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO app_meta (key, value) SELECT 'coins', ?1 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'fed_date' AND value = ?2) " +
      "ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + CAST(excluded.value AS INTEGER)"
    ).bind(String(DAILY_REWARD_COINS), today),
    env.DB.prepare("INSERT INTO app_meta (key, value) VALUES ('fed_date', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(today),
  ]);
  const awarded = res[0].meta.changes > 0 ? DAILY_REWARD_COINS : 0;
  return json({ ...(await loadPet(env)), awarded });
}

const MAX_RECORDING_BYTES = 15 * 1024 * 1024; // cap one session's audio at 15 MB
const MAX_D1_AUDIO_BYTES = 1_900_000; // without R2, audio goes in a D1 row (2 MB cap)

const MAX_PIN_FAILS = 5, PIN_LOCK_MS = 5 * 60 * 1000;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pinRow(env) {
  await ensureSchema(env);
  return env.DB.prepare("SELECT * FROM parent_pin WHERE id = 1").first();
}

// DB-stored PIN wins; falls back to the PARENT_PIN secret if no PIN was set in the app
const isPinSet = (row, env) => !!row.hash || !!env.PARENT_PIN;

// Returns null if the PIN is correct, otherwise an error Response
async function checkPin(pin, env) {
  const row = await pinRow(env);
  if (!isPinSet(row, env)) return json({ error: "Vecāka PIN vēl nav iestatīts" }, 403);
  if (row.locked_until > Date.now())
    return json({ error: "Pārāk daudz nepareizu mēģinājumu. Mēģini vēlreiz pēc dažām minūtēm." }, 429);

  pin = String(pin || "");
  const ok = row.hash ? (await sha256Hex(row.salt + pin)) === row.hash : pin === env.PARENT_PIN;
  if (ok) {
    if (row.failed) await env.DB.prepare("UPDATE parent_pin SET failed = 0, locked_until = 0 WHERE id = 1").run();
    return null;
  }
  const failed = row.failed + 1;
  const lock = failed >= MAX_PIN_FAILS;
  await env.DB.prepare("UPDATE parent_pin SET failed = ?, locked_until = ? WHERE id = 1")
    .bind(lock ? 0 : failed, lock ? Date.now() + PIN_LOCK_MS : 0).run();
  return json({ error: "Nepareizs PIN" }, 401);
}

const requirePin = (request, env) => checkPin(request.headers.get("x-parent-pin"), env);

async function getPinStatus(env) {
  return json({ pinSet: isPinSet(await pinRow(env), env) });
}

async function postPinVerify(request, env) {
  const b = await request.json().catch(() => ({}));
  return (await checkPin(b.pin, env)) || json({ ok: true });
}

async function postPinSet(request, env) {
  const b = await request.json().catch(() => ({}));
  const row = await pinRow(env);
  if (isPinSet(row, env)) {
    const denied = await checkPin(b.currentPin, env);
    if (denied) return denied;
  }
  const newPin = String(b.newPin || "");
  if (!/^[0-9]{4,8}$/.test(newPin)) return json({ error: "PIN jābūt 4-8 cipariem" }, 400);
  const salt = crypto.randomUUID();
  await env.DB.prepare("UPDATE parent_pin SET salt = ?, hash = ?, failed = 0, locked_until = 0 WHERE id = 1")
    .bind(salt, await sha256Hex(salt + newPin)).run();
  return json({ ok: true });
}

async function postReset(request, env, id) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  const { today } = await loadTask(env, id);
  await env.DB.batch(["task_logs", "task_progress", "task_recordings", "task_photos"].map((t) =>
    env.DB.prepare(`DELETE FROM ${t} WHERE task_id = ? AND date = ?`).bind(id, today)));
  await env.AUDIO?.delete(audioKey(id, today));
  return json(await loadTasks(env));
}

const audioKey = (taskId, date) => `${taskId}/${date}`;

async function postRecording(request, env, id) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_RECORDING_BYTES) return json({ error: "Ieraksts ir pārāk liels" }, 413);
  const { today } = await loadTask(env, id);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_RECORDING_BYTES) return json({ error: "Ieraksts ir pārāk liels" }, 413);
  const type = request.headers.get("content-type") || "";
  // Only audio types: this value is served back as Content-Type
  const mimeType = /^audio\/[\w.+-]+(;\s*codecs=[\w.,"-]+)?$/i.test(type) ? type : "audio/webm";
  if (env.AUDIO) await env.AUDIO.put(audioKey(id, today), buf, { httpMetadata: { contentType: mimeType } });
  else if (buf.byteLength > MAX_D1_AUDIO_BYTES) return json({ error: "Ieraksts ir pārāk garš, lai to saglabātu" }, 413);
  await env.DB.prepare(
    "INSERT INTO task_recordings (task_id, date, mime_type, audio, bytes) VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id, date) DO UPDATE SET mime_type = excluded.mime_type, audio = excluded.audio, bytes = excluded.bytes, created_at = datetime('now')"
  ).bind(id, today, mimeType, env.AUDIO ? new Uint8Array(0) : buf, buf.byteLength).run();
  return json({ ok: true, date: today });
}

async function listRecordings(request, env) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  await ensureSchema(env);
  const { results } = await env.DB.prepare(`
    SELECT r.task_id AS taskId, t.name AS taskName, r.date, r.mime_type AS mimeType, r.bytes, r.created_at AS createdAt
    FROM task_recordings r JOIN tasks t ON t.id = r.task_id
    ORDER BY r.date DESC, t.name
  `).all();
  return json(results);
}

// Tasks completed with a photo, newest first
async function listPhotos(request, env) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  await ensureSchema(env);
  const { results } = await env.DB.prepare(`
    SELECT ph.task_id AS taskId, t.name AS taskName, ph.date
    FROM task_photos ph JOIN tasks t ON t.id = ph.task_id
    ORDER BY ph.date DESC, t.name
  `).all();
  return json(results);
}

async function getRecording(request, env, taskId, date) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT mime_type AS mimeType, length(audio) AS legacyBytes FROM task_recordings WHERE task_id = ? AND date = ?")
    .bind(taskId, date).first();
  if (!row) return json({ error: "Nav atrasts" }, 404);
  const headers = { "content-type": row.mimeType, "cache-control": "no-store", "x-content-type-options": "nosniff" };
  const obj = await env.AUDIO?.get(audioKey(taskId, date));
  if (obj) return new Response(obj.body, { headers });
  if (!row.legacyBytes) return json({ error: "Nav atrasts" }, 404);
  const legacy = await env.DB.prepare("SELECT audio FROM task_recordings WHERE task_id = ? AND date = ?").bind(taskId, date).first();
  // D1 may return BLOB columns as an array-like object rather than a real ArrayBuffer
  return new Response(new Uint8Array(legacy.audio), { headers });
}

const MAX_PHOTO_BYTES = 1_500_000; // D1 caps a row at 2 MB; the app shrinks photos to ~0.3 MB before upload
const NOT_TODAY = "Hmm, tā tas nesanāks. Lūdzu, izpildi uzdevumu un nofotografē!";

// Day the photo was taken: the camera's EXIF time (already local) if sent, otherwise the file timestamp.
// These come from the child's device, so this is a friendly check rather than tamper-proof.
function photoDate(form, tz) {
  const exif = String(form.get("takenAt") || "").match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
  if (exif) return `${exif[1]}-${exif[2]}-${exif[3]}`;
  const ms = Number(form.get("takenMs"));
  return Number.isFinite(ms) && ms > 0 ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms)) : null;
}

async function postPhoto(request, env, id) {
  if (Number(request.headers.get("content-length") || 0) > MAX_PHOTO_BYTES + 64 * 1024) fail(413, "Fotoattēls ir pārāk liels");
  const { today, task } = await loadTask(env, id);
  if (task.template !== "photo") fail(400, "Šis uzdevums nepieņem fotoattēlus");
  if (!task.requiredToday) fail(409, "Šis uzdevums šodien nav ieplānots");
  const form = await request.formData().catch(() => fail(400, "Nederīga augšupielāde"));
  const photo = form.get("photo");
  if (!photo || typeof photo === "string") fail(400, "Nav saņemts fotoattēls");
  const buf = new Uint8Array(await photo.arrayBuffer());
  if (buf.byteLength > MAX_PHOTO_BYTES) fail(413, "Fotoattēls ir pārāk liels");
  // Only JPEG is stored, since it's served back as image/jpeg
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) fail(400, "Fotoattēlam jābūt JPEG formātā");
  const takenOn = photoDate(form, env.TIMEZONE || "UTC");
  if (takenOn !== today) fail(422, NOT_TODAY);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO task_photos (task_id, date, image, bytes, taken_on) VALUES (?, ?, ?, ?, ?) ON CONFLICT(task_id, date) DO UPDATE SET image = excluded.image, bytes = excluded.bytes, taken_on = excluded.taken_on, created_at = datetime('now')"
    ).bind(id, today, buf, buf.byteLength, takenOn),
    env.DB.prepare(
      "INSERT INTO task_logs (task_id, date, seconds, manual) VALUES (?, ?, 0, 0) ON CONFLICT(task_id, date) DO UPDATE SET manual = 0"
    ).bind(id, today),
  ]);
  return json(await loadTasks(env));
}

async function getPhoto(request, env, taskId, date) {
  const denied = await requirePin(request, env);
  if (denied) return denied;
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT image FROM task_photos WHERE task_id = ? AND date = ?").bind(taskId, date).first();
  if (!row) return json({ error: "Nav atrasts" }, 404);
  return new Response(new Uint8Array(row.image), {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

const TASK_ACTIONS = { progress: postProgress, complete: postComplete, check: postCheck, reset: postReset, recording: postRecording, photo: postPhoto };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;
    const taskMatch = pathname.match(/^\/api\/tasks\/([0-9]+)(?:\/([a-z]+))?$/);
    const recordingMatch = pathname.match(/^\/api\/recordings\/([0-9]+)\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    const photoMatch = pathname.match(/^\/api\/photos\/([0-9]+)\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    try {
      if (pathname === "/api/tasks" && method === "GET") return json(await loadTasks(env));
      if (pathname === "/api/tasks" && method === "POST") return await createTask(request, env);
      if (taskMatch) {
        const id = Number(taskMatch[1]), action = taskMatch[2];
        if (!action && method === "PUT") return await updateTask(request, env, id);
        if (!action && method === "DELETE") return await deleteTask(request, env, id);
        if (action && method === "POST" && Object.hasOwn(TASK_ACTIONS, action)) return await TASK_ACTIONS[action](request, env, id);
      }
      if (pathname === "/api/pet" && method === "GET") return json(await loadPet(env));
      if (pathname === "/api/pet/feed" && method === "POST") return await postFeedPet(env);
      if (pathname === "/api/pin" && method === "GET") return await getPinStatus(env);
      if (pathname === "/api/pin" && method === "POST") return await postPinSet(request, env);
      if (pathname === "/api/pin/verify" && method === "POST") return await postPinVerify(request, env);
      if (pathname === "/api/recordings" && method === "GET") return await listRecordings(request, env);
      if (pathname === "/api/photos" && method === "GET") return await listPhotos(request, env);
      if (recordingMatch && method === "GET") return await getRecording(request, env, Number(recordingMatch[1]), recordingMatch[2]);
      if (photoMatch && method === "GET") return await getPhoto(request, env, Number(photoMatch[1]), photoMatch[2]);
      if (pathname.startsWith("/api/")) return json({ error: "Nav atrasts" }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Servera kļūda", detail: String(e?.message || e) }, 500);
    }
  },
};
