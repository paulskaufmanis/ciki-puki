const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Local date (YYYY-MM-DD) and weekday (0=Sun) in the configured timezone
function localNow(tz) {
  const d = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return { date, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
}

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        id               INTEGER PRIMARY KEY CHECK (id = 1),
        task_enabled     INTEGER NOT NULL DEFAULT 1,
        duration_minutes INTEGER NOT NULL DEFAULT 10,
        scheduled_days   TEXT    NOT NULL DEFAULT '[1,2,3,4,5]',
        override         TEXT    NOT NULL DEFAULT 'none'
                         CHECK (override IN ('none','lock','unlock')),
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `),
    env.DB.prepare("INSERT OR IGNORE INTO settings (id) VALUES (1)"),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        date              TEXT PRIMARY KEY,
        completed_at      TEXT NOT NULL DEFAULT (datetime('now')),
        seconds_practiced INTEGER NOT NULL DEFAULT 0
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS recordings (
        date       TEXT PRIMARY KEY,
        mime_type  TEXT NOT NULL,
        audio      BLOB NOT NULL,
        bytes      INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
  ]);
}

async function readConfig(env) {
  await ensureSchema(env);
  const s = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  const { date, weekday } = localNow(env.TIMEZONE || "UTC");
  const days = JSON.parse(s.scheduled_days);
  const log = await env.DB.prepare("SELECT * FROM daily_logs WHERE date = ?").bind(date).first();

  const requiredToday = !!s.task_enabled && days.includes(weekday);
  const completedToday = !!log;
  let locked = requiredToday && !completedToday;
  if (s.override === "lock") locked = true;
  if (s.override === "unlock") locked = false;

  return {
    taskEnabled: !!s.task_enabled,
    durationMinutes: s.duration_minutes,
    scheduledDays: days,
    override: s.override,
    today: date,
    requiredToday,
    completedToday,
    locked,
  };
}

async function postConfig(request, env) {
  if (!hasParentPin(request, env))
    return json({ error: "Wrong PIN" }, 401);

  const b = await request.json().catch(() => ({}));
  const sets = [], vals = [];

  if (typeof b.taskEnabled === "boolean") { sets.push("task_enabled = ?"); vals.push(+b.taskEnabled); }
  if (b.durationMinutes !== undefined) {
    const m = Number(b.durationMinutes);
    if (!Number.isInteger(m) || m < 1 || m > 240) return json({ error: "Duration must be 1-240 minutes" }, 400);
    sets.push("duration_minutes = ?"); vals.push(m);
  }
  if (b.scheduledDays !== undefined) {
    if (!Array.isArray(b.scheduledDays) || !b.scheduledDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      return json({ error: "Invalid days" }, 400);
    sets.push("scheduled_days = ?"); vals.push(JSON.stringify([...new Set(b.scheduledDays)].sort()));
  }
  if (b.override !== undefined) {
    if (!["none", "lock", "unlock"].includes(b.override)) return json({ error: "Invalid override" }, 400);
    sets.push("override = ?"); vals.push(b.override);
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    await env.DB.prepare(`UPDATE settings SET ${sets.join(", ")} WHERE id = 1`).bind(...vals).run();
  }
  return json(await readConfig(env));
}

async function postComplete(request, env) {
  const cfg = await readConfig(env);
  if (!cfg.requiredToday) return json({ error: "No task scheduled today" }, 409);
  const b = await request.json().catch(() => ({}));
  const secs = Math.max(0, Math.min(Number(b.secondsPracticed) || 0, 86400));
  // Light sanity check: client must claim at least the required time
  if (secs < cfg.durationMinutes * 60 - 5) return json({ error: "Not enough practice time" }, 400);
  await env.DB.prepare(
    "INSERT INTO daily_logs (date, seconds_practiced) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET seconds_practiced = excluded.seconds_practiced"
  ).bind(cfg.today, Math.round(secs)).run();
  return json(await readConfig(env));
}

const MAX_RECORDING_BYTES = 15 * 1024 * 1024; // cap one session's audio at 15 MB

function hasParentPin(request, env) {
  return !env.PARENT_PIN || request.headers.get("x-parent-pin") === env.PARENT_PIN;
}

async function postReset(request, env) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  const cfg = await readConfig(env);
  await env.DB.prepare("DELETE FROM daily_logs WHERE date = ?").bind(cfg.today).run();
  await env.DB.prepare("DELETE FROM recordings WHERE date = ?").bind(cfg.today).run();
  return json(await readConfig(env));
}

async function postRecording(request, env) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_RECORDING_BYTES) return json({ error: "Recording too large" }, 413);
  const cfg = await readConfig(env);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_RECORDING_BYTES) return json({ error: "Recording too large" }, 413);
  const mimeType = request.headers.get("content-type") || "audio/webm";
  await env.DB.prepare(
    "INSERT INTO recordings (date, mime_type, audio, bytes) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET mime_type = excluded.mime_type, audio = excluded.audio, bytes = excluded.bytes, created_at = datetime('now')"
  ).bind(cfg.today, mimeType, buf, buf.byteLength).run();
  return json({ ok: true, date: cfg.today });
}

async function listRecordings(request, env) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT date, mime_type AS mimeType, bytes, created_at AS createdAt FROM recordings ORDER BY date DESC"
  ).all();
  return json(results);
}

async function getRecording(request, env, date) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT mime_type AS mimeType, audio FROM recordings WHERE date = ?").bind(date).first();
  if (!row) return json({ error: "Not found" }, 404);
  // D1 may return BLOB columns as an array-like object rather than a real ArrayBuffer
  return new Response(new Uint8Array(row.audio), { headers: { "content-type": row.mimeType, "cache-control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const recordingMatch = pathname.match(/^\/api\/recordings\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    try {
      if (pathname === "/api/config" && request.method === "GET") return json(await readConfig(env));
      if (pathname === "/api/config" && request.method === "POST") return await postConfig(request, env);
      if (pathname === "/api/complete" && request.method === "POST") return await postComplete(request, env);
      if (pathname === "/api/reset" && request.method === "POST") return await postReset(request, env);
      if (pathname === "/api/recordings" && request.method === "POST") return await postRecording(request, env);
      if (pathname === "/api/recordings" && request.method === "GET") return await listRecordings(request, env);
      if (recordingMatch && request.method === "GET") return await getRecording(request, env, recordingMatch[1]);
      if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: "Server error", detail: String(e?.message || e) }, 500);
    }
  },
};
