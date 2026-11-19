import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SESSION_COOKIE, SESSION_TTL_SEC, signSession, verifySession } from "./session";
import { mergeSnapshots } from "../src/lib/merge";
import { SHEET_URL, sheetDiff, toSheetRow, type SheetRow } from "../src/lib/sheetRows";
import type { AppData } from "../src/lib/types";
import { applyEvent, customerFor, isOwner, ownerList, planFor, signStripePayload, stripe, verifyStripeSignature, type BillingEnv } from "./billing";

type Env = BillingEnv & {
  GOOGLE_CLIENT_ID: string;
  SESSION_SECRET: string;
  /** Shown on the upgrade sheet, e.g. "月額380円". The real amount lives on the Stripe price. */
  PRO_PRICE_LABEL?: string;
  ADSENSE_CLIENT?: string;
  ADSENSE_SLOT?: string;
  /** Local testing only (.dev.vars): enables /api/dev/* on localhost. Never set in production. */
  DEV_MODE?: string;
  /** Secret, comma-separated: these Google accounts (the creators) always get Pro for free. */
  OWNER_EMAILS?: string;
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

const billingReady = (env: Env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET);

const devMode = (c: { env: Env; req: { url: string } }) =>
  c.env.DEV_MODE === "1" && ["localhost", "127.0.0.1"].includes(new URL(c.req.url).hostname);

app.get("/config", (c) =>
  c.json({
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    billing: { enabled: billingReady(c.env) || devMode(c), price: c.env.PRO_PRICE_LABEL ?? "月額380円" },
    ads: c.env.ADSENSE_CLIENT && c.env.ADSENSE_SLOT ? { client: c.env.ADSENSE_CLIENT, slot: c.env.ADSENSE_SLOT } : null,
  }),
);

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

  await startSession(c, user.id);
  return c.json({ user });
});

async function startSession(c: Context<AppEnv>, userId: string) {
  setCookie(c, SESSION_COOKIE, await signSession(userId, c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

app.post("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Everything below requires a session.
app.use("/me", requireUser);
app.use("/data", requireUser);
app.use("/sheets", requireUser);
app.use("/sheets/*", requireUser);
app.use("/billing/checkout", requireUser);
app.use("/billing/portal", requireUser);

app.get("/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email, name, picture FROM users WHERE id = ?1")
    .bind(c.get("userId"))
    .first<{ id: string; email: string }>();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const owner = isOwner(user.email, c.env.OWNER_EMAILS);
  // How many addresses the owner secret holds (never the addresses), so a mistyped or empty secret can be spotted.
  const ownerEntries = ownerList(c.env.OWNER_EMAILS).length;
  return c.json({ user, plan: await planFor(c.env.DB, user.id, owner), ownerEntries });
});

// --- Billing (Stripe Checkout subscription + customer portal) ---

app.post("/billing/checkout", async (c) => {
  const userId = c.get("userId");
  const origin = new URL(c.req.url).origin;
  // Already Pro (paying or an owner): never start a second checkout.
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?1").bind(userId).first<{ email: string }>();
  if ((await planFor(c.env.DB, userId, isOwner(user?.email, c.env.OWNER_EMAILS))).pro) return c.json({ error: "already_pro" }, 409);
  if (!billingReady(c.env)) {
    if (devMode(c)) return c.json({ url: "/api/dev/checkout" });
    return c.json({ error: "billing_not_configured" }, 503);
  }
  const customer = await customerFor(c.env.DB, userId);
  const session = await stripe<{ url: string }>(c.env, "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": c.env.STRIPE_PRICE_ID!,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/?pro=success`,
    cancel_url: `${origin}/?pro=cancel`,
    client_reference_id: userId,
    "subscription_data[metadata][user_id]": userId,
    locale: "ja",
    ...(customer ? { customer } : user?.email ? { customer_email: user.email } : {}),
  });
  return c.json({ url: session.url });
});

app.post("/billing/portal", async (c) => {
  const userId = c.get("userId");
  if (!billingReady(c.env)) {
    if (devMode(c)) return c.json({ url: "/api/dev/cancel" });
    return c.json({ error: "billing_not_configured" }, 503);
  }
  const customer = await customerFor(c.env.DB, userId);
  if (!customer) return c.json({ error: "no_customer" }, 404);
  const portal = await stripe<{ url: string }>(c.env, "/billing_portal/sessions", {
    customer,
    return_url: `${new URL(c.req.url).origin}/?pro=portal`,
  });
  return c.json({ url: portal.url });
});

app.post("/billing/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "billing_not_configured" }, 503);
  const payload = await c.req.text();
  const ok = await verifyStripeSignature(payload, c.req.header("stripe-signature"), secret, Math.floor(Date.now() / 1000));
  if (!ok) return c.json({ error: "invalid_signature" }, 400);
  await applyEvent(c.env.DB, JSON.parse(payload));
  return c.json({ received: true });
});

// --- Local testing only: sign in and simulate Stripe without real accounts or keys ---

app.use("/dev/*", async (c, next) => (devMode(c) ? next() : c.json({ error: "not_found" }, 404)));

app.post("/dev/login", async (c) => {
  const { id = "dev-user", email = "dev@example.test" } = await c.req.json<{ id?: string; email?: string }>().catch(() => ({}) as { id?: string; email?: string });
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at) VALUES (?1, ?2, 'Dev', NULL, ?3) ON CONFLICT(id) DO NOTHING`,
  )
    .bind(id, email, Date.now())
    .run();
  // Each test run starts from a clean account.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM subscriptions WHERE user_id = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM user_data WHERE user_id = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM sheet_links WHERE user_id = ?1").bind(id),
  ]);
  await startSession(c, id);
  return c.json({ ok: true });
});

