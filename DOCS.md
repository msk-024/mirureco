# ミルレコ — 開発用ドキュメント

このドキュメントを読めば、ミルレコをゼロから再現できます。設計思想・技術スタック・ファイル構成・データモデル・API仕様・実装の要点をすべて記載しています。

---

## 0. 設計思想（Core Philosophy）

| 原則 | 内容 |
|---|---|
| **現場第一主義（Field First）** | ログイン不要。アプリを開いたら即録音できる。「音声」「テキスト」を対等なタブUIで配置し、片手操作で完結する |
| **プライバシー・バイ・デザイン** | 音声ファイルは一切保存しない。AIプロンプトで固有名詞を「A氏/B氏」に置換し、匿名化済みのSBAR結果テキストのみを保存する |
| **止まらないアプリ（Offline First）** | テキスト入力はオフライン時にIndexedDBへ一時保存。電波復帰時に自動でAI解析を再開する（音声はオンライン必須） |
| **道具としてのUI（Tool, not App）** | 不要な装飾を排除。ネイティブアプリ感覚のボトムナビ・ボトムシートUIで迷わず操作できる |

---

## 1. 技術スタック

| 分類 | ライブラリ / バージョン | 選定理由 |
|---|---|---|
| フレームワーク | Next.js 14（App Router） | SSRなし・Edge対応・PWA構築が容易 |
| 言語 | TypeScript 5 | `any`禁止・Zod連携で型安全性を徹底 |
| スタイル | Tailwind CSS 3 | ユーティリティクラスで高速UI構築 |
| アイコン | Lucide React | 医療UIに馴染むシンプルなアイコンセット |
| クライアントDB | Dexie.js 4（IndexedDBラッパー） | スキーマバージョニング・オフライン保存 |
| AIエンジン | Google Gemini 3 Flash Preview | 音声ファイル直接入力対応・ストリーミングAPI対応 |
| フォームバリデーション | react-hook-form + @hookform/resolvers | 非制御コンポーネントによる高パフォーマンスなフォーム管理 |
| スキーマバリデーション | Zod | APIリクエスト・フォームのスキーマ検証 |
| アイコン生成 | next/og（ImageResponse） | ファビコン・Apple Touch Icon の動的生成 |
| デプロイ | Vercel + next-pwa | PWA・CDNエッジ配信 |

---

## 2. ファイル構成

```
mirureco/
├── app/
│   ├── layout.tsx              # ルートレイアウト（BottomNav・PWA viewport設定）
│   ├── globals.css             # グローバルスタイル（タップ最適化・safe-area・アニメーション）
│   ├── icon.tsx                # ファビコン（32×32）動的生成（next/og）
│   ├── apple-icon.tsx          # Apple Touch Icon（180×180）動的生成（next/og）
│   ├── page.tsx                # 録音画面（入力・ストリーミング解析・ボトムシート）
│   ├── history/
│   │   └── page.tsx            # 履歴一覧画面（最新20件・削除）
│   ├── settings/
│   │   └── page.tsx            # 設定画面（アプリ情報・バージョン表示）
│   └── api/
│       └── analyze/
│           └── route.ts        # POST /api/analyze（Geminiストリーミング・IPレート制限）
├── components/
│   ├── BottomNav.tsx           # 固定ボトムナビゲーション（録音/履歴/設定）
│   ├── CopyButton.tsx          # コピーボタン（共有・フォールバック付き）
│   └── ReportCard.tsx          # 履歴カード（展開・削除・SBAR表示）
├── lib/
│   ├── db.ts                   # Dexie.jsスキーマ定義・CRUD関数
│   └── sbar.ts                 # SBAR定数・ユーティリティ（全コンポーネント共有）
├── public/
│   ├── manifest.json           # PWAマニフェスト（アイコン・テーマカラー）
│   └── rdesign_18249.png       # ナースキャラクター画像
├── global.d.ts                 # CSS モジュールの型宣言
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
| `updateReportCompleted(id, sbar, shortSummary)` | pending → completed に更新（Dexie の `put()` で全置換するため `pendingText` は自動削除） |
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

#### レスポンス（成功 200）— **ストリーミング**

`Content-Type: text/plain; charset=utf-8` で Gemini の生成テキストをチャンク単位でストリーム配信。  
クライアントが全チャンクを受信後、JSON としてパースして利用する。

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
| 429 | IPレート制限超過（`Retry-After` ヘッダーで再試行可能時刻を返す） |
| 502 | Gemini API エラー |
| 503 | `GEMINI_API_KEY` 未設定（内部構造を外部に露出しない） |

#### IPレート制限

デモ公開環境でのAPI使用量を抑制するため、サーバーサイドでIPベースのレート制限を実装している。

```typescript
const RATE_LIMIT_MAX = 5;                    // 1IPあたりの最大リクエスト数
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;   // ウィンドウ: 1時間（ms）
```

- メモリ上の `Map<string, { count, resetAt }>` で管理
- Vercel のサーバレス環境ではコールドスタート時にリセットされる（デモ用途には十分）
- IPは `x-forwarded-for` → `x-real-ip` → `'unknown'` の順に取得

#### Gemini 呼び出しの詳細

- モデル: `gemini-3-flash-preview`
- API バージョン: `v1beta`
- 呼び出し方式: `generateContentStream`（ストリーミング）
- 安全フィルタ: `HARASSMENT` / `HATE_SPEECH` → `BLOCK_NONE`（医療用語の誤検知を防ぐ）
- プロンプト構造: **システムプロンプトとユーザー入力を別パートに分離**してプロンプトインジェクションを抑制

```typescript
const parts = body.type === 'audio'
  ? [{ text: SYSTEM_PROMPT }, { inlineData: { mimeType, data: audioBase64 } }]
  : [{ text: SYSTEM_PROMPT }, { text: `\n\n入力内容：\n${body.text}` }];

