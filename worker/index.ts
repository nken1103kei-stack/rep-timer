import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomToken, seal, SESSION_COOKIE, SESSION_TTL_SEC, signSession, signState, unseal, verifySession, verifyState } from "./session";
import { accessToken, createSpreadsheet, exchangeCode, GOOGLE_AUTH_URL, realGoogle, revoke, SheetError, sheetErrorText, SHEETS_SCOPE, spreadsheetInfo, writeRows, type GoogleApi } from "./googleSheets";
import { createFakeGoogle } from "./fakeGoogle";
import { mergeSnapshots } from "../src/lib/merge";
import { SHEET_URL, sheetCsv, sheetDailyCsv, sheetDiff, toSheetRow, type SheetRow } from "../src/lib/sheetRows";
import type { AppData } from "../src/lib/types";
import { applyEvent, customerFor, isOwner, ownerList, planFor, signStripePayload, stripe, verifyStripeSignature, type BillingEnv } from "./billing";

type Env = BillingEnv & {
  GOOGLE_CLIENT_ID: string;
  /** Secret: the OAuth client's secret, for the Sheets link (one consent, then the server writes). Unset hides that option. */
  GOOGLE_CLIENT_SECRET?: string;
  /** A browser API key for the Google Picker (choosing an existing sheet). Unset leaves only "make a new sheet". */
  GOOGLE_PICKER_KEY?: string;
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
    sheets: { google: googleReady(c), picker: pickerOf(c) },
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
    c.env.DB.prepare("DELETE FROM sheet_feeds WHERE user_id = ?1").bind(id),
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
/** Stands in for Google: the consent screen says yes at once, and the APIs run against fakeGoogle. */
const fakeGoogle = createFakeGoogle();
app.get("/dev/google/auth", (c) => {
  const back = new URL(c.req.query("redirect_uri") ?? "/", c.req.url);
  if (c.req.query("deny")) back.searchParams.set("error", "access_denied");
  else back.searchParams.set("code", "dev-code");
  back.searchParams.set("state", c.req.query("state") ?? "");
  return c.redirect(back.href);
});
app.get("/dev/google/books", (c) => c.json(Object.fromEntries(fakeGoogle.books)));
app.delete("/dev/google/books", (c) => {
  fakeGoogle.reset();
  return c.json({ ok: true });
});
/** What the Picker would return locally: the user's existing PFC sheet. */
app.get("/dev/google/pick", (c) => c.json({ id: "pfc" }));
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
// Three ways in: "google" (one consent + pick a sheet; the server writes with the Sheets API),
// the private CSV address for =IMPORTDATA(...), and "script" (an Apps Script web app, for advanced users).

type SheetLink = {
  kind: "script" | "google";
  url: string;
  token: string;
  spreadsheet_id: string | null;
  title: string | null;
  refresh_token: string | null;
  last_ok_at: number | null;
  last_error: string | null;
};
type SheetBody = { upserts: SheetRow[]; deletes: string[] };
const SHEET_CHUNK = 500;
const NEW_SHEET_TITLE = "REPS 筋トレ記録";
const STATE_COOKIE = "rt_gstate";
const STATE_PATH = "/api/sheets/google";

const later = (c: Context<AppEnv>, p: Promise<unknown>) => {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    void p;
  }
};

const sheetLinkOf = (c: Context<AppEnv>, userId: string) =>
  c.env.DB.prepare("SELECT kind, url, token, spreadsheet_id, title, refresh_token, last_ok_at, last_error FROM sheet_links WHERE user_id = ?1")
    .bind(userId)
    .first<SheetLink>();

