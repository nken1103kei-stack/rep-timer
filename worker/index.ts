import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SESSION_COOKIE, SESSION_TTL_SEC, signSession, verifySession } from "./session";

type Env = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  SESSION_SECRET: string;
};

type Vars = { userId: string };

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const MAX_DATA_BYTES = 512 * 1024;

type AppEnv = { Bindings: Env; Variables: Vars };

const app = new Hono<AppEnv>().basePath("/api");

const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const userId = token ? await verifySession(token, c.env.SESSION_SECRET) : null;
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});

app.get("/config", (c) => c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID || null }));

app.post("/auth/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "auth_not_configured" }, 503);
  const body = await c.req.json<{ credential?: string }>().catch(() => ({}) as { credential?: string });
  if (!body.credential) return c.json({ error: "missing_credential" }, 400);

  let payload;
  try {
    ({ payload } = await jwtVerify(body.credential, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: c.env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    return c.json({ error: "invalid_credential" }, 401);
  }
  if (!payload.sub || payload.email_verified !== true) return c.json({ error: "invalid_credential" }, 401);

  const user = {
    id: payload.sub,
    email: String(payload.email ?? ""),
    name: payload.name ? String(payload.name) : null,
    picture: payload.picture ? String(payload.picture) : null,
  };
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET email = ?2, name = ?3, picture = ?4`,
  )
    .bind(user.id, user.email, user.name, user.picture, Date.now())
    .run();

  setCookie(c, SESSION_COOKIE, await signSession(user.id, c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return c.json({ user });
});

app.post("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Everything below requires a session.
app.use("/me", requireUser);
app.use("/data", requireUser);

app.get("/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email, name, picture FROM users WHERE id = ?1")
    .bind(c.get("userId"))
    .first();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user });
});

app.get("/data", async (c) => {
  const row = await c.env.DB.prepare("SELECT data, updated_at FROM user_data WHERE user_id = ?1")
    .bind(c.get("userId"))
    .first<{ data: string; updated_at: number }>();
  if (!row) return c.json({ data: null, updatedAt: 0 });
  return c.json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
});

app.put("/data", async (c) => {
  const raw = await c.req.text();
  if (raw.length > MAX_DATA_BYTES) return c.json({ error: "too_large" }, 413);
  let body: { data?: unknown; updatedAt?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (typeof body.data !== "object" || body.data === null || typeof body.updatedAt !== "number") {
    return c.json({ error: "invalid_body" }, 400);
  }
  // Last write wins: an older client snapshot never overwrites newer server data.
  const result = await c.env.DB.prepare(
    `INSERT INTO user_data (user_id, data, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3 WHERE excluded.updated_at > user_data.updated_at`,
  )
    .bind(c.get("userId"), JSON.stringify(body.data), body.updatedAt)
    .run();
  return c.json({ ok: true, applied: result.meta.changes > 0 });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
