import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { z } from 'zod';

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

/** Gemini からのレスポンス形式を検証 */
const GeminiResponseSchema = z.object({
  sbar: z.object({
    S: z.string().min(1),
    B: z.string().min(1),
    A: z.string().min(1),
    R: z.string().min(1),
  }),
  shortSummary: z.string().min(1),
});

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

  try {
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

    const result = await model.generateContent(parts);
    const responseText = result.response.text().trim();

    // まず直接パース、失敗時は ```json ``` ラップを取り除いて再試行
    const jsonText = (() => {
      try {
        JSON.parse(responseText);
        return responseText;
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/);
        return match?.[0] ?? null;
      }
    })();

    if (!jsonText) {
      return NextResponse.json({ error: 'AI response format error' }, { status: 502 });
    }

    // Zod でレスポンス形式を検証
    const validated = GeminiResponseSchema.safeParse(JSON.parse(jsonText));
    if (!validated.success) {
      return NextResponse.json({ error: 'AI response format error' }, { status: 502 });
    }

    return NextResponse.json(validated.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `AI error: ${message}` }, { status: 502 });
  }
}
