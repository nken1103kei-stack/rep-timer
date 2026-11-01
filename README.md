# REPS

インターバルタイマー付き筋トレメモ。モバイルファーストのPWAで、後からAndroidアプリ化できる構成にしています。

## 操作

| 操作 | 動作 |
| --- | --- |
| 名言カード（最上部） | 開くたびに「本日の筋トレ偉人の名言」（フィクションのパロディ21本）をランダム表示。タップで別の名言に切り替え |
| ＋ | 種目ライブラリ（肩・胸・背中・腕・脚・腹筋・有酸素・その他）から複数選んで追加。部位ごとに自分の種目も登録できる。メニューは空の状態から始まり、＋で追加したものだけが並ぶ |
| ライブラリを左右にフリック | 部位を切り替え |
| メニューをタップ | そのメニューを選択して記録シートを開く。有酸素を選ぶとタイマーがそのメニューの「運動○分・休憩○分（0分可）× セット」に連動する（タイマーチップか「×」で解除）。記録シートでは重さ・回数をキーボードで直接入力でき（入力欄は桁数に合わせて広がり、キーボードに隠れない位置まで自動でスクロール）、1セットごとに重さと回数を別々に記録（セットの追加・削除可）。有酸素は運動分・休憩分・セット数。前回の記録が初期値になる |
| 一言メモ | メニューごとに60文字までのメモ（フォームのコツ・マシン設定など）。記録シートかメニュー編集で書くと、メニューカードに表示される。メニュー名は省略せず全文表示 |
| ⏱（記録シートの各セット） | 休憩タイマーを「設定」状態で開く（すぐには始まらない）。1分〜5分のプリセットと ±15秒で時間を決めて「スタート」。実行中は一時停止・再開・停止ができる |
| メニューを左にフリック | 削除（トーストから元に戻せる） |
| グリップ（⋮⋮）をドラッグ | 並べ替え |
| タイマーチップをタップ | タイマーを選択。選択中のチップをもう一度タップすると編集 |
| ▶ | 選んだメニューとタイマーで開始。終了後にそのまま記録。■で途中停止して記録へ。実行中はタブ名に残り時間、画面に終了時刻を表示。「裏でも通知」をオンにすると、アプリを裏に回しても通知で残り時間と終了時刻が見える（iPhone はホーム画面に追加したアプリで iOS 16.4 以降） |
| 履歴を左にフリック | 記録を削除 |
| シートのハンドルを下にドラッグ | シートを閉じる |
| 📅（右上） | カレンダー。日ごとの履歴、月間サマリー（日数・セット・ボリューム・有酸素・部位の内訳）。左右フリックで月移動 |
| 共有ボタン | メニュー見出しの「今日」ボタンで今日やった内容を共有。カレンダーからはその日／月間サマリーも共有（共有シート非対応ならクリップボードへ） |
| 👤 → 重量の単位 | kg / lbs 切り替え（内部は kg で保存するので切り替えても記録は変わらない） |

部位ごとの色: 肩=アンバー、胸=ピンク、背中=ブルー、腕=パープル、脚=グリーン、腹筋=イエロー、有酸素=ティール、その他=グレー

ログインしなくても記録機能はすべて使えます（端末内に保存）。Googleでログインするとクラウドに同期されます。

## プラン

| | 無料 | Pro（月額サブスク） |
| --- | --- | --- |
| 記録・履歴・カスタム種目・カレンダー・共有 | ○ 無制限 | ○ |
| CSV 書き出し / 読み込み（Strong・Hevy・FitNotes 対応） | ○ | ○ |
| 広告 | あり（音の出ないバナーのみ。タイマー画面には出ない） | なし |
| セット種類（W/N/D）別の休憩タイマー（休憩中も次セットとプレートを表示） | – | ○ |
| スーパーセットタイマー（A → 移動 → B → 本休憩） | – | ○ |
| テンポ・メトロノーム（下ろす/止める/挙げる/締める）と TUT | – | ○ |
| 部位ヒートマップ・推定1RMグラフ | – | ○ |