/** Google writes need the OAuth client secret. Locally (DEV_MODE, no secret) a fake Google stands in. */
const useFakeGoogle = (c: Context<AppEnv>) => devMode(c) && !c.env.GOOGLE_CLIENT_SECRET;
const googleReady = (c: Context<AppEnv>) => !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) || useFakeGoogle(c);
const googleOf = (c: Context<AppEnv>): GoogleApi => (useFakeGoogle(c) ? fakeGoogle.api : realGoogle);
const clientOf = (c: Context<AppEnv>) => ({ clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET ?? "dev" });
const callbackUrl = (c: Context<AppEnv>) => new URL(`${STATE_PATH}/callback`, c.req.url).href;
/** The Picker needs a browser API key and the Cloud project number (the client ID's first part). */
const pickerOf = (c: Context<AppEnv>) =>
  useFakeGoogle(c)
    ? { key: "dev", appId: "dev" }
    : c.env.GOOGLE_PICKER_KEY && googleReady(c)
      ? { key: c.env.GOOGLE_PICKER_KEY, appId: c.env.GOOGLE_CLIENT_ID.split("-")[0] }
      : null;

async function googleToken(c: Context<AppEnv>, link: SheetLink) {
  const refresh = await unseal(link.refresh_token ?? "", c.env.SESSION_SECRET).catch(() => null);
  if (!refresh) throw new SheetError("revoked");
  return accessToken(googleOf(c), clientOf(c), refresh);
}

/** Apps Script URLs only; locally also the stand-in below, for tests. */
const sheetUrlOk = (c: Context<AppEnv>, url: string) => SHEET_URL.test(url) || (devMode(c) && url === new URL("/api/dev/sheet", c.req.url).href);

