/**
 * Google Picker: the user chooses one of their spreadsheets, which also grants REPS (drive.file) access to just that file.
 * Locally the key is "dev" and the fake Google answers instead.
 */
export type PickerConfig = { key: string; appId: string };

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let loading: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const done = () => window.gapi.load("picker", { callback: () => resolve(), onerror: reject });
    if (window.gapi) return done();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = done;
    s.onerror = () => {
      loading = null;
      reject(new Error("picker_load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Resolves with the chosen spreadsheet's id, or null when the user closes the Picker. */
export async function pickSpreadsheet(config: PickerConfig, accessToken: string): Promise<string | null> {
  if (config.key === "dev") {
    const res = await fetch("/api/dev/google/pick");
    return ((await res.json()) as { id: string }).id;
  }
  await loadPicker();
  const picker = window.google.picker;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.key)
      .setAppId(config.appId)
      .setLocale("ja")
      .setTitle("記録を書き込むシートを選ぶ")
      .setCallback((data: any) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
