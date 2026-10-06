var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// backend/index.js
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
}), "json");
function localNow(tz) {
  const d = /* @__PURE__ */ new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return { date, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
}
__name(localNow, "localNow");
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
    `)
  ]);
}
__name(ensureSchema, "ensureSchema");
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
    locked
  };
}
__name(readConfig, "readConfig");
async function postConfig(request, env) {
  if (env.PARENT_PIN && request.headers.get("x-parent-pin") !== env.PARENT_PIN)
    return json({ error: "Wrong PIN" }, 401);
  const b = await request.json().catch(() => ({}));
  const sets = [], vals = [];
  if (typeof b.taskEnabled === "boolean") {
    sets.push("task_enabled = ?");
    vals.push(+b.taskEnabled);
  }
  if (b.durationMinutes !== void 0) {
    const m = Number(b.durationMinutes);
    if (!Number.isInteger(m) || m < 1 || m > 240) return json({ error: "Duration must be 1-240 minutes" }, 400);
    sets.push("duration_minutes = ?");
    vals.push(m);
  }
  if (b.scheduledDays !== void 0) {
    if (!Array.isArray(b.scheduledDays) || !b.scheduledDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      return json({ error: "Invalid days" }, 400);
    sets.push("scheduled_days = ?");
    vals.push(JSON.stringify([...new Set(b.scheduledDays)].sort()));
  }
  if (b.override !== void 0) {
    if (!["none", "lock", "unlock"].includes(b.override)) return json({ error: "Invalid override" }, 400);
    sets.push("override = ?");
    vals.push(b.override);
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    await env.DB.prepare(`UPDATE settings SET ${sets.join(", ")} WHERE id = 1`).bind(...vals).run();
  }
  return json(await readConfig(env));
}
__name(postConfig, "postConfig");
async function postComplete(request, env) {
  const cfg = await readConfig(env);
  if (!cfg.requiredToday) return json({ error: "No task scheduled today" }, 409);
  const b = await request.json().catch(() => ({}));
  const secs = Math.max(0, Math.min(Number(b.secondsPracticed) || 0, 86400));
  if (secs < cfg.durationMinutes * 60 - 5) return json({ error: "Not enough practice time" }, 400);
  await env.DB.prepare(
    "INSERT INTO daily_logs (date, seconds_practiced) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET seconds_practiced = excluded.seconds_practiced"
  ).bind(cfg.today, Math.round(secs)).run();
  return json(await readConfig(env));
}
__name(postComplete, "postComplete");
var index_default = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/config" && request.method === "GET") return json(await readConfig(env));
      if (pathname === "/api/config" && request.method === "POST") return await postConfig(request, env);
      if (pathname === "/api/complete" && request.method === "POST") return await postComplete(request, env);
      if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: "Server error", detail: String(e?.message || e) }, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
