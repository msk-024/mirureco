'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Loader2, CheckCircle, AlertCircle,
  WifiOff, RefreshCw, ClipboardList, RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import {
  addReport, addPendingReport, updateReportCompleted, getPendingReports,
  getAllReports, type SbarContent, type Report,
} from '@/lib/db';
import { SBAR_KEYS, SBAR_LABELS, SBAR_SHORT_LABELS, sbarToText } from '@/lib/sbar';
import { CopyButton } from '@/components/CopyButton';

// ---- 型 ----
type AppState = 'idle' | 'recording' | 'analyzing' | 'error';
type InputMode = 'voice' | 'text';

/** API /api/analyze へのリクエスト型（route.ts の RequestBodySchema と一致させる） */
type AnalyzeSource =
  | { type: 'text';  text: string }
  | { type: 'audio'; audioBase64: string; mimeType: string };

interface AnalysisResult {
  sbar: SbarContent;
  shortSummary: string;
}

// ---- 定数 ----
const BAR_COUNT = 5;

// ---- ユーティリティ ----
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader result is not a string'));
        return;
      }
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Failed to read audio data'));
    reader.readAsDataURL(blob);
  });
}

// ---- 音声ビジュアライザー（録音中のみ表示）----
function VoiceVisualizer({ bars, onStop }: { bars: number[]; onStop: () => void }) {
  const low  = (bars[0] + bars[1]) / 2;
  const mid  = bars[2];
  const high = (bars[3] + bars[4]) / 2;

  const rings = [
    { level: high, scaleMin: 1.70, scaleRange: 0.60, opMin: 0.06, opRange: 0.20 },
    { level: mid,  scaleMin: 1.40, scaleRange: 0.50, opMin: 0.12, opRange: 0.32 },
    { level: low,  scaleMin: 1.10, scaleRange: 0.40, opMin: 0.20, opRange: 0.45 },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center w-60 h-60">
        {rings.map(({ level, scaleMin, scaleRange, opMin, opRange }, i) => (
          <div
            key={i}
            style={{
              transform: `scale(${scaleMin + level * scaleRange})`,
              opacity: opMin + level * opRange,
            }}
            className="absolute w-24 h-24 rounded-full bg-[#FF8C00] transition-all duration-75"
          />
        ))}
        <button
          onClick={onStop}
          className="relative z-10 w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition-colors active:scale-95"
          aria-label="録音停止"
        >
          <MicOff className="w-10 h-10 text-white" />
        </button>
      </div>
      <p className="text-red-500 text-sm flex items-center gap-2 -mt-6">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
        録音中… タップで停止
      </p>
    </div>
  );
}

// ---- ミニ履歴カード（メインページ下部用）----
function MiniReportCard({ report }: { report: Report }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = report.status === 'pending';

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
      <button
        onClick={() => !isPending && setExpanded(v => !v)}
        className="w-full text-left"
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

      {/* sbar が non-null に絞り込まれた状態でサブコンポーネントに渡す */}
      {expanded && report.sbar && (
        <MiniSbarDetail sbar={report.sbar} />
      )}
    </div>
  );
}

function MiniSbarDetail({ sbar }: { sbar: SbarContent }) {
  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div className="space-y-1.5">
        {SBAR_KEYS.map(key => (
          <div key={key} className="flex gap-2 text-sm">
            <span className="font-bold text-[#FF8C00] shrink-0">{key}</span>
            <span className="text-gray-700">{sbar[key]}</span>
          </div>
        ))}
      </div>
      <CopyButton text={sbarToText(sbar)} label="全文コピー" />
    </div>
  );
}

