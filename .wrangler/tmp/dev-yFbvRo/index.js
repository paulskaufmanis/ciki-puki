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
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS recordings (
        date       TEXT PRIMARY KEY,
        mime_type  TEXT NOT NULL,
        audio      BLOB NOT NULL,
        bytes      INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  if (!hasParentPin(request, env))
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
var MAX_RECORDING_BYTES = 15 * 1024 * 1024;
function hasParentPin(request, env) {
  return !env.PARENT_PIN || request.headers.get("x-parent-pin") === env.PARENT_PIN;
}
__name(hasParentPin, "hasParentPin");
async function postReset(request, env) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  const cfg = await readConfig(env);
  await env.DB.prepare("DELETE FROM daily_logs WHERE date = ?").bind(cfg.today).run();
  await env.DB.prepare("DELETE FROM recordings WHERE date = ?").bind(cfg.today).run();
  return json(await readConfig(env));
}
__name(postReset, "postReset");
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
__name(postRecording, "postRecording");
async function listRecordings(request, env) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT date, mime_type AS mimeType, bytes, created_at AS createdAt FROM recordings ORDER BY date DESC"
  ).all();
  return json(results);
}
__name(listRecordings, "listRecordings");
async function getRecording(request, env, date) {
  if (!hasParentPin(request, env)) return json({ error: "Wrong PIN" }, 401);
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT mime_type AS mimeType, audio FROM recordings WHERE date = ?").bind(date).first();
  if (!row) return json({ error: "Not found" }, 404);
  return new Response(new Uint8Array(row.audio), { headers: { "content-type": row.mimeType, "cache-control": "no-store" } });
}
__name(getRecording, "getRecording");
var backend_default = {
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
  }
};

// ../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-TlWrI9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = backend_default;

// ../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-TlWrI9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
