import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rt_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Short-lived, signed state for the Google consent round trip: who started it, for what, and a nonce tied to a cookie. */
export async function signState(userId: string, claims: { mode: string; nonce: string }, secret: string): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("10m").sign(key(secret));
}

export async function verifyState(token: string, secret: string): Promise<{ sub: string; mode: string; nonce: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.mode !== "string" || typeof payload.nonce !== "string") return null;
    return { sub: payload.sub, mode: payload.mode, nonce: payload.nonce };
  } catch {
    return null;
  }
}

/** Seals a stored secret (the Google refresh token) with AES-GCM, keyed from the server secret. */
const aesKey = async (secret: string) =>
  crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sheets:${secret}`)), "AES-GCM", false, ["encrypt", "decrypt"]);
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

export async function seal(text: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function unseal(sealed: string, secret: string): Promise<string> {
  const bytes = fromB64(sealed);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await aesKey(secret), bytes.slice(12));
  return new TextDecoder().decode(plain);
}

/** A random, URL-safe token (for the private CSV address). */
export const randomToken = () => toB64(crypto.getRandomValues(new Uint8Array(24)));