// ---- メインページ ----
export default function HomePage() {
  const [appState, setAppState]     = useState<AppState>('idle');
  const [inputMode, setInputMode]   = useState<InputMode>('voice');
  const [inputText, setInputText]   = useState('');
  const [result, setResult]         = useState<AnalysisResult | null>(null);
  const [history, setHistory]       = useState<Report[]>([]);
  const [errorMsg, setErrorMsg]     = useState('');
  const [isOnline, setIsOnline]     = useState(true);
  const [isSyncing, setIsSyncing]   = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const [bars, setBars]             = useState<number[]>(Array(BAR_COUNT).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const animFrameRef     = useRef<number>(0);
  // retryPending の多重呼び出しを防ぐフラグ
  const isSyncingRef     = useRef(false);

  const pendingCount = history.filter(r => r.status === 'pending').length;

  // ---- 解析待ちの再送 ----
  const retryPending = useCallback(async () => {
    // 多重実行ガード: 既に同期中なら即座にリターン
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const pending = await getPendingReports();
      if (pending.length === 0) return;

      setIsSyncing(true);
      let resolved = 0;

      for (const report of pending) {
        if (!report.id || !report.pendingText) continue;
        try {
          const source: AnalyzeSource = { type: 'text', text: report.pendingText };
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(source),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as AnalysisResult;
          await updateReportCompleted(report.id, data.sbar, data.shortSummary);
          resolved++;
        } catch {
          // 個別失敗はスキップして次回に持ち越す
        }
      }

      setHistory(await getAllReports());
      if (resolved > 0) {
        setSyncNotice(`${resolved}件の解析が完了しました`);
        setTimeout(() => setSyncNotice(''), 4000);
      }
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, []);

  // ---- 初回ロード + オンライン監視 ----
  useEffect(() => {
    const init = async () => {
      setIsOnline(navigator.onLine);
      setHistory(await getAllReports());
      if (navigator.onLine) await retryPending();
    };
    init();

    const handleOnline  = async () => { setIsOnline(true); await retryPending(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryPending]);

  // ---- 音声ビジュアライザー ----
  const startVisualizer = useCallback((stream: MediaStream) => {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const freqData   = new Uint8Array(analyser.frequencyBinCount);
    const smooth     = Array(BAR_COUNT).fill(0) as number[];
    const usableBins = Math.floor(freqData.length * 0.6);

    const tick = () => {
      analyser.getByteFrequencyData(freqData);
      const next = Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = Math.floor((i / BAR_COUNT) * usableBins);
        const raw = freqData[idx] / 255;
        smooth[i] += (raw - smooth[i]) * 0.35;
        return smooth[i];
      });
      setBars(next);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopVisualizer = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setBars(Array(BAR_COUNT).fill(0));
    analyserRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, []);

  // ---- 解析 ----
  const analyze = useCallback(async (source: AnalyzeSource) => {
    if (!navigator.onLine) {
      if (source.type === 'audio') {
        setErrorMsg('オフライン時は音声録音を保存できません。テキスト入力をお使いください。');
        setAppState('error');
        return;
      }
      await addPendingReport(source.text);
      setHistory(await getAllReports());
      setInputText('');
      setAppState('idle');
      setSyncNotice('通信待ちで保存しました。電波復帰時に解析されます');
      setTimeout(() => setSyncNotice(''), 5000);
      return;
    }

    setAppState('analyzing');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalysisResult;
      await addReport(data.sbar, data.shortSummary);
      setResult(data);
      setHistory(await getAllReports());
      setInputText('');
      setAppState('idle');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '解析に失敗しました');
      setAppState('error');
    }
  }, []);

  // ---- 録音 ----
  const startRecording = useCallback(async () => {
    setErrorMsg('');
    setResult(null);
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopVisualizer();
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        try {
          const audioBase64 = await blobToBase64(blob);
          await analyze({ type: 'audio', audioBase64, mimeType });
        } catch {
          setErrorMsg('音声データの変換に失敗しました');
          setAppState('error');
        }
      };
      recorder.start(100);
      startVisualizer(stream);
      setAppState('recording');
    } catch {
      setErrorMsg('マイクへのアクセスが拒否されました');
      setAppState('error');
    }
  }, [analyze, startVisualizer, stopVisualizer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleMicClick = useCallback(() => {
    if (appState === 'idle' || appState === 'error') startRecording();
  }, [appState, startRecording]);

  const handleAnalyzeText = useCallback(() => {
    if (!inputText.trim()) return;
    setResult(null);
    analyze({ type: 'text', text: inputText.trim() });
  }, [inputText, analyze]);

  const handleRetry = useCallback(() => {
    setErrorMsg('');
    setAppState('idle');
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setInputText('');
    setAppState('idle');
  }, []);

  const isRecording = appState === 'recording';
  const isAnalyzing = appState === 'analyzing';
  const canAnalyze  = appState === 'idle' && inputText.trim().length > 0;

  return (
    <main className="min-h-screen bg-[#F5F5DC] px-4 pt-6 pb-12 flex flex-col items-center gap-5">

      {/* ヘッダー */}
      <header className="w-full max-w-md flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#FF8C00]">ミルレコ</h1>
          <p className="text-xs text-gray-500">申し送りを10秒で整理する</p>
        </div>
        <Link
          href="/history"
          className="flex items-center gap-1.5 text-sm text-[#FF8C00] font-medium hover:underline"
        >
          <ClipboardList className="w-4 h-4" />
          履歴
        </Link>
      </header>

      {/* ── 通信状態バナー ── */}
      {!isOnline && (
        <div className="w-full max-w-md flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2.5 text-sm text-yellow-800">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>オフラインです。テキスト入力のみ保存できます（音声は要通信）。</span>
        </div>
      )}
      {isSyncing && (
        <div className="w-full max-w-md flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-sm text-blue-700">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          <span>解析待ちデータを処理しています…</span>
        </div>
      )}
      {!isSyncing && pendingCount > 0 && (
        <div className="w-full max-w-md flex items-center justify-between bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>{pendingCount}件の申し送りが通信待ちです</span>
          </div>
          {isOnline && (
            <button onClick={retryPending} className="text-xs font-medium text-[#FF8C00] hover:underline shrink-0">
              今すぐ解析
            </button>
          )}
        </div>
      )}
      {syncNotice && (
        <div className="w-full max-w-md flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* ── 入力エリア ── */}
      {isRecording ? (
        <section className="w-full max-w-md flex flex-col items-center">
          <VoiceVisualizer bars={bars} onStop={stopRecording} />
        </section>
      ) : isAnalyzing ? (
        <section className="w-full max-w-md flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-[#FF8C00] animate-spin" />
          </div>
          <p className="text-[#FF8C00] text-sm font-medium">AIが解析中…</p>
        </section>
      ) : (
        <section className="w-full max-w-md space-y-4">
          {/* タブ */}
          <div className="flex bg-white rounded-xl shadow-sm overflow-hidden" role="tablist">
            <button
              role="tab"
              aria-selected={inputMode === 'voice'}
              onClick={() => setInputMode('voice')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                inputMode === 'voice'
                  ? 'bg-[#FF8C00] text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🎙 音声で入力
            </button>
            <button
              role="tab"
              aria-selected={inputMode === 'text'}
              onClick={() => setInputMode('text')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                inputMode === 'text'
                  ? 'bg-[#FF8C00] text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ⌨ テキストで入力
            </button>
          </div>

          {inputMode === 'voice' ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleMicClick}
                className="w-24 h-24 rounded-full bg-[#FF8C00] hover:bg-[#E07800] flex items-center justify-center shadow-xl transition-colors active:scale-95"
                aria-label="録音開始"
              >
                <Mic className="w-10 h-10 text-white" />
              </button>
              {appState === 'error' ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-red-500 text-sm flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {errorMsg}
                  </p>
                  <button
                    onClick={handleRetry}
                    className="text-sm text-[#FF8C00] font-medium flex items-center gap-1.5 hover:underline"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    もう一度試す
                  </button>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">タップして録音</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="例：患者A氏の血圧が150/90に上昇。頭痛を訴えています。既往歴に高血圧あり、降圧剤を服用中。主治医への報告が必要です。"
                rows={5}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#FF8C00] resize-none transition-colors"
              />
              {appState === 'error' && (
                <div className="flex items-center justify-between">
                  <p className="text-red-500 text-sm flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {errorMsg}
                  </p>
                  <button
                    onClick={handleRetry}
                    className="text-sm text-[#FF8C00] font-medium flex items-center gap-1.5 hover:underline shrink-0 ml-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    もう一度試す
                  </button>
                </div>
              )}
              <button
                onClick={handleAnalyzeText}
                disabled={!canAnalyze}
                className="w-full h-12 rounded-xl font-semibold text-sm bg-[#FF8C00] text-white hover:bg-[#E07800] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow"
              >
                整理する
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── SBAR結果カード ── */}
      {result && (
        <section className="w-full max-w-md space-y-4">
          <p className="text-green-600 text-sm font-medium flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            保存しました
          </p>

          <div className="bg-white rounded-2xl shadow p-4 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SBAR</h2>
            {SBAR_KEYS.map(key => (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-[#FF8C00]">{key}</span>
                  <span className="text-xs text-gray-400">{SBAR_LABELS[key]}</span>
                </div>
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm text-gray-700 leading-relaxed">{result.sbar[key]}</p>
                  <CopyButton text={result.sbar[key]} label="コピー" />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100">
              <CopyButton text={sbarToText(result.sbar)} label="SBAR全文をコピー" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">1文申し送り</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{result.shortSummary}</p>
            <CopyButton text={result.shortSummary} label="1文をコピー" />
          </div>

          <button
            onClick={handleReset}
            className="w-full h-12 rounded-xl font-semibold text-sm border-2 border-[#FF8C00] text-[#FF8C00] hover:bg-[#FF8C00] hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            次の申し送りを始める
          </button>
        </section>
      )}

      {/* ── 最近の申し送り（下部）── */}
      {history.length > 0 && (
        <section className="w-full max-w-md space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">最近の申し送り</h2>
            <Link href="/history" className="text-xs text-[#FF8C00] hover:underline">
              全て見る
            </Link>
          </div>
          {history.slice(0, 5).map(r => (
            <MiniReportCard key={r.id} report={r} />
          ))}
        </section>
      )}

    </main>
  );
}
