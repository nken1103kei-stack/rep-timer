/** Stripe subscription helpers. Uses the REST API directly: no SDK needed on Workers. */

export type BillingEnv = {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type Plan = { pro: boolean; status: string | null; until: number | null };

const ACTIVE = new Set(["active", "trialing"]);

export const isPro = (status: string | null | undefined) => !!status && ACTIVE.has(status);

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `Stripe-Signature: t=<sec>,v1=<hex>`; v1 is HMAC-SHA256 of `${t}.${body}` keyed by the endpoint secret. */
export async function signStripePayload(payload: string, secret: string, t: number) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}

export async function verifyStripeSignature(payload: string, header: string | null | undefined, secret: string, nowSec: number, toleranceSec = 300) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || sigs.length === 0 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export async function stripe<T>(env: BillingEnv, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`stripe ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Canonical form of an email for owner matching. The secret is typed by hand (often with a Japanese IME), so full-width
 * characters, quotes and stray spaces are tolerated; Gmail ignores dots and "+tags", so those are dropped too.
 */
export function canonicalEmail(raw: string) {
  const email = raw.normalize("NFKC").replace(/["'`<>\s]/g, "").toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  let [local, domain] = [email.slice(0, at), email.slice(at + 1)];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0].replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Owner emails (the app's creators), separated by commas, semicolons or whitespace. */
export const ownerList = (owners: string | undefined) =>
  (owners ?? "")
    .normalize("NFKC")
    .split(/[,;\s、]+/)
    .map(canonicalEmail)
    .filter((e) => e.includes("@"));

export const isOwner = (email: string | null | undefined, owners: string | undefined) =>
  !!email && ownerList(owners).includes(canonicalEmail(email));

/** Owners get Pro without a subscription; everyone else needs an active or trialing one. */
export async function planFor(db: D1Database, userId: string, owner = false): Promise<Plan> {
  if (owner) return { pro: true, status: "owner", until: null };
  const row = await db
    .prepare("SELECT status, current_period_end FROM subscriptions WHERE user_id = ?1")
    .bind(userId)
    .first<{ status: string; current_period_end: number | null }>();
  return { pro: isPro(row?.status), status: row?.status ?? null, until: row?.current_period_end ?? null };
}

export async function customerFor(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT customer_id FROM subscriptions WHERE user_id = ?1").bind(userId).first<{ customer_id: string | null }>();
  return row?.customer_id ?? null;
}

async function upsert(
  db: D1Database,
  userId: string,
  fields: { customer_id?: string | null; subscription_id?: string | null; status: string; current_period_end?: number | null },
) {
  await db
    .prepare(
      `INSERT INTO subscriptions (user_id, customer_id, subscription_id, status, current_period_end, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(user_id) DO UPDATE SET
         customer_id = COALESCE(?2, customer_id),
         subscription_id = COALESCE(?3, subscription_id),
         status = ?4,
         current_period_end = COALESCE(?5, current_period_end),
         updated_at = ?6`,
    )
    .bind(userId, fields.customer_id ?? null, fields.subscription_id ?? null, fields.status, fields.current_period_end ?? null, Date.now())
    .run();
}

type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Applies a verified webhook event. Returns the user it touched, if any. */
export async function applyEvent(db: D1Database, event: StripeEvent): Promise<string | null> {
  const o = event.data.object;
  if (event.type === "checkout.session.completed") {
    const userId = str(o.client_reference_id);
    if (!userId || o.mode !== "subscription") return null;
    await upsert(db, userId, { customer_id: str(o.customer), subscription_id: str(o.subscription), status: "active" });
    return userId;
  }
  if (event.type.startsWith("customer.subscription.")) {
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    let userId = str(meta.user_id);
    const customer = str(o.customer);
    if (!userId && customer) {
      const row = await db.prepare("SELECT user_id FROM subscriptions WHERE customer_id = ?1").bind(customer).first<{ user_id: string }>();
      userId = row?.user_id ?? null;
    }
    if (!userId) return null;
    // Newer API versions report the period end on the subscription item instead of the subscription.
    const items = (o.items as { data?: { current_period_end?: number }[] } | undefined)?.data;
    const end = (o.current_period_end as number | undefined) ?? items?.[0]?.current_period_end;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : (str(o.status) ?? "canceled");
    await upsert(db, userId, { customer_id: customer, subscription_id: str(o.id), status, current_period_end: end ? end * 1000 : null });
    return userId;
  }
  return null;
}
