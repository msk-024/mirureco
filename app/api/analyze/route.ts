import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { z } from 'zod';

// ---- IPレート制限（デモ保護用）----
// サーバレスのコールドスタートでリセットされるが、デモ用途には十分

const RATE_LIMIT_MAX = 5;      // 1IPあたりの最大リクエスト数
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // ウィンドウ: 1時間（ms）

const ipMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// ---- Zod スキーマ定義 ----

/** リクエストボディ: テキスト or 音声のいずれか（Discriminated Union） */
const RequestBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().min(1, '入力テキストが空です'),
  }),
  z.object({
    type: z.literal('audio'),
    audioBase64: z.string().min(1, '音声データが空です'),
    mimeType: z.string().min(1, 'MIMEタイプが未指定です'),
  }),
]);

// ---- プロンプト ----

const SYSTEM_PROMPT = `あなたは医療・介護現場の申し送りを整理するAIです。

入力内容を以下のルールで処理してください：

【匿名化ルール】
患者名・利用者名・スタッフ名・施設名など全ての固有名詞を「A氏」「B氏」のようにアルファベット＋氏に必ず置換してください。

【SBAR分類ルール】
- S（状況/Situation）: 現在起きていること。バイタルサインの数値（血圧・脈拍・体温・SpO2など）、症状、患者の訴えなど「今の事実」のみを記載。過去の情報は含めない。
- B（背景/Background）: 既往歴、入院・利用理由、現在の治療内容、内服薬、アレルギーなど「患者の背景情報」を記載。
- A（評価/Assessment）: スタッフとしての問題の深刻度・緊急性の評価。「○○のリスクがある」「○○の可能性が高い」など判断・アセスメントを含む。
- R（提案/Recommendation）: 医師への連絡・追加検査・投薬変更・観察強化・体位変換など「具体的に次に何をすべきか」の依頼事項を記載。

【出力ルール】
- 冗長な表現を省き、事実と判断を簡潔に記載する。
- shortSummaryは医師や次のシフトスタッフにそのまま読み上げられる1文にする。

必ず以下のJSONフォーマットのみを返してください（余分なテキストや\`\`\`は不要）:
{
  "sbar": {
    "S": "状況：現在の事実・バイタル・症状",
    "B": "背景：既往歴・入院理由・治療内容",
    "A": "評価：緊急度・問題の深刻度判断",
    "R": "提案：医師への連絡・具体的な依頼事項"
  },
  "shortSummary": "そのまま読み上げられる簡潔な1文の申し送り"
}`;

// ---- ハンドラー ----

export async function POST(req: NextRequest) {
  // IPレート制限チェック
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const { allowed, retryAfterSec } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: `リクエスト上限に達しました。${Math.ceil(retryAfterSec / 60)}分後に再試行してください。` },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // API キーの存在を外部に漏らさない
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  // リクエストボディの Zod バリデーション
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    {
      model: 'gemini-3-flash-preview',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,  threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
    { apiVersion: 'v1beta' },
  );

  // ユーザー入力はシステムプロンプトと別パートに分けてプロンプトインジェクションを抑制
  const parts =
    body.type === 'audio'
      ? [
          { text: SYSTEM_PROMPT },
          { inlineData: { mimeType: body.mimeType, data: body.audioBase64 } },
        ]
      : [
          { text: SYSTEM_PROMPT },
          { text: `\n\n入力内容：\n${body.text}` },
        ];

  try {
    const streamResult = await model.generateContentStream(parts);

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `AI error: ${message}` }, { status: 502 });
  }
}
