# ミルレコ — 開発用ドキュメント

このドキュメントを読めば、ミルレコをゼロから再現できます。設計思想・技術スタック・ファイル構成・データモデル・API仕様・実装の要点をすべて記載しています。

---

## 0. 設計思想（Core Philosophy）

| 原則 | 内容 |
|---|---|
| **現場第一主義（Field First）** | ログイン不要。アプリを開いたら即録音できる。「音声」「テキスト」を対等なタブUIで配置し、片手操作で完結する |
| **プライバシー・バイ・デザイン** | 音声ファイルは一切保存しない。AIプロンプトで固有名詞を「A氏/B氏」に置換し、匿名化済みのSBAR結果テキストのみを保存する |
| **止まらないアプリ（Offline First）** | テキスト入力はオフライン時にIndexedDBへ一時保存。電波復帰時に自動でAI解析を再開する（音声はオンライン必須） |
| **道具としてのUI（Tool, not App）** | 不要な装飾を排除。録音中は同心円アニメーションで「ちゃんと声を拾えている」安心感を提供する |

---

## 1. 技術スタック

| 分類 | ライブラリ / バージョン | 選定理由 |
|---|---|---|
| フレームワーク | Next.js 14（App Router） | SSRなし・Edge対応・PWA構築が容易 |
| 言語 | TypeScript 5 | `any`禁止・Zod連携で型安全性を徹底 |
| スタイル | Tailwind CSS 3 | ユーティリティクラスで高速UI構築 |
| アニメーション | Framer Motion 11 | 同心円ビジュアライザーの `transition` 制御 |
| アイコン | Lucide React 0.400 | 医療UIに馴染むシンプルなアイコンセット |
| クライアントDB | Dexie.js 4（IndexedDBラッパー） | スキーマバージョニング・オフライン保存 |
| AIエンジン | Google Gemini 3 Flash Preview | 音声ファイル直接入力対応・無料枠が広い |
| バリデーション | Zod | APIリクエスト/レスポンスのスキーマ検証 |
| デプロイ | Vercel + next-pwa | PWA・CDNエッジ配信 |

---

## 2. ファイル構成

```
mirureco/
├── app/
│   ├── layout.tsx              # ルートレイアウト（PWA viewport設定）
│   ├── globals.css             # グローバルスタイル
│   ├── page.tsx                # メイン画面（入力・解析・結果・ミニ履歴）
│   ├── history/
│   │   └── page.tsx            # 履歴一覧画面（最新20件・削除）
│   └── api/
│       └── analyze/
│           └── route.ts        # POST /api/analyze（Gemini呼び出し）
├── components/
│   ├── CopyButton.tsx          # コピーボタン（共有・useEffectでタイマー管理）
│   └── ReportCard.tsx          # 履歴カード（展開・削除・SBAR表示）
├── lib/
│   ├── db.ts                   # Dexie.jsスキーマ定義・CRUD関数
│   └── sbar.ts                 # SBAR定数・ユーティリティ（全コンポーネント共有）
├── public/
│   └── manifest.json           # PWAマニフェスト
├── .env.local                  # GEMINI_API_KEY（.gitignore対象）
├── .env.local.example          # 環境変数のサンプル
└── README.md                   # GitHub用ドキュメント
```

---

## 3. 環境変数

`.env.local` に以下を設定する。

```env
GEMINI_API_KEY=your_api_key_here
```

