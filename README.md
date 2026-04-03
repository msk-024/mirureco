# ミルレコ

> **喋るだけで、申し送りが整う。**  
> 頭の中の情報を、10秒で SBAR 形式に変換する AI ツール。

医療・介護現場のスタッフが「申し送り」を素早く・正確・安全に残すための Web アプリです。  
音声またはテキストで入力するだけで、AI が自動的に **SBAR 形式**に整理し、そのまま読み上げられる 1 文要約も生成します。

---

## 主な機能

| 機能 | 説明 |
|---|---|
| 🎙 音声入力 | マイクボタン 1 タップで録音開始。停止で自動解析 |
| ⌨ テキスト入力 | 音声と対等なタブ UI。「整理する」で同じ AI 処理 |
| 📋 SBAR 自動生成 | S（状況）/ B（背景）/ A（評価）/ R（提案）に医療的定義で構造化 |
| 📝 1 文要約 | そのまま読み上げられる申し送り文を自動生成 |
| 📋 コピーボタン | SBAR 項目ごと・全文・1 文それぞれをワンタップでコピー |
| 🔒 自動匿名化 | 固有名詞を A 氏 / B 氏に自動置換（音声・テキスト両対応） |
| 📶 オフライン保存 | テキスト入力を端末に一時保存、電波復帰時に自動解析 |
| 🕐 履歴（最新 20 件） | タップで展開・コピー・削除可能 |

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | Next.js 14（App Router） + TypeScript 5 |
| AI エンジン | Google Gemini 3 Flash Preview |
| ローカル DB | Dexie.js 4（IndexedDB） |
| バリデーション | Zod（API リクエスト・レスポンスのスキーマ検証） |
| スタイル | Tailwind CSS |
| デプロイ | Vercel（PWA 対応） |

---

## セットアップ

### 必要なもの

- Node.js 18 以上
- Google AI Studio の API キー（[取得はこちら](https://aistudio.google.com/app/apikey)）

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/your-username/mirureco.git
cd mirureco

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して GEMINI_API_KEY を入力

# 4. 開発サーバーを起動
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くと使えます。

### 環境変数

`.env.local` に以下を設定してください。

```env
GEMINI_API_KEY=your_api_key_here
```

---

## プロジェクト構成

```
mirureco/
├── app/
│   ├── page.tsx              # メイン画面（音声・テキスト入力、SBAR 結果表示）
│   ├── history/page.tsx      # 履歴一覧画面
│   └── api/analyze/route.ts  # Gemini API エンドポイント（Zod バリデーション）
├── components/
│   ├── CopyButton.tsx        # コピーボタン（共有コンポーネント）
│   └── ReportCard.tsx        # 履歴カード
└── lib/
    ├── db.ts                 # Dexie.js スキーマ・CRUD 操作
    └── sbar.ts               # SBAR 定数・ユーティリティ（共有）
```

---

## 設計思想

### Privacy by Design
音声ファイルは一切保存しません。AI が固有名詞を「A 氏」「B 氏」に自動置換してから保存するため、端末にはテキストの匿名化済み SBAR 結果のみが残ります。

### Offline First
オフライン時はテキスト入力をブラウザの IndexedDB に一時保存します。電波が復帰した瞬間に自動で AI 解析を再開します（音声録音はオンライン必須）。

### Tool, not App
ログイン不要・インストール不要。スマートフォンのブラウザで即日使えます。PWA 対応でホーム画面に追加可能。

---

## ライセンス

MIT
