# 体重管理スプレッドシートとの同期 手順書

REPS の筋トレ記録を、自分で作る体重管理（PFC）の Google スプレッドシートに自動で書き込むための方法と手順です。
アプリ側の同期は実装済みです（方法A）。使い始めるには、4 の手順でシート側の準備をして、REPS の「設定」→「スプレッドシート連携」に URL と合言葉を入れます。

## 1. 方法の比較

| 方法 | しくみ | 反映までの時間 | 準備 | 向いている場合 |
| --- | --- | --- | --- | --- |
| **A. Apps Script のウェブアプリに送る（推奨）** | アプリがサーバーに同期した直後に、サーバーがスプレッドシート付属の Apps Script に記録を送り、行を追加・更新する | 記録してから数秒 | スプレッドシート側にスクリプトを貼って公開するだけ。Google Cloud の設定や鍵ファイルは不要 | 自分のシート1つと同期したい |
| B. Google Sheets API をサーバーから直接呼ぶ | サービスアカウントの鍵でサーバーが Sheets API を呼ぶ | 記録してから数秒 | Google Cloud プロジェクト、API の有効化、サービスアカウントの鍵の管理が必要 | 多数の利用者に同期機能を提供したい |
| C. スプレッドシートが定期的に取りに来る | Apps Script の時間主導トリガーで、REPS の書き出し用 API を定期的に読む | トリガーの間隔次第で、リアルタイムではない | A と同程度 | 即時性が不要 |

リアルタイムに近く、準備が最も少ないので **A** を勧めます。
書き込み先は自分の Google アカウントのスプレッドシートで、REPS のサーバーに Google の鍵を置く必要もありません。

## 2. データの流れ（方法A）

```
スマホの REPS
  │ 記録・削除すると約1.2秒後に同期（今のしくみ）
  ▼
Cloudflare Worker  PUT /api/data
  │ 前回の保存内容と比べて、増えた記録・変わった記録・消えた記録を出す
  │ 応答を返したあとで送る（waitUntil）。アプリの操作は遅くならない
  ▼
Apps Script ウェブアプリ（スプレッドシートに付属）
  │ 合言葉を確認し、記録IDで行を探して追加・更新・削除
  ▼
「筋トレ記録」シート → 体重シートと日付で突き合わせて集計
```

- 記録には一意の ID があるので、同じ記録が二度送られても行は増えません。
- 削除はアプリの削除リスト（deletedLogs）から分かるので、シートの行も消せます。
- 体重のデータはシートが持ち、筋トレはシートへの一方向です。シートの体重をアプリに表示する逆方向は、手順の7で扱います。

## 3. シートの形

タブ「筋トレ記録」は Apps Script が自動で作ります。1行が1記録です。

| 記録ID | 日時 | 日付 | 種目 | 部位 | 重量(kg) | 回数 | セット | 総挙上(kg) | 有酸素(分) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

- 日付はアプリと同じく午前4時で切り替わります（深夜のトレーニングは前日扱い）。体重の日付と突き合わせるために使います。
- 重量は単位の設定にかかわらず kg です。アプリの内部が kg なので換算はしません。
- 体重のタブとの集計例です。体重タブは A列が日付、B列が体重とします。
  - その日の総挙上: `=SUMIFS('筋トレ記録'!I:I, '筋トレ記録'!C:C, A2)`
  - その日の有酸素: `=SUMIFS('筋トレ記録'!J:J, '筋トレ記録'!C:C, A2)`

## 4. スプレッドシート側の準備（ご自身で行う手順）

1. 体重管理のスプレッドシートを開き、「拡張機能」→「Apps Script」を開く。
2. 下のコードを貼り付けて保存する。
3. 「プロジェクトの設定」→「スクリプト プロパティ」に `TOKEN` を追加し、推測されにくい長い文字列を値にする。これが REPS との合言葉です。
4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選び、「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」でデプロイする。初回はシートへのアクセス許可を求められるので承認する。
5. 表示されたウェブアプリの URL（`/exec` で終わる）を控える。

「全員」にしても、合言葉を知らない送信は書き込まれません。
URL と合言葉は、公開のリポジトリやチャットに貼らないでください。

```js
// REPS → このスプレッドシート。記録IDで行を探して、追加・更新・削除する。
const SHEET = "筋トレ記録";
const HEAD = ["記録ID", "日時", "日付", "種目", "部位", "重量(kg)", "回数", "セット", "総挙上(kg)", "有酸素(分)"];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!token || body.token !== token) return reply({ ok: false, error: "unauthorized" });

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

## 5. REPS 側の設定と、実装のしくみ

**設定（ご自身で行う手順）**

1. REPS に Google でログインする。同期はログイン中だけ動きます。
2. 右上のアカウント →「スプレッドシート連携」に、4 で控えたウェブアプリの URL と合言葉を入れて「保存してテスト送信」を押す。
3. 「連携中」と出れば完了です。これまでの記録もシートに入れたいときは「全件を送り直す」を押します。何度押しても記録IDで上書きされるので、行は重複しません。
4. エラーが出たら、表示された内容に沿って URL・合言葉・デプロイの「アクセスできるユーザー」を見直してください。

**実装のしくみ**

- 連携先は D1 の `sheet_links` テーブル（`migrations/0003_sheet_links.sql`）に、利用者ごとに保存します。
- API は次の4つです。いずれもログインが必要です。
  - `GET /api/sheets`: 状態
  - `PUT /api/sheets`: 保存とテスト送信
  - `DELETE /api/sheets`: 解除
  - `POST /api/sheets/resend`: 全件の送り直し
- URL は `https://script.google.com/macros/s/…/exec` の形だけを受け付けます。記録を他の宛先へ送れないようにするためです。
- `PUT /api/data` で保存の前後を比べ、増えた記録・変わった記録・新しく削除された記録だけを、応答のあとに送ります（`waitUntil`）。
- 行への変換と差分の計算は `src/lib/sheetRows.ts` にあり、単体テストがあります。
- 送信に失敗すると、設定画面に「エラー」として理由を出します。成功すると「最後の送信」の日時が更新されます。
- ローカルのテストでは、Apps Script の代わりに `/api/dev/sheet` が受け取り、追加・更新・削除・送り直しを E2E で確かめています。

## 6. 注意点

- **反映の速さ:** アプリはログイン中だけサーバーに同期します。ログインしていない記録や電波がないときの記録は、次の同期で送られます。
- **Apps Script の制限:** 1日の実行回数や実行時間に上限があります。具体的な値は Google の公式ページ「Apps Script のサービスの割り当て」で確認してください。個人の記録の量なら問題にならない見込みですが、未確認です。
- **送信の頻度:** 1回の同期で差分をまとめて送るので、セットを続けて記録しても送信は数回で済みます。
- **シートの直接編集:** シートを手で書き換えても、アプリには戻りません。次にその記録が変わったときに、アプリの内容で上書きされます。

## 7. 逆方向: 体重をアプリに表示する（任意・次の段階）

- 体重タブを編集したら、Apps Script のインストール型「編集時」トリガーで REPS の `POST /api/body-weight` に送る。送るときに合言葉を付ける。
- REPS はそれを日付ごとに保存して、カレンダーやグラフに体重を重ねて表示する。
- 先に 1〜5 の筋トレ → シートを完成させ、使い心地を見てから進めるのが安全です。
