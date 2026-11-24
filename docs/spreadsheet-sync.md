# スプレッドシート連携

REPS の筋トレ記録を、自分の Google スプレッドシート（体重・PFC 管理など）に入れる方法です。
方法は3つあります。ふつうは **1. Googleで連携** を使ってください。

| 方法 | 利用者の操作 | 反映 | 向いている人 |
| --- | --- | --- | --- |
| 1. Googleで連携（おすすめ） | ボタンを押して、Googleで許可して、シートを選ぶ | 記録して数秒 | ほとんどの人 |
| 2. かんたん連携: 数式を貼るだけ | 数式をコピーして、シートに貼る | Google が読み直すたび。1時間ほど遅れることがある | Googleの許可を出したくない人 |
| 3. 上級者向け: Apps Script | スクリプトを貼って公開し、URLと合言葉を入れる | 記録して数秒 | 自分でシートの処理を変えたい人 |

## 1. Googleで連携（おすすめ）

**使い方**

1. REPS に Google でログインする。
2. 右上の設定 →「スプレッドシート連携」で、どちらかを押す。
   - **Googleで連携して、今あるシートを選ぶ**: PFC シートなど、今使っているシートに入れたいとき。
   - **Googleで連携して、新しいシートを作る**: 記録専用のシート「REPS 筋トレ記録」を作るとき。
3. Google の画面で許可する。今あるシートを選ぶ場合は、続けて出る一覧からシートを選ぶ。
4. 「○○に連携中」と出れば完了です。これまでの記録もすべて「筋トレ記録」タブに入ります。

- 書き込むのは「筋トレ記録」タブだけです。体重タブなど、ほかのタブには触れません。
- REPS が開けるのは、選んだシートと REPS が作ったシートだけです（Google の `drive.file` 権限）。ほかのファイルは見えません。
- 記録の追加・変更・削除は、数秒でシートに反映されます。
- 「連携を解除」すると、Google 側の許可も取り消します。シートの行はそのまま残ります。

**シートの形**

| 記録ID | 日時 | 日付 | 種目 | 部位 | 重量(kg) | 回数 | セット | 総挙上(kg) | 有酸素(分) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

- 日付はアプリと同じく午前4時で切り替わります（深夜のトレーニングは前日扱い）。体重の日付と突き合わせるために使います。
- 重量は単位の設定にかかわらず kg です。
- 体重タブ（A列が日付、B列が体重）との集計例:
  - その日の総挙上: `=SUMIFS('筋トレ記録'!I:I, '筋トレ記録'!C:C, A2)`
  - その日の有酸素: `=SUMIFS('筋トレ記録'!J:J, '筋トレ記録'!C:C, A2)`
- 行は記録IDで探して上書きします。シートを手で書き換えても、その記録が次に変わったときにアプリの内容で上書きされます。

## 2. かんたん連携: 数式を貼るだけ

1. 設定 →「スプレッドシート連携」→「かんたん連携: 数式を貼るだけ」→「数式を作る」。
2. 「数式をコピー」を押す。
3. シートに空いたタブを作り、A1 に貼る。全部の記録が上と同じ形の表で入ります。

- Google の許可は要りません。
- Google が自動で読み直すので、リアルタイムではありません。更新の間隔は Google 次第で、1時間ほどと言われていますが未確認です。
- 数式の URL を知っている人は記録を読めます。人に見せてしまったら「URLを作り直す」を押してください。古い URL はすぐ使えなくなります。

## 3. 上級者向け: Apps Script

シートに付けたスクリプトのウェブアプリへ、REPS のサーバーが記録を送ります。シート側の処理を自分で変えたい人向けです。

1. シートで「拡張機能」→「Apps Script」を開き、下のコードを貼る。
2. コード2行目の `ここに合言葉` を、推測されにくい長い文字列（英数字20文字以上など）に書き換えて保存する。
3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」、「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」でデプロイする。「このアプリは Google で確認されていません」と出たら、「詳細」→「（プロジェクト名）（安全ではないページ）に移動」で進めます。自分で作ったスクリプトなので問題ありません。
4. `/exec` で終わる URL を、REPS の「上級者向け: Apps Script で連携」に合言葉と一緒に入れて「保存してテスト送信」。
5. 過去の記録も入れるときは「全件を送り直す」。

- コードを書き換えたら「デプロイを管理」→ 編集 →「新バージョン」で更新しないと反映されません。
- URL と合言葉は、公開の場所やチャットに貼らないでください。