/** Posts in chunks to the Apps Script; returns an error message for the settings screen, or null when the sheet took everything. */
async function postToScript(link: SheetLink, body: SheetBody): Promise<string | null> {
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

async function deliver(c: Context<AppEnv>, link: SheetLink, body: SheetBody): Promise<string | null> {
  if (link.kind === "script") return postToScript(link, body);
  if (!link.spreadsheet_id) return "書き込むシートがまだ選ばれていません";
  try {
    await writeRows(googleOf(c), await googleToken(c, link), link.spreadsheet_id, body);
    return null;
  } catch (e) {
    return sheetErrorText(e);
  }
}

async function sendToSheet(c: Context<AppEnv>, userId: string, link: SheetLink, body: SheetBody) {
  const error = await deliver(c, link, body);
  await c.env.DB.prepare("UPDATE sheet_links SET last_ok_at = COALESCE(?2, last_ok_at), last_error = ?3 WHERE user_id = ?1")
    .bind(userId, error ? null : Date.now(), error)
    .run();
  return error;
}

async function sendChangesToSheet(c: Context<AppEnv>, userId: string, body: SheetBody) {
  const link = await sheetLinkOf(c, userId);
  if (link && (link.kind === "script" || link.spreadsheet_id)) await sendToSheet(c, userId, link, body);
}

const logsOf = async (c: Context<AppEnv>, userId: string) => {
  const row = await c.env.DB.prepare("SELECT data FROM user_data WHERE user_id = ?1").bind(userId).first<{ data: string }>();
  return row ? ((JSON.parse(row.data) as AppData).logs ?? []) : [];
};

/** Every record again: rows are matched by record id, so this never duplicates anything. */
async function resendAll(c: Context<AppEnv>, userId: string) {
  const link = await sheetLinkOf(c, userId);
  if (!link) return 0;
  const logs = await logsOf(c, userId);
  await sendToSheet(c, userId, link, { upserts: logs.map(toSheetRow), deletes: [] });
  return logs.length;
}

const sheetStatus = (link: SheetLink | null) =>
  link
    ? {
        linked: link.kind === "script" || !!link.spreadsheet_id,
        kind: link.kind,
        pending: link.kind === "google" && !link.spreadsheet_id,
        url: link.url || undefined,
        title: link.title ?? undefined,
        lastOkAt: link.last_ok_at,
        lastError: link.last_error,
      }
    : { linked: false, lastOkAt: null, lastError: null };

app.get("/sheets", async (c) => c.json(sheetStatus(await sheetLinkOf(c, c.get("userId")))));

/** Advanced: an Apps Script web app. Saves the link and sends an empty test, so a wrong URL or token shows up right away. */
app.put("/sheets", async (c) => {
  const { url = "", token = "" } = await c.req.json<{ url?: string; token?: string }>().catch(() => ({}) as { url?: string; token?: string });
  if (!sheetUrlOk(c, url.trim())) return c.json({ error: "bad_url" }, 400);
  if (token.length < 8 || token.length > 200) return c.json({ error: "bad_token" }, 400);
  const userId = c.get("userId");
  await c.env.DB.prepare(
    `INSERT INTO sheet_links (user_id, kind, url, token, spreadsheet_id, title, refresh_token, last_ok_at, last_error, updated_at)
     VALUES (?1, 'script', ?2, ?3, NULL, NULL, NULL, NULL, NULL, ?4)
     ON CONFLICT(user_id) DO UPDATE SET kind = 'script', url = ?2, token = ?3, spreadsheet_id = NULL, title = NULL, refresh_token = NULL,
       last_ok_at = NULL, last_error = NULL, updated_at = ?4`,
  )
    .bind(userId, url.trim(), token, Date.now())
    .run();
  const link = (await sheetLinkOf(c, userId))!;
  await sendToSheet(c, userId, link, { upserts: [], deletes: [] });
  return c.json(sheetStatus(await sheetLinkOf(c, userId)));
});

app.delete("/sheets", async (c) => {
  const link = await sheetLinkOf(c, c.get("userId"));
  if (link?.refresh_token) {
    const refresh = await unseal(link.refresh_token, c.env.SESSION_SECRET).catch(() => null);
    if (refresh) later(c, revoke(googleOf(c), refresh));
  }
  await c.env.DB.prepare("DELETE FROM sheet_links WHERE user_id = ?1").bind(c.get("userId")).run();
  return c.json(sheetStatus(null));
});

app.post("/sheets/resend", async (c) => {
  const userId = c.get("userId");
  const link = await sheetLinkOf(c, userId);
  if (!link || !sheetStatus(link).linked) return c.json({ error: "not_linked" }, 400);
  const count = await resendAll(c, userId);
  return c.json({ ...sheetStatus(await sheetLinkOf(c, userId)), count });
});

/** Step 1 of the easy link: Google's consent screen, asking for drive.file only. mode=new makes a sheet; mode=pick lets the user choose one. */
app.get("/sheets/google/start", async (c) => {
  if (!googleReady(c)) return c.json({ error: "not_configured" }, 503);
  const mode = c.req.query("mode") === "pick" ? "pick" : "new";
  const nonce = crypto.randomUUID();
  const state = await signState(c.get("userId"), { mode, nonce }, c.env.SESSION_SECRET);
  setCookie(c, STATE_COOKIE, nonce, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: STATE_PATH, maxAge: 600 });
  const auth = new URL(useFakeGoogle(c) ? new URL("/api/dev/google/auth", c.req.url).href : GOOGLE_AUTH_URL);
  auth.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    response_type: "code",
    scope: SHEETS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return c.redirect(auth.href);
});

/** Step 2: back from Google. Keeps the (sealed) refresh token; for mode=new also makes the sheet and fills it. */
app.get("/sheets/google/callback", async (c) => {
  const back = (result: string) => c.redirect(`/?sheets=${result}`);
  const nonce = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: STATE_PATH });
  if (c.req.query("error")) return back("denied");
  const userId = c.get("userId");
  const state = await verifyState(c.req.query("state") ?? "", c.env.SESSION_SECRET);
  const code = c.req.query("code");
  if (!state || state.sub !== userId || !nonce || state.nonce !== nonce || !code) return back("error");
  try {
    const api = googleOf(c);
    const t = await exchangeCode(api, clientOf(c), code, callbackUrl(c));
    const sheet = state.mode === "new" ? await createSpreadsheet(api, t.accessToken, NEW_SHEET_TITLE) : null;
    await c.env.DB.prepare(
      `INSERT INTO sheet_links (user_id, kind, url, token, spreadsheet_id, title, refresh_token, last_ok_at, last_error, updated_at)
       VALUES (?1, 'google', ?2, '', ?3, ?4, ?5, NULL, NULL, ?6)
       ON CONFLICT(user_id) DO UPDATE SET kind = 'google', url = ?2, token = '', spreadsheet_id = ?3, title = ?4, refresh_token = ?5,
         last_ok_at = NULL, last_error = NULL, updated_at = ?6`,
    )
      .bind(userId, sheet?.url ?? "", sheet?.id ?? null, sheet?.title ?? null, await seal(t.refreshToken, c.env.SESSION_SECRET), Date.now())
      .run();
    if (!sheet) return back("pick");
    await resendAll(c, userId);
    return back("linked");
  } catch {
    return back("error");
  }
});