/** Posts signed events through the real webhook route, as Stripe would after payment or cancellation. */
async function simulateWebhook(c: Context<AppEnv>, events: unknown[]) {
  const secret = c.env.STRIPE_WEBHOOK_SECRET ?? "whsec_dev_local";
  for (const event of events) {
    const payload = JSON.stringify(event);
    const signature = await signStripePayload(payload, secret, Math.floor(Date.now() / 1000));
    await app.request(
      "/api/billing/webhook",
      { method: "POST", body: payload, headers: { "stripe-signature": signature } },
      { ...c.env, STRIPE_WEBHOOK_SECRET: secret },
    );
  }
}

/** Stands in for the Apps Script web app in local tests: same request and reply, rows kept in memory. */
const devSheet = new Map<string, SheetRow>();
app.post("/dev/sheet", async (c) => {
  const body = await c.req.json<{ token?: string } & Partial<SheetBody>>();
  if (body.token !== "dev-sheet-token") return c.json({ ok: false, error: "unauthorized" });
  for (const row of body.upserts ?? []) devSheet.set(row.id, row);
  for (const id of body.deletes ?? []) devSheet.delete(id);
  return c.json({ ok: true });
});
app.get("/dev/sheet", (c) => c.json({ rows: [...devSheet.values()] }));
app.delete("/dev/sheet", (c) => {
  devSheet.clear();
  return c.json({ ok: true });
});

app.get("/dev/checkout", requireUser, async (c) => {
  const userId = c.get("userId");
  const end = Math.floor(Date.now() / 1000) + 30 * 86400;
  await simulateWebhook(c, [
    { type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: userId, customer: `cus_dev_${userId}`, subscription: `sub_dev_${userId}` } } },
    { type: "customer.subscription.updated", data: { object: { id: `sub_dev_${userId}`, customer: `cus_dev_${userId}`, status: "active", metadata: { user_id: userId }, items: { data: [{ current_period_end: end }] } } } },
  ]);
  return c.redirect("/?pro=success");
});

app.get("/dev/cancel", requireUser, async (c) => {
  const userId = c.get("userId");
  await simulateWebhook(c, [
    { type: "customer.subscription.deleted", data: { object: { id: `sub_dev_${userId}`, customer: `cus_dev_${userId}`, status: "canceled", metadata: { user_id: userId } } } },
  ]);
  return c.redirect("/?pro=portal");
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
  // Merge, never overwrite: records from both copies are kept (an older or stale device can no longer wipe them),
  // and the newer copy decides menus and settings. The merged copy goes back so the device adopts it.
  const row = await c.env.DB.prepare("SELECT data, updated_at FROM user_data WHERE user_id = ?1")
    .bind(c.get("userId"))
    .first<{ data: string; updated_at: number }>();
  const incoming = { data: body.data as AppData, updatedAt: body.updatedAt };
  const before = row ? (JSON.parse(row.data) as AppData) : null;
  const merged = before ? mergeSnapshots({ data: before, updatedAt: row!.updated_at }, incoming) : incoming;
  const json = JSON.stringify(merged.data);
  if (!row || json !== row.data || merged.updatedAt !== row.updated_at) {
    await c.env.DB.prepare(
      `INSERT INTO user_data (user_id, data, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3`,
    )
      .bind(c.get("userId"), json, merged.updatedAt)
      .run();
    // Records reach the linked spreadsheet after the reply, so the app never waits on Google.
    const diff = sheetDiff(before, merged.data);
    if (diff.upserts.length || diff.deletes.length) later(c, sendChangesToSheet(c, c.get("userId"), diff));
  }
  return c.json({ ok: true, data: merged.data, updatedAt: merged.updatedAt });
});

// --- Spreadsheet link: the user's own Google Sheet receives their records (docs/spreadsheet-sync.md) ---

type SheetLink = { url: string; token: string; last_ok_at: number | null; last_error: string | null };
type SheetBody = { upserts: SheetRow[]; deletes: string[] };
const SHEET_CHUNK = 500;

