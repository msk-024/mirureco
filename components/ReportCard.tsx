'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react';
import { type Report, type SbarContent } from '@/lib/db';
import { SBAR_KEYS, SBAR_SHORT_LABELS, sbarToText } from '@/lib/sbar';
import { CopyButton } from '@/components/CopyButton';

interface ReportCardProps {
  report: Report;
  onDelete?: (id: number) => void;
}

/** 展開時の SBAR 詳細表示。sbar が non-null であることを型で保証した状態で受け取る */
function SbarDetail({ sbar }: { sbar: SbarContent }) {
  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {SBAR_KEYS.map(key => (
          <Fragment key={key}>
            <span className="font-bold text-[#FF8C00] pt-0.5">
              {key}
              <span className="text-gray-400 font-normal text-[10px] ml-0.5">({SBAR_SHORT_LABELS[key]})</span>
            </span>
            <span className="text-gray-700">{sbar[key]}</span>
          </Fragment>
        ))}
      </div>
      <CopyButton text={sbarToText(sbar)} label="全文コピー" />
    </div>
  );
}

export function ReportCard({ report, onDelete }: ReportCardProps) {
  const [expanded, setExpanded]     = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (report.id !== undefined) {
      onDelete?.(report.id);
      setConfirming(false);
    }
  };

  const isPending = report.status === 'pending';

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => !isPending && setExpanded(v => !v)}
          className="flex-1 text-left"
          disabled={isPending}
        >
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400">
              {new Date(report.createdAt).toLocaleString('ja-JP')}
            </p>
            {isPending && (
              <span className="text-xs text-yellow-600 font-medium bg-yellow-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                解析中...
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-0.5 leading-snug">
            {report.shortSummary || (
              <span className="text-gray-400 italic">電波復帰時に自動解析されます</span>
            )}
          </p>
        </button>

        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          {!isPending && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-gray-300 hover:text-gray-500"
              aria-label={expanded ? '閉じる' : '展開'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          {onDelete && (
            confirming ? (
              <>
                <button
                  onClick={handleDelete}
                  className="text-xs text-red-600 font-medium hover:underline"
                >
                  削除
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-xs text-gray-400 hover:underline ml-1"
                >
                  ×
                </button>
              </>
            ) : (
              <button
                onClick={handleDelete}
                className="text-gray-300 hover:text-red-400 transition-colors"
                aria-label="削除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* sbar が non-null に絞り込まれた状態でサブコンポーネントに渡す（! アサーション不要） */}
      {expanded && !isPending && report.sbar && (
        <SbarDetail sbar={report.sbar} />
      )}
    </div>
  );
}
