# ミルレコ

> **喋るだけで、申し送りが整う。**  
> 頭の中の情報を、10秒で SBAR 形式に変換する AI ツール。

医療・介護現場のスタッフが「申し送り」を素早く・正確・安全に残すための Web アプリです。  
音声またはテキストで入力するだけで、AI が自動的に **SBAR 形式**に整理し、そのまま読み上げられる 1 文要約も生成します。



**デモ：[こちらからお試しできます](https://mirureco.vercel.app/)**

> デモは Google Gemini の無料枠を使用しています。1つのIPアドレスから1時間に5回まで利用できます。上限に達した場合は時間をおいてお試しください。


## 🔗 Links
- [📘 Zenn（開発背景・UI/UX解説）](https://zenn.dev/moch1/articles/e1efabbc67eddf)
- [🧠 Qiita（技術解説）](https://qiita.com/amocode024/items/900a6a3fdcab58c55852)

---


---

## 主な機能

| 機能 | 説明 |
|---|---|
| 🎙 音声入力 | マイクボタン 1 タップで録音開始。停止で自動解析 |
| ⌨ テキスト入力 | タブ切り替えで音声と対等なUI。1000字制限・残り文字カウント付き |
| 📋 SBAR 自動生成 | S（状況）/ B（背景）/ A（評価）/ R（提案）に医療的定義で構造化 |
| ✏️ 解析結果の編集 | 1文サマリー・SBAR各項目をタップしてその場で修正可能。編集後のテキストをそのままコピー |
| ⚡ ストリーミング表示 | AI の回答を待つ間、テキストがリアルタイムで流れ始める（体感速度が大幅向上） |
| 🛑 解析キャンセル | 「中止」ボタンでいつでも解析を中断できる |
| 📝 1 文要約 | そのまま読み上げられる申し送り文を自動生成 |
| 📋 コピーボタン | SBAR 項目ごと・全文・1 文それぞれをワンタップでコピー |
| 🔒 自動匿名化 | 固有名詞を A 氏 / B 氏に自動置換（音声・テキスト両対応） |
| 📶 オフライン保存 | テキスト入力を端末に一時保存、電波復帰時に自動解析 |
| 🕐 履歴（最新 20 件） | 専用の履歴タブ。タップで展開・コピー・削除可能 |
| 🗂 ボトムナビゲーション | 録音 / 履歴 / 設定 の 3 タブ。ネイティブアプリ感覚で操作 |

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | Next.js 14（App Router） + TypeScript 5 |
| AI エンジン | Google Gemini 3 Flash Preview（ストリーミング対応） |
| フォーム | react-hook-form + @hookform/resolvers |
| ローカル DB | Dexie.js 4（IndexedDB） |
| バリデーション | Zod（API リクエスト・フォームのスキーマ検証） |
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
│   ├── layout.tsx              # ルートレイアウト（BottomNav・PWA viewport）
│   ├── globals.css             # グローバルスタイル・safe-area・アニメーション
│   ├── icon.tsx                # ファビコン（32×32）動的生成（next/og）
│   ├── apple-icon.tsx          # Apple Touch Icon（180×180）動的生成
│   ├── page.tsx                # 録音画面（音声/テキスト入力・ストリーミング解析・ボトムシート）
│   ├── history/
│   │   └── page.tsx            # 履歴一覧画面
│   ├── settings/
│   │   └── page.tsx            # 設定画面（アプリ情報・バージョン）
│   └── api/analyze/
│       └── route.ts            # POST /api/analyze（Gemini ストリーミング・レート制限）
├── components/
│   ├── BottomNav.tsx           # 固定ボトムナビゲーション（録音/履歴/設定）
│   ├── CopyButton.tsx          # コピーボタン（HTTPS非対応環境フォールバック付き）
│   └── ReportCard.tsx          # 履歴カード（展開・削除・SBAR表示）
├── lib/
│   ├── db.ts                   # Dexie.js スキーマ・CRUD 操作
│   └── sbar.ts                 # SBAR 定数・ユーティリティ（全コンポーネント共有）
├── public/
│   ├── manifest.json           # PWAマニフェスト（アイコン・テーマカラー）
│   └── rdesign_18249.png       # ナースキャラクター画像
└── global.d.ts                 # CSS モジュールの型宣言
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [DOCS.md](./DOCS.md) | 実装仕様書。データモデル・API仕様・状態管理・オフラインフロー・型安全性の方針など、開発に必要な情報をすべて記載 |
| [MARKETING.md](./MARKETING.md) | プロダクト設計資料。設計思想・改善の軌跡・ターゲットユーザー・競合との差別化 |

---

## 設計思想

**Privacy by Design** — 音声ファイルは保存しない。固有名詞を「A 氏/B 氏」に自動置換し、匿名化済みテキストのみ端末に残す。

**Offline First** — テキスト入力はオフライン時も IndexedDB に保存。電波復帰時に自動解析を再開。

**Tool, not App** — ログイン不要・インストール不要。PWA 対応でホーム画面に追加可能。

> 設計思想の詳細と改善の軌跡 → [MARKETING.md](./MARKETING.md)  
> 実装の詳細 → [DOCS.md](./DOCS.md)

---

## ライセンス

MIT
