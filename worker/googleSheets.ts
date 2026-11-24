import { SHEET_HEAD, SHEET_TAB, sheetCells, type SheetRow } from "../src/lib/sheetRows";

/**
 * Writes records into the user's own spreadsheet with the Google Sheets API.
 * The user allowed only drive.file: REPS can open just the sheets it created or the user picked.
 */
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export type GoogleApi = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  oauth: string;
  sheets: string;
};

export const realGoogle: GoogleApi = {
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(25_000) }),
  oauth: "https://oauth2.googleapis.com",
  sheets: "https://sheets.googleapis.com",
};

/** Why a write failed, in words for the settings screen. */
export class SheetError extends Error {
  constructor(
    readonly reason: "revoked" | "not_found" | "forbidden" | "failed",
    readonly status = 0,
  ) {
    super(reason);
  }
}

export const sheetErrorText = (e: unknown) => {
  const reason = e instanceof SheetError ? e.reason : "failed";
  return {
    revoked: "Googleの許可が取り消されています。もう一度「Googleで連携」してください",
    not_found: "シートが見つかりません。削除された場合は、連携し直してください",
    forbidden: "このシートに書き込む権限がありません。自分が編集できるシートを選んでください",
    failed: "スプレッドシートに書き込めませんでした。しばらくして「全件を送り直す」を押してください",
  }[reason];
};

type Client = { clientId: string; clientSecret: string };

async function tokenRequest(api: GoogleApi, params: Record<string, string>) {
  const res = await api.fetch(`${api.oauth}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (body.error === "invalid_grant") throw new SheetError("revoked", res.status);
  if (!res.ok || !body.access_token) throw new SheetError("failed", res.status);
  return body as { access_token: string; refresh_token?: string };
}

/** The code from the consent screen, traded for a long-lived refresh token. */
export async function exchangeCode(api: GoogleApi, client: Client, code: string, redirectUri: string) {
  const t = await tokenRequest(api, {
    grant_type: "authorization_code",
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
  });
  if (!t.refresh_token) throw new SheetError("failed");
  return { accessToken: t.access_token, refreshToken: t.refresh_token };
}

export async function accessToken(api: GoogleApi, client: Client, refreshToken: string) {
  const t = await tokenRequest(api, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
  return t.access_token;
}

/** Best effort: unlinking also withdraws the permission on Google's side. */
export async function revoke(api: GoogleApi, refreshToken: string) {
  await api.fetch(`${api.oauth}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  }).catch(() => null);
}

async function call<T>(api: GoogleApi, token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await api.fetch(`${api.sheets}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401) throw new SheetError("revoked", 401);
  if (res.status === 404) throw new SheetError("not_found", 404);
  if (res.status === 403) throw new SheetError("forbidden", 403);
  if (!res.ok) throw new SheetError("failed", res.status);
  return (await res.json()) as T;
}

type Info = { spreadsheetId: string; spreadsheetUrl: string; properties: { title: string }; sheets?: { properties: { sheetId: number; title: string } }[] };

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

export async function createSpreadsheet(api: GoogleApi, token: string, title: string) {
  const s = await call<Info>(api, token, "/v4/spreadsheets", {
    method: "POST",
    body: { properties: { title, locale: "ja_JP", timeZone: "Asia/Tokyo" }, sheets: [{ properties: { title: SHEET_TAB, gridProperties: { frozenRowCount: 1 } } }] },
  });
  await call(api, token, `/v4/spreadsheets/${s.spreadsheetId}/values/${range("A1:J1")}?valueInputOption=RAW`, { method: "PUT", body: { values: [SHEET_HEAD] } });
  return { id: s.spreadsheetId, url: s.spreadsheetUrl || sheetUrl(s.spreadsheetId), title: s.properties.title };
}

export async function spreadsheetInfo(api: GoogleApi, token: string, id: string) {
  const s = await call<Info>(api, token, `/v4/spreadsheets/${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`);
  return { id: s.spreadsheetId, url: s.spreadsheetUrl || sheetUrl(s.spreadsheetId), title: s.properties.title, tabs: (s.sheets ?? []).map((t) => t.properties) };
}

const range = (cells: string) => encodeURIComponent(`'${SHEET_TAB}'!${cells}`);

/** The records tab, made with its header row when the picked sheet does not have it yet. */
async function recordsTab(api: GoogleApi, token: string, id: string) {
  const info = await spreadsheetInfo(api, token, id);
  const tab = info.tabs.find((t) => t.title === SHEET_TAB);
  if (tab) return tab.sheetId;
  const r = await call<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(api, token, `/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title: SHEET_TAB, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  await call(api, token, `/v4/spreadsheets/${id}/values/${range("A1:J1")}?valueInputOption=RAW`, { method: "PUT", body: { values: [SHEET_HEAD] } });
  return r.replies[0].addSheet.properties.sheetId;
}

/** Rows are found by record id: an existing row is overwritten, a new one appended, a deleted one removed. */
export async function writeRows(api: GoogleApi, token: string, id: string, body: { upserts: SheetRow[]; deletes: string[] }) {
  const sheetId = await recordsTab(api, token, id);
  if (!body.upserts.length && !body.deletes.length) return;
  const col = await call<{ values?: string[][] }>(api, token, `/v4/spreadsheets/${id}/values/${range("A2:A")}`);
  const rowOf = new Map<string, number>();
  (col.values ?? []).forEach((v, i) => v[0] && rowOf.set(String(v[0]), i + 2));

  const updates = body.upserts.filter((r) => rowOf.has(r.id));
  const appends = body.upserts.filter((r) => !rowOf.has(r.id));
  if (updates.length) {
    await call(api, token, `/v4/spreadsheets/${id}/values:batchUpdate`, {
      method: "POST",
      body: {
        valueInputOption: "USER_ENTERED",
        data: updates.map((r) => ({ range: `'${SHEET_TAB}'!A${rowOf.get(r.id)}:J${rowOf.get(r.id)}`, values: [sheetCells(r)] })),
      },
    });
  }
  // From the bottom up, so the rows above keep their numbers.
  const gone = [...new Set(body.deletes)].map((d) => rowOf.get(d)).filter((r): r is number => !!r).sort((a, b) => b - a);
  if (gone.length) {
    await call(api, token, `/v4/spreadsheets/${id}:batchUpdate`, {
      method: "POST",
      body: { requests: gone.map((r) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } })) },
    });
  }
  if (appends.length) {
    await call(api, token, `/v4/spreadsheets/${id}/values/${range("A1:J1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: { values: appends.map(sheetCells) },
    });
  }
}