const later = (c: Context<AppEnv>, p: Promise<unknown>) => {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    void p;
  }
};

const sheetLinkOf = (c: Context<AppEnv>, userId: string) =>
  c.env.DB.prepare("SELECT url, token, last_ok_at, last_error FROM sheet_links WHERE user_id = ?1").bind(userId).first<SheetLink>();

/** Apps Script URLs only; locally also the stand-in below, for tests. */
const sheetUrlOk = (c: Context<AppEnv>, url: string) => SHEET_URL.test(url) || (devMode(c) && url === new URL("/api/dev/sheet", c.req.url).href);

/** Posts in chunks; returns an error message for the settings screen, or null when the sheet took everything. */
async function postToSheet(link: SheetLink, body: SheetBody): Promise<string | null> {
  const chunks: SheetBody[] = [];
  for (let i = 0; i < Math.max(1, body.upserts.length); i += SHEET_CHUNK) {
    chunks.push({ upserts: body.upserts.slice(i, i + SHEET_CHUNK), deletes: i === 0 ? body.deletes : [] });
  }
  try {
    for (const chunk of chunks) {
      // Apps Script answers with a redirect to the script's output; fetch follows it.
      const res = await fetch(link.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: link.token, ...chunk }),
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      const reply = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (reply?.ok) continue;
      if (reply?.error === "unauthorized") return "合言葉がスプレッドシートのスクリプトと一致しません";
      if (!res.ok) return `スプレッドシートに届きませんでした (HTTP ${res.status})`;
      return "スプレッドシートの応答を読めませんでした。デプロイの「アクセスできるユーザー」が「全員」か確認してください";
    }
    return null;
  } catch {
    return "スプレッドシートに接続できませんでした";
  }
}

async function sendToSheet(c: Context<AppEnv>, userId: string, link: SheetLink, body: SheetBody) {
  const error = await postToSheet(link, body);
  await c.env.DB.prepare("UPDATE sheet_links SET last_ok_at = COALESCE(?2, last_ok_at), last_error = ?3 WHERE user_id = ?1")
    .bind(userId, error ? null : Date.now(), error)
    .run();
  return error;
}

async function sendChangesToSheet(c: Context<AppEnv>, userId: string, body: SheetBody) {
  const link = await sheetLinkOf(c, userId);
  if (link) await sendToSheet(c, userId, link, body);
}

const sheetStatus = (link: SheetLink | null) =>
  link ? { linked: true, url: link.url, lastOkAt: link.last_ok_at, lastError: link.last_error } : { linked: false, lastOkAt: null, lastError: null };

app.get("/sheets", async (c) => c.json(sheetStatus(await sheetLinkOf(c, c.get("userId")))));

/** Saves the link and sends an empty test, so a wrong URL or token shows up right away. */
app.put("/sheets", async (c) => {
  const { url = "", token = "" } = await c.req.json<{ url?: string; token?: string }>().catch(() => ({}) as { url?: string; token?: string });
  if (!sheetUrlOk(c, url.trim())) return c.json({ error: "bad_url" }, 400);
  if (token.length < 8 || token.length > 200) return c.json({ error: "bad_token" }, 400);
  const userId = c.get("userId");
  await c.env.DB.prepare(
    `INSERT INTO sheet_links (user_id, url, token, last_ok_at, last_error, updated_at) VALUES (?1, ?2, ?3, NULL, NULL, ?4)
     ON CONFLICT(user_id) DO UPDATE SET url = ?2, token = ?3, last_ok_at = NULL, last_error = NULL, updated_at = ?4`,
  )
    .bind(userId, url.trim(), token, Date.now())
    .run();
  const link = (await sheetLinkOf(c, userId))!;
  await sendToSheet(c, userId, link, { upserts: [], deletes: [] });
  return c.json(sheetStatus(await sheetLinkOf(c, userId)));
});

app.delete("/sheets", async (c) => {
  await c.env.DB.prepare("DELETE FROM sheet_links WHERE user_id = ?1").bind(c.get("userId")).run();
  return c.json(sheetStatus(null));
});

/** Every record again: rows are matched by record id, so this never duplicates anything. */
app.post("/sheets/resend", async (c) => {
  const userId = c.get("userId");
  const link = await sheetLinkOf(c, userId);
  if (!link) return c.json({ error: "not_linked" }, 400);
  const row = await c.env.DB.prepare("SELECT data FROM user_data WHERE user_id = ?1").bind(userId).first<{ data: string }>();
  const logs = row ? ((JSON.parse(row.data) as AppData).logs ?? []) : [];
  await sendToSheet(c, userId, link, { upserts: logs.map(toSheetRow), deletes: [] });
  return c.json({ ...sheetStatus(await sheetLinkOf(c, userId)), count: logs.length });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