const streamResult = await model.generateContentStream(parts);
// ReadableStream でチャンクを逐次配信
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
idle ──[マイクタップ]──▶ recording ──[停止]──▶ analyzing ──[成功]──▶ idle（ボトムシート表示）
 ▲                                                          └─[失敗]──▶ error
 └──────────────────[「もう一度試す」 / 「中止」ボタン]────────────────────┘

idle ──[テキスト入力→「SBARに変換する」]──▶ analyzing（同上）
```

### 主な State / Ref

| 変数 | 種別 | 役割 |
|---|---|---|
| `appState` | state | 画面全体の状態制御 |
| `inputMode` | state | タブ切り替え（voice / text） |
| `result` | state | 解析済みの SBAR + 1文要約 |
| `streamingText` | state | ストリーミング中の累積テキスト（ボトムシートに表示） |
| `pendingCount` | state | オフライン解析待ち件数（バナー表示用） |
| `isSyncing` | state | オフライン再送中のUI表示 |
| `isSyncingRef` | ref | `retryPending` の多重呼び出し防止フラグ |
| `abortCtrlRef` | ref | 解析キャンセル用 AbortController |
| `bars` | state | 音声ビジュアライザー用の周波数データ（12本） |
| `mediaRecorderRef` | ref | MediaRecorder インスタンス保持 |
| `animFrameRef` | ref | requestAnimationFrame ID（クリーンアップ用） |

### フォーム管理（`react-hook-form`）

テキスト入力は `useForm` + `zodResolver` で管理する。

```typescript
const TextInputSchema = z.object({
  text: z.string().min(1, '入力してください').max(1000, '1000文字以内で入力してください'),
});

const { register, handleSubmit, watch, reset } = useForm<TextInputValues>({
  resolver: zodResolver(TextInputSchema),
  defaultValues: { text: '' },
});
```

- `watch('text')` で文字数カウンターとボタン活性制御をリアクティブに実現
- バリデーションエラーは `formErrors.text.message` で表示（AlertCircle アイコン付き）
- 送信後・リセット時に `reset()` でフォームをクリア

---

## 8. ストリーミング解析フロー

### クライアント側（`app/page.tsx`）

```typescript
// 1. AbortController 生成（前回リクエストがあればキャンセル）
abortCtrlRef.current?.abort();
const ctrl = new AbortController();
abortCtrlRef.current = ctrl;

// 2. 60秒タイムアウト設定
const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

// 3. ストリーミング fetch
const res = await fetch('/api/analyze', { ..., signal: ctrl.signal });

// 4. ReadableStream を読み取りながら画面に反映
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let accumulated = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  setStreamingText(accumulated);  // ← ボトムシートに逐次表示
}

// 5. 完了後に JSON パース → 構造化表示に切り替え
const data = JSON.parse(extractJson(accumulated)) as AnalysisResult;
setStreamingText('');
setResult(data);
```

### サーバー側（`app/api/analyze/route.ts`）

```typescript
const streamResult = await model.generateContentStream(parts);

const readable = new ReadableStream({
  async start(controller) {
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (text) controller.enqueue(encoder.encode(text));
    }
    controller.close();
  },
});

