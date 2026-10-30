# REPS

インターバルタイマー付き筋トレメモ。モバイルファーストのPWAで、後からAndroidアプリ化できる構成にしています。

## 操作

| 操作 | 動作 |
| --- | --- |
| ＋ | 種目ライブラリ（肩・胸・背中・腕・脚・腹筋・有酸素・その他）から複数選んで追加。部位ごとに自分の種目も登録できる |
| ライブラリを左右にフリック | 部位を切り替え |
| メニューをタップ | タイマーで使うメニューを選択／解除（有酸素を選ぶとタイマー欄に表示され、終了後は分で記録） |
| メニューを右にフリック | 記録シート（記録・履歴・ベスト・総ボリューム） |
| メニューを左にフリック | 削除（トーストから元に戻せる） |
| グリップ（⋮⋮）をドラッグ | 並べ替え |
| タイマーチップをタップ | タイマーを選択。選択中のチップをもう一度タップすると編集 |
| ▶ | 選んだメニューとタイマーで開始。終了後にそのまま記録 |
| 履歴を左にフリック | 記録を削除 |
| シートのハンドルを下にドラッグ | シートを閉じる |
| 📅（右上） | カレンダー。日ごとの履歴、月間サマリー（日数・セット・ボリューム・有酸素・部位の内訳）。左右フリックで月移動 |
| 共有ボタン | その日のトレーニング／月間サマリーをテキストで共有（共有シート非対応ならクリップボードへ） |
| 👤 → 重量の単位 | kg / lbs 切り替え（内部は kg で保存するので切り替えても記録は変わらない） |

部位ごとの色: 肩=アンバー、胸=ピンク、背中=ブルー、腕=パープル、脚=グリーン、腹筋=イエロー、有酸素=ティール、その他=グレー

ログインしなくても全機能が使えます（端末内に保存）。Googleでログインするとクラウドに同期されます。

## 構成

```
src/            React フロントエンド
  lib/timer.ts    タイマーエンジン（純粋関数）
  lib/catalog.ts  部位・色・種目ライブラリ・単位換算
  lib/stats.ts    集計・表示フォーマット・共有テキスト
  lib/store.ts    データストア（localStorage 永続化）
  lib/sync.ts     認証とクラウド同期
worker/         Cloudflare Worker（/api/*）
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

## デプロイ

```bash
npx wrangler d1 create rep-timer-db        # 出力された database_id を wrangler.jsonc に設定
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Google ログインを有効にするには、Google Cloud Console で「OAuth クライアント ID（ウェブアプリケーション）」を作成し、承認済みの JavaScript 生成元にデプロイ先 URL（と `http://localhost:5173`）を登録して、そのクライアント ID を `wrangler.jsonc` の `GOOGLE_CLIENT_ID` に設定して再デプロイします。クライアントシークレットは不要です。

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
