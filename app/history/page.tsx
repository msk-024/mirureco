'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAllReports, deleteReport, type Report } from '@/lib/db';
import { ReportCard } from '@/components/ReportCard';

export default function HistoryPage() {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    getAllReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    await deleteReport(id);
    setReports(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <main className="min-h-screen bg-[#F5F5DC] px-4 pt-6 pb-24 flex flex-col items-center gap-5">

      <header className="w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-700">
          申し送り履歴
          {reports.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {reports.length}件
            </span>
          )}
        </h1>
      </header>

      <section className="w-full max-w-md space-y-3">
        <p className="text-xs text-gray-400 text-center">
          最新20件を表示（古い記録は自動削除されます）
        </p>
        {reports.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">
            履歴はありません
          </p>
        ) : (
          reports.map(r => (
            <ReportCard key={r.id} report={r} onDelete={handleDelete} />
          ))
        )}
      </section>

    </main>
  );
}
