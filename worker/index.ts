import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SESSION_COOKIE, SESSION_TTL_SEC, signSession, verifySession } from "./session";
import { applyEvent, customerFor, isOwner, planFor, signStripePayload, stripe, verifyStripeSignature, type BillingEnv } from "./billing";

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
app.use("/billing/checkout", requireUser);
app.use("/billing/portal", requireUser);

app.get("/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email, name, picture FROM users WHERE id = ?1")
    .bind(c.get("userId"))
    .first<{ id: string; email: string }>();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user, plan: await planFor(c.env.DB, user.id, isOwner(user.email, c.env.OWNER_EMAILS)) });
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