Pro は Google アカウントに紐づきます。決済は Stripe Checkout、解約は Stripe のカスタマーポータルから行い、Webhook で D1 の `subscriptions` に反映します。

## 構成

```
src/            React フロントエンド
  lib/timer.ts    タイマーエンジン（純粋関数）
  lib/catalog.ts  部位・色・種目ライブラリ・単位換算
  lib/stats.ts    集計・表示フォーマット・共有テキスト
  lib/store.ts    データストア（localStorage 永続化）
  lib/sync.ts     認証とクラウド同期・プラン状態
  lib/csv.ts      CSV 書き出し / 読み込み
  lib/plates.ts   プレート計算
  lib/analytics.ts 推定1RM・部位別セット数
worker/         Cloudflare Worker（/api/*）
  billing.ts      Stripe 連携（Checkout・ポータル・Webhook 署名検証）
migrations/     D1 スキーマ
tests/unit      Vitest
tests/e2e       Playwright（Pixel 7 エミュレーション）
```

## 開発

```bash
npm install
npm run db:migrate:local
npm run dev          # http://localhost:5173（フロントと Worker を同時に起動）
npm test             # ユニットテスト
npm run e2e          # E2E テスト
```

`.dev.vars` に `SESSION_SECRET=...` を置いてください（Git には含めません）。
ローカルで課金の流れを試すときは `.dev.vars` に `DEV_MODE=1` を追加します。localhost からのアクセスに限り、Stripe を使わずに「登録 → Pro → 解約」を再現できます（本番では絶対に設定しないでください）。

## デプロイ

```bash
npx wrangler d1 create rep-timer-db        # 出力された database_id を wrangler.jsonc に設定
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Google ログインを有効にするには、Google Cloud Console で「OAuth クライアント ID（ウェブアプリケーション）」を作成し、承認済みの JavaScript 生成元にデプロイ先 URL（と `http://localhost:5173`）を登録して、そのクライアント ID を `wrangler.jsonc` の `GOOGLE_CLIENT_ID` に設定して再デプロイします。クライアントシークレットは不要です。

### Pro（Stripe）を有効にする

1. Stripe ダッシュボードで商品「REPS Pro」と月額の価格（例: 380円）を作成し、価格 ID（`price_...`）を控える
2. 「開発者 → Webhook」でエンドポイント `https://<デプロイ先>/api/billing/webhook` を追加し、イベント `checkout.session.completed`・`customer.subscription.updated`・`customer.subscription.deleted` を選んで署名シークレット（`whsec_...`）を控える
3. 「設定 → Billing → カスタマーポータル」を有効にする（解約・支払い方法の変更用）
4. 以下を設定して再デプロイ

```bash
npx wrangler secret put STRIPE_SECRET_KEY       # sk_live_...（まずは sk_test_... で確認）
npx wrangler secret put STRIPE_PRICE_ID
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npm run deploy
```

3つが揃うまでアプリの登録ボタンは「準備中」と表示されます。

### 製作者アカウントを Pro にする

製作者の Google アカウントは課金なしで Pro を使えます。メールアドレスはコードに書かず、シークレットに登録します（複数はカンマ区切り）。

```bash
npx wrangler secret put OWNER_EMAILS
```表示価格は `wrangler.jsonc` の `vars` に `PRO_PRICE_LABEL`（例: `"月額380円"`）で変更できます。

### 広告（Google AdSense）を有効にする

AdSense の審査に通ったら、`wrangler.jsonc` の `vars` に `ADSENSE_CLIENT`（`ca-pub-...`）と `ADSENSE_SLOT`（広告ユニット ID）を設定して再デプロイします。未設定の間は「Pro なら広告なし」の自社バナーが表示されます。

## 技術選定の理由

