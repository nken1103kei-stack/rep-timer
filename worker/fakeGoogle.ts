import type { GoogleApi } from "./googleSheets";

/**
 * An in-memory stand-in for the parts of Google's token and Sheets APIs that REPS uses.
 * Unit tests and local E2E (DEV_MODE only) run the real client code against it.
 */
type Tab = { sheetId: number; title: string; rows: (string | number)[][] };
type Book = { id: string; title: string; tabs: Tab[] };

export function createFakeGoogle() {
  const books = new Map<string, Book>();
  const revoked = new Set<string>();
  let next = 1;

  const reset = () => {
    books.clear();
    revoked.clear();
    // The user's own PFC sheet, already there before linking.
    books.set("pfc", { id: "pfc", title: "PFC管理", tabs: [{ sheetId: 0, title: "体重", rows: [["日付", "体重"], ["2026-11-18", 70.2]] }] });
  };
  reset();

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const parseRange = (book: Book, raw: string) => {
    const m = /^'?(.+?)'?!A(\d+)(?::[A-J](\d*))?$/.exec(decodeURIComponent(raw));
    const tab = m && book.tabs.find((t) => t.title === m[1]);
    return tab ? { tab, start: Number(m![2]) } : null;
  };
  const info = (b: Book) => ({
    spreadsheetId: b.id,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${b.id}/edit`,
    properties: { title: b.title },
    sheets: b.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })),
  });

  async function handle(url: string, init: RequestInit = {}): Promise<Response> {
    const u = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = u.pathname.replace(/^.*?\/(oauth|sheets)\//, "/$1/");
    const text = typeof init.body === "string" ? init.body : "";

    if (path === "/oauth/token") {
      const p = new URLSearchParams(text);
      if (p.get("grant_type") === "authorization_code") {
        // Like Google, every consent gives a new refresh token.
        return p.get("code") === "dev-code" ? json({ access_token: "dev-access", refresh_token: `dev-refresh-${next++}` }) : json({ error: "invalid_grant" }, 400);
      }
      const r = p.get("refresh_token") ?? "";
      return r.startsWith("dev-refresh-") && !revoked.has(r) ? json({ access_token: "dev-access" }) : json({ error: "invalid_grant" }, 400);
    }
    if (path === "/oauth/revoke") {
      revoked.add(new URLSearchParams(text).get("token") ?? "");
      return json({});
    }

    const auth = new Headers(init.headers).get("authorization");
    if (auth !== "Bearer dev-access") return json({ error: { code: 401 } }, 401);
    const body = text ? JSON.parse(text) : {};

    if (path === "/sheets/v4/spreadsheets" && method === "POST") {
      const id = `made-${next++}`;
      const tabs = (body.sheets ?? []).map((s: { properties: { title: string } }, i: number) => ({ sheetId: i, title: s.properties.title, rows: [] }));
      const book = { id, title: body.properties?.title ?? "無題", tabs };
      books.set(id, book);
      return json(info(book));
    }
    const m = /^\/sheets\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(path);
    const book = m && books.get(decodeURIComponent(m[1]));
    if (!m || !book) return json({ error: { code: 404 } }, 404);
    const rest = m[2];

    if (rest === "" && method === "GET") return json(info(book));
    if (rest === ":batchUpdate") {
      const replies = [];
      for (const r of body.requests ?? []) {
        if (r.addSheet) {
          const tab = { sheetId: book.tabs.length ? Math.max(...book.tabs.map((t) => t.sheetId)) + 1 : 0, title: r.addSheet.properties.title, rows: [] };
          book.tabs.push(tab);
          replies.push({ addSheet: { properties: { sheetId: tab.sheetId, title: tab.title } } });
        } else if (r.deleteDimension) {
          const { sheetId, startIndex, endIndex } = r.deleteDimension.range;
          book.tabs.find((t) => t.sheetId === sheetId)?.rows.splice(startIndex, endIndex - startIndex);
          replies.push({});
        }
      }
      return json({ replies });
    }
    if (rest === "/values:batchUpdate") {
      for (const d of body.data ?? []) {
        const at = parseRange(book, d.range);
        if (at) at.tab.rows[at.start - 1] = d.values[0];
      }
      return json({});
    }
    const v = /^\/values\/([^:]+)(:append)?$/.exec(rest);
    const at = v && parseRange(book, v[1]);
    if (!v || !at) return json({ error: { code: 400 } }, 400);
    if (v[2]) {
      at.tab.rows.push(...body.values);
      return json({});
    }
    if (method === "PUT") {
      body.values.forEach((row: (string | number)[], i: number) => (at.tab.rows[at.start - 1 + i] = row));
      return json({});
    }
    const values = at.tab.rows.slice(at.start - 1).map((r) => [r[0]]);
    return json(values.length ? { values } : {});
  }

  const api: GoogleApi = { fetch: handle, oauth: "https://fake.google/oauth", sheets: "https://fake.google/sheets" };
  return { api, books, reset };
}