取得先: [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## 4. データモデル

### 4.1 型定義（`lib/db.ts`）

```typescript
// SBAR の各セクション
interface SbarContent {
  S: string;  // 状況（Situation）: 現在の事実・バイタル・症状
  B: string;  // 背景（Background）: 既往歴・入院理由・治療内容
  A: string;  // 評価（Assessment）: 緊急度・問題の深刻度判断
  R: string;  // 提案（Recommendation）: 医師への連絡・具体的な依頼事項
}

// IndexedDB の1レコード
interface Report {
  id?: number;                    // 自動採番（主キー）
  createdAt: Date;                // 作成日時
  sbar: SbarContent | null;       // null = pending（未解析）
  shortSummary: string;           // そのまま読み上げられる1文
  status: 'pending' | 'completed';
  pendingText?: string;           // オフライン時のテキスト一時保持のみ
                                  // ※音声データは保存しない
}
```

### 4.2 IndexedDB スキーマ（Dexie.js）

```typescript
db.version(4).stores({ reports: '++id, createdAt, status' })
```

- インデックス: `id`（主キー）、`createdAt`（時系列取得）、`status`（pending検索）
- 保持件数: 最新20件（`trimHistory()` で自動削除）
- マイグレーション履歴: v1→v4。v4でオフライン音声保存を廃止

### 4.3 公開 CRUD 関数

| 関数 | 説明 |
|---|---|
| `addReport(sbar, shortSummary)` | 解析完了レコードを保存 |
| `addPendingReport(text)` | オフライン時のテキストを pending で保存 |
| `updateReportCompleted(id, sbar, shortSummary)` | pending → completed に更新 |
| `getPendingReports()` | pending 一覧を取得（電波復帰時の再送用） |
| `getAllReports()` | createdAt 降順で全件取得 |
| `deleteReport(id)` | 1件削除 |

---

## 5. API エンドポイント

### `POST /api/analyze`

#### リクエスト（Zod discriminatedUnion で型を分離）

```typescript
// テキスト入力
{ type: 'text', text: string }

// 音声入力
{ type: 'audio', audioBase64: string, mimeType: string }
```

#### レスポンス（成功 200）

```json
{
  "sbar": {
    "S": "患者A氏の血圧が158/96に上昇し...",
    "B": "高血圧の既往あり、降圧剤を服用中...",
    "A": "血圧コントロール不良のリスクがある...",
    "R": "主治医B氏への報告と追加降圧剤の指示を要請..."
  },
  "shortSummary": "患者A氏の血圧上昇（158/96）について主治医へ報告が必要です。"
}
```

#### レスポンス（エラー）

| ステータス | 理由 |
|---|---|
| 400 | リクエストボディが Zod スキーマ不一致 |
| 502 | Gemini API エラー、またはレスポンスが Zod スキーマ不一致 |
| 503 | `GEMINI_API_KEY` 未設定（内部構造を外部に露出しない） |

#### Gemini 呼び出しの詳細

- モデル: `gemini-3-flash-preview`
- API バージョン: `v1beta`
- 安全フィルタ: `HARASSMENT` / `HATE_SPEECH` → `BLOCK_NONE`（医療用語の誤検知を防ぐ）
- プロンプト構造: **システムプロンプトとユーザー入力を別パートに分離**してプロンプトインジェクションを抑制

```typescript
const parts = body.type === 'audio'
  ? [{ text: SYSTEM_PROMPT }, { inlineData: { mimeType, data: audioBase64 } }]
  : [{ text: SYSTEM_PROMPT }, { text: `\n\n入力内容：\n${body.text}` }];
```

---

## 6. AIシステムプロンプト（`app/api/analyze/route.ts`）

```
あなたは医療・介護現場の申し送りを整理するAIです。

【匿名化ルール】
患者名・利用者名・スタッフ名・施設名など全ての固有名詞を「A氏」「B氏」のように
アルファベット＋氏に必ず置換してください。

【SBAR分類ルール】
- S（状況/Situation）: 現在起きていること。バイタルサインの数値（血圧・脈拍・体温・
  SpO2など）、症状、患者の訴えなど「今の事実」のみを記載。過去の情報は含めない。
- B（背景/Background）: 既往歴、入院・利用理由、現在の治療内容、内服薬、アレルギー
  など「患者の背景情報」を記載。
- A（評価/Assessment）: スタッフとしての問題の深刻度・緊急性の評価。「○○のリスクが
  ある」「○○の可能性が高い」など判断・アセスメントを含む。
- R（提案/Recommendation）: 医師への連絡・追加検査・投薬変更・観察強化・体位変換など
  「具体的に次に何をすべきか」の依頼事項を記載。

【出力ルール】
- 冗長な表現を省き、事実と判断を簡潔に記載する。
- shortSummaryは医師や次のシフトスタッフにそのまま読み上げられる1文にする。

必ず以下のJSONフォーマットのみを返してください（余分なテキストや```は不要）:
{
  "sbar": { "S": "...", "B": "...", "A": "...", "R": "..." },
  "shortSummary": "..."
}
```

---

## 7. 状態管理（`app/page.tsx`）

### アプリ状態

```typescript
type AppState = 'idle' | 'recording' | 'analyzing' | 'error';
type InputMode = 'voice' | 'text';
```

### 状態遷移

```
idle ──[マイクタップ]──▶ recording ──[停止]──▶ analyzing ──[成功]──▶ idle（結果表示）
 ▲                                                          └─[失敗]──▶ error
 └──────────────────[「もう一度試す」 / handleRetry]──────────────────────┘

idle ──[テキスト入力→「整理する」]──▶ analyzing（同上）
```

### 主な State / Ref

| 変数 | 種別 | 役割 |
|---|---|---|
| `appState` | state | 画面全体の状態制御 |
| `inputMode` | state | タブ切り替え（voice / text） |
| `result` | state | 解析済みの SBAR + 1文要約 |
| `history` | state | IndexedDB から取得した履歴一覧 |
| `isSyncing` | state | オフライン再送中のUI表示 |
| `isSyncingRef` | ref | `retryPending` の多重呼び出し防止フラグ |
| `bars` | state | 音声ビジュアライザー用の周波数データ（5本） |
| `mediaRecorderRef` | ref | MediaRecorder インスタンス保持 |
| `animFrameRef` | ref | requestAnimationFrame ID（クリーンアップ用） |

---

## 8. オフライン対応フロー

### オンライン時

```
入力（音声/テキスト）
  → POST /api/analyze
  → addReport(sbar, shortSummary)  // completed で保存
  → setResult() / setHistory()
```

### オフライン時（テキストのみ）

```
テキスト入力
  → addPendingReport(text)  // status='pending' で保存
  → syncNotice 表示（「通信待ちで保存しました」）
```

### 電波復帰時

```
window 'online' イベント
  → retryPending()  // isSyncingRef でガード（多重呼び出し防止）
      → getPendingReports()
      → for each pending: POST /api/analyze
      → updateReportCompleted(id, sbar, shortSummary)
  → setHistory()
  → syncNotice 表示（「X件の解析が完了しました」）
```

> **注意**: 音声データはプライバシー保護のため保存しない。オフライン時に音声録音しようとした場合はエラーメッセージを表示し、テキスト入力への切り替えを促す。

---

## 9. 音声ビジュアライザー実装

録音中、`AudioContext` + `AnalyserNode` で周波数データを取得し、3つの同心円にマッピング。

```typescript
const rings = [
  { level: high, scaleMin: 1.70, scaleRange: 0.60 },  // 外リング（高域）
  { level: mid,  scaleMin: 1.40, scaleRange: 0.50 },  // 中リング（中域）
  { level: low,  scaleMin: 1.10, scaleRange: 0.40 },  // 内リング（低域）
];
// level: 0〜1 の正規化済み周波数強度
// scale = scaleMin + level * scaleRange  で CSS transform: scale() に適用
```

- FFT サイズ: 256
- スムージング: 0.8（急激な変化を抑制）
- 更新: `requestAnimationFrame`（75ms 相当）
- クリーンアップ: `cancelAnimationFrame` + `AudioContext.close()`

---

## 10. コンポーネント設計

### `components/CopyButton.tsx`

```typescript
// useEffect でタイマーを管理（連打によるメモリリーク防止）
useEffect(() => {
  if (!copied) return;
  const timer = setTimeout(() => setCopied(false), 2000);
  return () => clearTimeout(timer);
}, [copied]);
```

### `components/ReportCard.tsx`

- `SbarDetail` サブコンポーネントに `sbar: SbarContent`（non-nullable）を渡すことで非null アサーション（`!`）を排除
- 削除確認フロー: 1回目クリック → `confirming=true`、2回目クリック → 削除実行 → `confirming=false`

### `lib/sbar.ts`（全コンポーネント共有）

```typescript
export const SBAR_KEYS = ['S', 'B', 'A', 'R'] as const satisfies ReadonlyArray<keyof SbarContent>;
export const SBAR_LABELS: Record<keyof SbarContent, string>       // フルラベル（結果カード）
export const SBAR_SHORT_LABELS: Record<keyof SbarContent, string> // 短縮ラベル（履歴カード）
export function sbarToText(sbar: SbarContent): string              // コピー用テキスト生成
```

---

## 11. 型安全性の方針

- **`any` 禁止**: コードベース全体で `any` 使用ゼロ（`tsc --noEmit` で継続確認）
- **非null アサーション（`!`）禁止**: サブコンポーネントへの props 渡しで型を絞り込む
- **Zod バリデーション**: APIの入口（リクエスト）と出口（Geminiレスポンス）の両方を検証
- **Discriminated Union**: APIリクエストを `type: 'text' | 'audio'` で型レベルに分離

---

## 12. UIカラーパレット

| 用途 | カラーコード |
|---|---|
| 背景 | `#F5F5DC`（温かみのあるベージュ） |
| メインカラー | `#FF8C00`（視認性の高いオレンジ） |
| メインホバー | `#E07800` |
| 録音停止ボタン | `red-500` |
| 成功 | `green-600` |
| 警告（オフライン） | `yellow-300` / `yellow-800` |
| エラー | `red-500` |
| 同期中 | `blue-200` / `blue-700` |

---

## 13. ローカル開発手順

```bash
# セットアップ
git clone <repo>
cd mirureco
npm install
cp .env.local.example .env.local
# .env.local を編集して GEMINI_API_KEY を設定

# 開発サーバー起動
npm run dev
# → http://localhost:3000

# 型チェック
npx tsc --noEmit

# 本番ビルド確認
npm run build && npm start
```

---

## 14. 今後の拡張候補（未実装）

| 機能 | 概要 | 備考 |
|---|---|---|
| 緊急度AI分類 | SBAR解析時に「緊急/通常/情報共有」を自動判定 | DB・UI変更が必要 |
| タグ・フィルタ | 「転倒」「バイタル」「投薬」等のタグをAIが自動付与 | 履歴フィルタと連動 |
| 読了確認 | 引き継ぎ先スタッフの確認機能 | クラウド化が前提 |