| 技術 | 理由 |
| --- | --- |
| **React 19 + TypeScript** | エコシステムが最大で、アニメーション・ジェスチャー系ライブラリが揃っている。Android 化（TWA / Capacitor）でもコードをそのまま使える。型でデータ構造とAPIの食い違いを防ぐ。 |
| **Vite** | 起動・HMR が速く、Cloudflare 公式の Vite プラグインで Worker と同じ dev サーバーに載せられる。 |
| **Tailwind CSS v4** | Liquid Glass のトークン（`glass`・`sheen`・`skeleton` など）を `@utility` で一元定義でき、コンポーネント側はクラスを並べるだけで済む。未使用 CSS は出力されない。 |
| **Motion（旧 Framer Motion）** | フリック（`drag="x"`）、並べ替え（`Reorder`）、シートのドラッグで閉じる、レイアウトアニメーション、出入りアニメーションを1つのライブラリで、物理ベースのスプリングで書ける。ジェスチャーとアニメーションが同じ値（MotionValue）を共有するので指に吸い付く。 |
| **Zustand（persist）** | ボイラープレートが少なく、localStorage 永続化が標準で付く。React の外（同期処理）からも購読できるので、変更検知→自動アップロードが簡潔に書ける。 |
| **lucide-react** | 線の太さを揃えられるアイコンセットで、使った分だけバンドルされる。 |
| **Fontsource（Inter / Barlow Condensed）** | フォントを自前配信するので PWA がオフラインでも崩れない。Barlow Condensed のイタリックはスコアボード風でスポーティ。 |
| **Cloudflare Workers + 静的アセット** | フロントと API を1つの Worker で配信し、同一オリジンなので CORS もクッキーの設定も単純。エッジで動くので世界中で速く、無料枠で十分。Pages より新しい推奨構成。 |
| **Hono** | Workers 向けに設計された軽量ルーター。クッキー・ミドルウェアが揃っていて型も効く。 |
| **Cloudflare D1** | Workers から直接使える SQLite。ユーザーとデータの2テーブルで足りる規模に最適。マイグレーションも wrangler で管理できる。 |
| **Google Identity Services + jose** | 「Google ログインのみ」を最小構成で実現。ブラウザで受け取った ID トークンを Worker が Google の公開鍵（JWKS）で検証するだけなので、クライアントシークレットや OAuth のリダイレクト処理が要らない。検証後は HttpOnly クッキーの自前セッション（HS256 JWT）にしてトークンを JS に残さない。 |
| **オフラインファースト + 最終書き込み優先の同期** | ジムは電波が弱いことが多いので、操作は常に端末内で完結させる。データは1ユーザー数百KB以内なので、ユーザーごとに1つの JSON ドキュメントを `updatedAt` 比較で同期するのが最も壊れにくい。古いスナップショットがサーバーの新しいデータを上書きしないよう SQL 側でも条件を付けている。 |
| **タイムスタンプ方式のタイマー** | `setInterval` で1秒ずつ減らす方式はバックグラウンドで遅れる。開始時刻からの経過時間で状態を計算する純粋関数にしたので、正確で、ユニットテストもしやすい。Wake Lock で画面消灯を防ぎ、Web Audio のビープとバイブで知らせる。 |
| **手書き Service Worker + Web App Manifest** | PWA として「ホーム画面に追加」でき、TWA の前提条件も満たす。プラグイン（vite-plugin-pwa）は依存に既知の脆弱性があったため使わず、数十行で済む自前実装にした。 |
| **Vitest / Playwright** | Vitest は Vite と設定を共有でき高速。Playwright は実ブラウザ（Chromium、Pixel 7 エミュレーション）でタップ・フリック・ドラッグまで自動テストできる。 |

## Android への移行

1. **TWA（Trusted Web Activity、推奨）**: [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) でこの PWA をそのまま Play ストア用 APK/AAB にできる。中身は Chrome なので Google ログインもそのまま動き、Web を更新すればアプリも更新される。
2. **Capacitor**: 通知・バックグラウンドタイマーなどネイティブ機能が必要になったら `dist/client` を Capacitor で包む。この場合 WebView では Google Identity Services が使えないため、ネイティブの Google Sign-In プラグインで ID トークンを取得して同じ `/api/auth/google` に送る形にする（Worker 側は変更不要）。
