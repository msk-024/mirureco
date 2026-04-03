import type { SbarContent } from './db';

/** SBAR の表示順（挿入順を保証するため配列で管理） */
export const SBAR_KEYS = ['S', 'B', 'A', 'R'] as const satisfies ReadonlyArray<keyof SbarContent>;

/** 各セクションのフルラベル（結果カード表示用） */
export const SBAR_LABELS: Record<keyof SbarContent, string> = {
  S: '状況（Situation）',
  B: '背景（Background）',
  A: '評価（Assessment）',
  R: '提案（Recommendation）',
};

/** 各セクションの短縮ラベル（履歴カード・コピーテキスト用） */
export const SBAR_SHORT_LABELS: Record<keyof SbarContent, string> = {
  S: '状況',
  B: '背景',
  A: '評価',
  R: '提案',
};

/** SBAR 全文をコピー用テキストに変換 */
export function sbarToText(sbar: SbarContent): string {
  return SBAR_KEYS.map(k => `${k}（${SBAR_SHORT_LABELS[k]}）: ${sbar[k]}`).join('\n');
}