```js
// REPS → このスプレッドシート。記録IDで行を探して、追加・更新・削除する。
const TOKEN = "ここに合言葉"; // REPS の設定に入れる合言葉と同じ文字列にする
const SHEET = "筋トレ記録";
const HEAD = ["記録ID", "日時", "日付", "種目", "部位", "重量(kg)", "回数", "セット", "総挙上(kg)", "有酸素(分)"];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (!TOKEN || TOKEN === "ここに合言葉" || body.token !== TOKEN) return reply({ ok: false, error: "unauthorized" });

  // 同時に届いても行が重ならないように、1件ずつ処理する。
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheetOf();
    const rowOf = new Map();
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach((r, i) => rowOf.set(String(r[0]), i + 2));

    for (const log of body.upserts || []) {
      const row = toRow(log);
      const at = rowOf.get(log.id);
      if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
      else {
        sh.appendRow(row);
        rowOf.set(log.id, sh.getLastRow());
      }
    }
    // 下の行から消すと、上の行番号がずれない。
    const gone = (body.deletes || []).map((id) => rowOf.get(id)).filter(Boolean).sort((a, b) => b - a);
    for (const r of gone) sh.deleteRow(r);
    return reply({ ok: true, upserts: (body.upserts || []).length, deletes: gone.length });
  } finally {
    lock.releaseLock();
  }
}

function sheetOf() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

function toRow(l) {
  return [l.id, new Date(l.at), l.day, l.name, l.category, l.weightKg, l.reps, l.sets, l.volumeKg, l.cardioMin];
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

## 運営者向け: 「Googleで連携」を有効にする設定

「Googleで連携」は、サーバーに次の設定があるときだけ表示されます。なければ「かんたん連携」と「上級者向け」だけが出ます。

1. Google Cloud コンソールで、ログインに使っている OAuth クライアントのプロジェクトを開く。
2. 「API とサービス」→「ライブラリ」で **Google Sheets API** と **Google Picker API** を有効にする。
3. 「OAuth 同意画面」→ スコープに `https://www.googleapis.com/auth/drive.file` を追加する。
4. 「認証情報」→ OAuth クライアント（ウェブアプリケーション）→「承認済みのリダイレクト URI」に `https://rep-timer.cogniflow-api.workers.dev/api/sheets/google/callback` を追加する。
5. 「認証情報」→「認証情報を作成」→「API キー」を作り、「アプリケーションの制限: ウェブサイト」で `https://rep-timer.cogniflow-api.workers.dev/*` だけに、「API の制限」で Google Picker API だけに絞る。
6. サーバーに設定する。
   ```
   npx wrangler secret put GOOGLE_CLIENT_SECRET   # OAuth クライアントのシークレット
   npx wrangler secret put GOOGLE_PICKER_KEY      # 5 の API キー
   ```
   `GOOGLE_PICKER_KEY` がないときは「新しいシートを作る」だけが出ます。

- 同意画面が「テスト」のままだと、登録したテストユーザーしか連携できません。一般公開するには「本番環境に公開」が必要です。`drive.file` は機密性の高いスコープに当たらないため重い審査は不要の見込みですが、未確認です。同意画面の画面に出る案内で確認してください。

## 実装のしくみ

- 連携先は D1 の `sheet_links`（`migrations/0003`, `0004`）に利用者ごとに保存します。`kind` が `google` か `script` です。
- Google の refresh token は、サーバーの `SESSION_SECRET` から作った鍵で AES-GCM 暗号化して保存します。
- 同意画面の往復は、署名つきの state と Cookie の nonce を照合して、なりすましを防ぎます。
- API（いずれもログインが必要。`/api/feed/…` だけは URL の合言葉で読む）
  - `GET /api/sheets` 状態 / `DELETE /api/sheets` 解除 / `POST /api/sheets/resend` 全件の送り直し
  - `GET /api/sheets/google/start?mode=new|pick` → Google の同意画面 → `GET /api/sheets/google/callback`
  - `GET /api/sheets/google/token` Picker 用の短期トークン / `POST /api/sheets/google/select` 選んだシートを登録
  - `GET|POST|DELETE /api/sheets/feed` 数式用 URL の確認・作成（作り直し）・停止 / `GET /api/feed/{token}.csv`
  - `PUT /api/sheets` Apps Script の保存とテスト送信
- `PUT /api/data` で保存の前後を比べ、増えた・変わった・削除された記録だけを、応答のあとに送ります（`waitUntil`）。
- Sheets API の書き込みは `worker/googleSheets.ts`、行・CSV の変換は `src/lib/sheetRows.ts` です。
- テストでは `worker/fakeGoogle.ts`（Google の代わり）を使い、同意・新規作成・既存シートの選択・追加・更新・削除・解除・数式 URL を単体テストと E2E で確かめています。本物の Google との接続は、上の設定のあとに実機で確認が必要です。
