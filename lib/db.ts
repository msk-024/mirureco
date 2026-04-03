import Dexie, { type Table } from 'dexie';

export interface SbarContent {
  S: string;
  B: string;
  A: string;
  R: string;
}

export interface Report {
  id?: number;
  createdAt: Date;
  sbar: SbarContent | null;
  shortSummary: string;
  status: 'pending' | 'completed';
  pendingText?: string; // オフライン時のテキスト一時保持（音声データは保存しない）
}

const HISTORY_LIMIT = 20;

class MirurecoDB extends Dexie {
  reports!: Table<Report, number>;

  constructor() {
    super('mirureco');
    this.version(1).stores({ reports: '++id, createdAt, status' });
    this.version(2).stores({ reports: '++id, createdAt' }).upgrade(tx =>
      tx.table('reports').clear()
    );
    this.version(3).stores({ reports: '++id, createdAt, status' }).upgrade(tx =>
      tx.table('reports').toCollection().modify(r => {
        if (r.status === undefined) r.status = 'completed';
        if (r.sbar === undefined) r.sbar = null;
        if (r.shortSummary === undefined) r.shortSummary = '';
      })
    );
    // v4: 音声データ保存廃止（プライバシー保護）、履歴上限を20件に拡張
    this.version(4).stores({ reports: '++id, createdAt, status' }).upgrade(tx =>
      tx.table('reports').toCollection().modify(r => {
        delete r.pendingAudio;
        delete r.pendingMimeType;
      })
    );
  }
}

export const db = new MirurecoDB();

/** 古い記録を削除して HISTORY_LIMIT 件に収める */
async function trimHistory(): Promise<void> {
  const all = await db.reports.orderBy('createdAt').reverse().toArray();
  if (all.length <= HISTORY_LIMIT) return;
  const ids = all.slice(HISTORY_LIMIT)
    .map(r => r.id)
    .filter((id): id is number => id !== undefined);
  await db.reports.bulkDelete(ids);
}

/** オンライン時: 解析済みをそのまま保存 */
export async function addReport(sbar: SbarContent, shortSummary: string): Promise<number> {
  const id = await db.reports.add({ sbar, shortSummary, createdAt: new Date(), status: 'completed' });
  await trimHistory();
  return id;
}

/** オフライン時: テキストを解析待ちとして一時保存（音声は保存不可） */
export async function addPendingReport(text: string): Promise<number> {
  const id = await db.reports.add({
    createdAt: new Date(),
    sbar: null,
    shortSummary: '',
    status: 'pending',
    pendingText: text,
  });
  await trimHistory();
  return id;
}

/** 解析完了: SBARで上書き、一時データを削除 */
export async function updateReportCompleted(
  id: number,
  sbar: SbarContent,
  shortSummary: string,
): Promise<void> {
  const report = await db.reports.get(id);
  if (!report) return;
  await db.reports.put({
    id: report.id,
    createdAt: report.createdAt,
    sbar,
    shortSummary,
    status: 'completed',
  });
  await trimHistory();
}

export async function getPendingReports(): Promise<Report[]> {
  return db.reports.where('status').equals('pending').toArray();
}

export async function getAllReports(): Promise<Report[]> {
  return db.reports.orderBy('createdAt').reverse().toArray();
}

export async function deleteReport(id: number): Promise<void> {
  await db.reports.delete(id);
}