return new Response(readable, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
```

### キャンセル処理

「中止」ボタン押下 → `abortCtrlRef.current?.abort()` → fetch が `AbortError` を throw → `catch` で `AbortError` を検知してサイレントリターン（エラー表示なし）

---

## 9. オフライン対応フロー

### オンライン時

```
入力（音声/テキスト）
  → POST /api/analyze（ストリーミング）
  → addReport(sbar, shortSummary)  // completed で保存
  → setResult() でボトムシート表示
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
      → for each pending: POST /api/analyze（ストリーミング）
      → updateReportCompleted(id, sbar, shortSummary)
  → setPendingCount(0)
  → syncNotice 表示（「X件の解析が完了しました」）
```

> **注意**: 音声データはプライバシー保護のため保存しない。オフライン時に音声録音しようとした場合はエラーメッセージを表示し、テキスト入力への切り替えを促す。

---

## 10. 音声ビジュアライザー実装

録音中、`AudioContext` + `AnalyserNode` で周波数データを取得し、12本の縦棒バーにマッピング。

```typescript
const BAR_COUNT = 12;
// 各バーに周波数帯域を割り当てて height % に変換
const next = Array.from({ length: BAR_COUNT }, (_, i) => {
  const idx = Math.floor((i / BAR_COUNT) * usableBins);
  const raw = freqData[idx] / 255;
  smooth[i] += (raw - smooth[i]) * 0.35;  // 指数移動平均でスムージング
  return smooth[i];
});
```

- FFT サイズ: 512（より細かい周波数分解能）
- スムージング: 0.8
- 更新: `requestAnimationFrame`
- クリーンアップ: `cancelAnimationFrame` + `AudioContext.close()`
- 表示: 最小高さ 12%、最大 100%。オレンジの角丸棒（`w-2 rounded-full`）

---

## 11. コンポーネント設計

### `components/BottomNav.tsx`

```typescript
const TABS = [
  { href: '/',         label: '録音', icon: Mic        },
  { href: '/history',  label: '履歴', icon: FolderOpen  },
  { href: '/settings', label: '設定', icon: Settings    },
] as const;
```

- `usePathname()` でアクティブタブを判定
- `paddingBottom: env(safe-area-inset-bottom)` で iPhone ホームバー対応
- `fixed bottom-0 z-50` で常に最前面に固定

### `NurseCharacter`（`app/page.tsx` 内）

音声入力モード時に表示するキャラクター画像コンポーネント。

```typescript
function NurseCharacter({ animate }: { animate: boolean }) { ... }
```

- 画像: `public/rdesign_18249.png`（96×96）
- 録音中（`animate=true`）: `animate-bounce-slow` クラスで緩やかなバウンス + ✨アイコンの `animate-ping-once`

### `AppHeader`（`app/page.tsx` 内）

録音画面上部のヘッダー。オレンジ円形背景のマイクアイコン＋アプリ名＋サブテキストで構成。

### `AutoResizeTextarea`（`app/page.tsx` 内）

入力内容に応じて高さが自動調整されるテキストエリア。

```typescript
function AutoResizeTextarea({ value, onChange, className }: { ... }) { ... }
```

- `useRef<HTMLTextAreaElement>` + `useEffect` で `scrollHeight` を監視し `height` を動的更新
- `resize: none; overflow: hidden` を style で設定
- `ResultSheet` の編集エリア（1文サマリー・SBAR各項目）で使用

### `ResultSheet`（`app/page.tsx` 内）

解析中・解析完了の両方を担うボトムシートコンポーネント。

| 状態 | 表示内容 |
|---|---|
| `isAnalyzing && !streamingText` | グレースケルトン（アニメーション） |
| `isAnalyzing && streamingText` | リアルタイムストリーミングテキスト + カーソル点滅 |
| `result` | 1文サマリー（編集可・オレンジカード）＋ SBAR詳細（展開アコーディオン・各項目編集可）＋「次の申し送りを始める」ボタン |

- `translate-y-full` / `translate-y-0` の CSS トランジションでスライドアップアニメーション
- 背後に `bg-black/20 backdrop-blur` のオーバーレイ
- 解析完了後はオーバーレイクリックで閉じる

#### 解析結果のインライン編集

`result` が確定した時点で `editedSummary`（1文サマリー）と `editedSbar`（SBAR各項目）にコピーし、ユーザーが直接編集できる。

```typescript
const [editedSummary, setEditedSummary] = useState('');
const [editedSbar, setEditedSbar]       = useState<SbarContent>({ S:'', B:'', A:'', R:'' });

useEffect(() => {
  if (result) {
    setEditedSummary(result.shortSummary);
    setEditedSbar({ ...result.sbar });
  }
}, [result]);
```

- コピーボタンは `editedSummary` / `editedSbar[key]` の現在値をコピーするため、編集後の内容が反映される
- 「タップして編集」ヒントを表示し、編集可能であることをユーザーに伝える
- `AutoResizeTextarea` により、長文編集時もスクロールなしで全文を確認できる

### `components/CopyButton.tsx`

```typescript
// HTTPS 非対応環境（HTTP localhost 等）向けフォールバック
try {
  await navigator.clipboard.writeText(text);
} catch {
  // textarea を一時生成して execCommand('copy') で代替
}
```

### `components/ReportCard.tsx`

- `SbarDetail` サブコンポーネントに `sbar: SbarContent`（non-nullable）を渡すことで非nullアサーション（`!`）を排除
- 削除確認フロー: 1回目クリック → `confirming=true`、2回目クリック → 削除実行

### `lib/sbar.ts`（全コンポーネント共有）

```typescript
export const SBAR_KEYS = ['S', 'B', 'A', 'R'] as const satisfies ReadonlyArray<keyof SbarContent>;
export const SBAR_LABELS: Record<keyof SbarContent, string>       // フルラベル（結果カード）
export const SBAR_SHORT_LABELS: Record<keyof SbarContent, string> // 短縮ラベル（履歴カード）
export function sbarToText(sbar: SbarContent): string              // コピー用テキスト生成
```

---

## 12. ファビコン / PWAアイコン

`next/og` の `ImageResponse` を使い、ビルド不要でアイコンを動的生成する。

| ファイル | サイズ | 用途 |
|---|---|---|
| `app/icon.tsx` | 32×32 | ブラウザタブのファビコン |
| `app/apple-icon.tsx` | 180×180 | iOS ホーム画面の Apple Touch Icon |

どちらもオレンジ背景（`#FF8C00`）＋白マイクSVGのデザイン。`runtime = 'edge'` で Edge Runtime を使用。

`public/manifest.json` の `icons` フィールドで同じアイコンを PWA インストール時のアイコンとしても指定している。

```json
"icons": [
  { "src": "/apple-icon.png", "sizes": "180x180", "type": "image/png" },
  { "src": "/icon.png",       "sizes": "32x32",   "type": "image/png" }
]
```

---

## 13. モバイル最適化（`app/globals.css` + `app/layout.tsx`）

```css
/* タップ遅延（300ms）除去 + ハイライト除去 */
button, a, [role="tab"] {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* iPhone ホームバー対応 */
.pb-safe { padding-bottom: max(3rem, env(safe-area-inset-bottom)); }
```

```typescript
// layout.tsx — viewport-fit=cover でノッチ/ホームバーの safe-area-inset を有効化
export const viewport: Viewport = {
  viewportFit: 'cover',
  // maximumScale は設定しない（アクセシビリティのためユーザー拡大を許可）
};
```

- `textarea` の `font-size: 16px`（`text-base`）で iOS のフォーカス時自動ズームを防止

---

## 14. 型安全性の方針

- **`any` 禁止**: コードベース全体で `any` 使用ゼロ（`tsc --noEmit` で継続確認）
- **非null アサーション（`!`）禁止**: サブコンポーネントへの props 渡しで型を絞り込む
- **Zod バリデーション**: APIリクエストの入口でスキーマ検証（ストリーミング化に伴いレスポンス検証はクライアント側で実施）
- **Discriminated Union**: APIリクエストを `type: 'text' | 'audio'` で型レベルに分離

---

## 15. UIカラーパレット

| 用途 | カラーコード |
|---|---|
| 背景 | `#F5F5DC`（温かみのあるベージュ） |
| メインカラー | `#FF8C00`（視認性の高いオレンジ） |
| メインホバー | `#E07800` |
| 録音停止ボタン | `red-500` |
| 成功 | `green-500` |
| 警告（オフライン） | `yellow-300` / `yellow-800` |
| エラー | `red-500` |
| 同期中 | `blue-200` / `blue-700` |

---

## 16. ローカル開発手順

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

## 17. 今後の拡張候補（未実装）

| 機能 | 概要 | 備考 |
|---|---|---|
| 緊急度AI分類 | SBAR解析時に「緊急/通常/情報共有」を自動判定 | DB・UI変更が必要 |
| タグ・フィルタ | 「転倒」「バイタル」「投薬」等のタグをAIが自動付与 | 履歴フィルタと連動 |
| 複数患者対応 | 録音画面から患者を選択し、SBARに患者名コンテキストを渡す | DB構造変更が前提 |
| 読了確認 | 引き継ぎ先スタッフの確認機能 | クラウド化が前提 |