/** A short-lived access token for the Google Picker in the browser (drive.file, this user's own). */
app.get("/sheets/google/token", async (c) => {
  const link = await sheetLinkOf(c, c.get("userId"));
  if (link?.kind !== "google") return c.json({ error: "not_linked" }, 400);
  try {
    return c.json({ accessToken: await googleToken(c, link) });
  } catch (e) {
    return c.json({ error: sheetErrorText(e) }, 400);
  }
});

/** Step 3 for mode=pick: the sheet chosen in the Picker. Checks it can be opened, then sends every record. */
app.post("/sheets/google/select", async (c) => {
  const userId = c.get("userId");
  const { id = "" } = await c.req.json<{ id?: string }>().catch(() => ({}) as { id?: string });
  if (!/^[\w-]{1,200}$/.test(id)) return c.json({ error: "bad_id" }, 400);
  const link = await sheetLinkOf(c, userId);
  if (link?.kind !== "google") return c.json({ error: "not_linked" }, 400);
  let info;
  try {
    info = await spreadsheetInfo(googleOf(c), await googleToken(c, link), id);
  } catch (e) {
    return c.json({ ...sheetStatus(link), lastError: sheetErrorText(e) });
  }
  await c.env.DB.prepare("UPDATE sheet_links SET spreadsheet_id = ?2, url = ?3, title = ?4, last_error = NULL, updated_at = ?5 WHERE user_id = ?1")
    .bind(userId, info.id, info.url, info.title, Date.now())
    .run();
  const count = await resendAll(c, userId);
  return c.json({ ...sheetStatus(await sheetLinkOf(c, userId)), count });
});

// --- The private CSV address: =IMPORTDATA("…") in any sheet, no Google permission needed ---

const feedUrl = (c: Context<AppEnv>, token: string) => new URL(`/api/feed/${token}.csv`, c.req.url).href;

app.get("/sheets/feed", async (c) => {
  const row = await c.env.DB.prepare("SELECT token FROM sheet_feeds WHERE user_id = ?1").bind(c.get("userId")).first<{ token: string }>();
  return c.json({ url: row ? feedUrl(c, row.token) : null });
});

/** Makes the address, or a new one: the old address stops working. */
app.post("/sheets/feed", async (c) => {
  const token = randomToken();
  await c.env.DB.prepare(
    `INSERT INTO sheet_feeds (user_id, token, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET token = ?2, created_at = ?3`,
  )
    .bind(c.get("userId"), token, Date.now())
    .run();
  return c.json({ url: feedUrl(c, token) });
});

app.delete("/sheets/feed", async (c) => {
  await c.env.DB.prepare("DELETE FROM sheet_feeds WHERE user_id = ?1").bind(c.get("userId")).run();
  return c.json({ url: null });
});

app.get("/feed/:file", async (c) => {
  const token = c.req.param("file").replace(/\.csv$/, "");
  if (!/^[\w-]{20,64}$/.test(token)) return c.json({ error: "not_found" }, 404);
  const row = await c.env.DB.prepare("SELECT user_id FROM sheet_feeds WHERE token = ?1").bind(token).first<{ user_id: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  // One row per day by default (what PFC sheets read); ?view=records gives one row per record.
  const logs = await logsOf(c, row.user_id);
  return new Response(c.req.query("view") === "records" ? sheetCsv(logs) : sheetDailyCsv(logs), {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
