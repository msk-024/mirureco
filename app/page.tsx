"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Loader2,
  CheckCircle,
  AlertCircle,
  WifiOff,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import {
  addReport,
  addPendingReport,
  updateReportCompleted,
  getPendingReports,
  type SbarContent,
} from "@/lib/db";
import { SBAR_KEYS, SBAR_LABELS, sbarToText } from "@/lib/sbar";
import { CopyButton } from "@/components/CopyButton";

// ---- 型 ----
type AppState = "idle" | "recording" | "analyzing" | "error";
type InputMode = "voice" | "text";

type AnalyzeSource =
  | { type: "text"; text: string }
  | { type: "audio"; audioBase64: string; mimeType: string };

interface AnalysisResult {
  sbar: SbarContent;
  shortSummary: string;
}

// ---- 定数 ----
const BAR_COUNT = 12;

// ---- ユーティリティ ----
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader result is not a string"));
        return;
      }
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read audio data"));
    reader.readAsDataURL(blob);
  });
}

// ---- 横棒ウェーブフォーム ----
function WaveformBars({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-end justify-center gap-1 h-14">
      {bars.map((level, i) => (
        <div
          key={i}
          style={{ height: `${Math.max(12, Math.round(level * 100))}%` }}
          className="w-2 rounded-full bg-[#FF8C00] transition-all duration-75 opacity-90"
        />
      ))}
    </div>
  );
}

// ---- ナースキャラクター ----
function NurseCharacter({ animate }: { animate: boolean }) {
  return (
    <div
      className={`relative select-none ${animate ? "animate-bounce-slow" : ""}`}
    >
      <div className="text-7xl leading-none">👩‍⚕️</div>
      {animate && (
        <div className="absolute -top-1 -right-2 text-yellow-400 text-xl animate-ping-once">
          ✨
        </div>
      )}
    </div>
  );
}

// ---- アプリヘッダー ----
function AppHeader() {
  return (
    <header className="w-full max-w-md flex items-center gap-3 px-4 pt-4 pb-2">
      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
        <Mic className="w-5 h-5 text-[#FF8C00]" />
      </div>
      <div>
        <p className="text-sm font-bold text-gray-700 leading-tight">ミルレコ</p>
        <p className="text-xs text-gray-400 leading-tight">申し送りを10秒で整理</p>
      </div>
    </header>
  );
}

// ---- 自動高さ調整テキストエリア ----
function AutoResizeTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

// ---- ボトムシート（解析中・結果表示）----
function ResultSheet({
  isOpen,
  isAnalyzing,
  streamingText,
  result,
  onReset,
  onCancel,
}: {
  isOpen: boolean;
  isAnalyzing: boolean;
  streamingText: string;
  result: AnalysisResult | null;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [sbarExpanded, setSbarExpanded] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [editedSbar, setEditedSbar] = useState<SbarContent>({
    S: "",
    B: "",
    A: "",
    R: "",
  });

  useEffect(() => {
    if (result) {
      setSbarExpanded(false);
      setEditedSummary(result.shortSummary);
      setEditedSbar({ ...result.sbar });
    }
  }, [result]);

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={isAnalyzing ? undefined : onReset}
        />
      )}

      {/* シート */}
      <div
        className={`fixed left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom))",
          maxHeight: "75vh",
          overflowY: "auto",
        }}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* ヘッダー */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">
                {isAnalyzing ? "AI要約中" : "解析完了"}
              </h2>
              <p className="text-xs text-gray-400">
                {isAnalyzing ? "AI is summarizing..." : "Completed"}
              </p>
            </div>
            {isAnalyzing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-[#FF8C00] animate-spin shrink-0" />
                <button
                  onClick={onCancel}
                  className="text-xs font-medium text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1.5 active:bg-gray-50"
                >
                  中止
                </button>
              </div>
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500 mt-1 shrink-0" />
            )}
          </div>

          {/* ストリーミングテキスト（生成中に流れてくる） */}
          {isAnalyzing && (
            <div className="bg-gray-50 rounded-2xl p-4 min-h-[6rem]">
              {streamingText ? (
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap break-words font-mono">
                  {streamingText}
                  <span className="inline-block w-1.5 h-3.5 bg-[#FF8C00] ml-0.5 align-middle animate-pulse" />
                </p>
              ) : (
                <div className="space-y-2 animate-pulse">
                  {["w-3/4", "w-1/2", "w-5/6"].map((w, i) => (
                    <div key={i} className={`h-3 bg-gray-200 rounded-full ${w}`} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 結果 */}
          {result && (
            <div className="space-y-3">
              {/* 1文サマリー */}
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#FF8C00] uppercase tracking-wider">
                    1文申し送り
                  </p>
                  <span className="text-xs text-gray-300">タップして編集</span>
                </div>
                <AutoResizeTextarea
                  value={editedSummary}
                  onChange={setEditedSummary}
                  className="w-full text-sm text-gray-700 leading-relaxed bg-transparent focus:outline-none focus:bg-white/60 rounded-lg px-1 -mx-1 transition-colors"
                />
                <CopyButton text={editedSummary} label="コピー" />
              </div>

              {/* SBAR 展開パネル */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setSbarExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    SBAR詳細
                  </span>
                  <div className="flex items-center gap-2">
                    {!sbarExpanded && (
                      <span className="text-xs text-gray-300">タップして編集</span>
                    )}
                    {sbarExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {sbarExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                    {SBAR_KEYS.map((key) => (
                      <div key={key} className="space-y-1 pt-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-bold text-[#FF8C00]">
                            {key}
                          </span>
                          <span className="text-xs text-gray-400">
                            {SBAR_LABELS[key]}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <AutoResizeTextarea
                            value={editedSbar[key]}
                            onChange={(v) =>
                              setEditedSbar((prev) => ({ ...prev, [key]: v }))
                            }
                            className="flex-1 text-sm text-gray-700 leading-relaxed bg-transparent focus:outline-none focus:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors"
                          />
                          <CopyButton text={editedSbar[key]} label="コピー" />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-100">
                      <CopyButton
                        text={sbarToText(editedSbar)}
                        label="全文コピー"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 次の申し送りボタン */}
              <button
                onClick={onReset}
                className="w-full h-12 rounded-xl font-semibold text-sm border-2 border-[#FF8C00] text-[#FF8C00] hover:bg-[#FF8C00] hover:text-white active:bg-[#E07800] transition-colors flex items-center justify-center gap-2 pl-2"
              >
                <RotateCcw className="w-4 h-4" />
                次の申し送りを始める
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---- メインページ ----
export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [inputText, setInputText] = useState("");
  const [result, setResult]           = useState<AnalysisResult | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const isSyncingRef = useRef(false);
  const abortCtrlRef = useRef<AbortController | null>(null);

  // ---- 解析待ちの再送 ----
  const retryPending = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const pending = await getPendingReports();
      setPendingCount(pending.length);
      if (pending.length === 0) return;
      setIsSyncing(true);
      let resolved = 0;
      for (const report of pending) {
        if (!report.id || !report.pendingText) continue;
        try {
          const source: AnalyzeSource = {
            type: "text",
            text: report.pendingText,
          };
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
      setPendingCount((await getPendingReports()).length);
      if (resolved > 0) {
        setSyncNotice(`${resolved}件の解析が完了しました`);
        setTimeout(() => setSyncNotice(""), 4000);
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
      setPendingCount((await getPendingReports()).length);
      if (navigator.onLine) await retryPending();
    };
    init();
    const handleOnline = async () => {
      setIsOnline(true);
      await retryPending();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [retryPending]);

  // ---- 音声ビジュアライザー ----
  const startVisualizer = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const smooth = Array(BAR_COUNT).fill(0) as number[];
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
      if (source.type === "audio") {
        setErrorMsg(
          "オフライン時は音声録音を保存できません。テキスト入力をお使いください。",
        );
        setAppState("error");
        return;
      }
      await addPendingReport(source.text);
      setPendingCount((await getPendingReports()).length);
      setInputText("");
      setAppState("idle");
      setSyncNotice("通信待ちで保存しました。電波復帰時に解析されます");
      setTimeout(() => setSyncNotice(""), 5000);
      return;
    }
    // 前のリクエストが残っていればキャンセル
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    // 60秒でタイムアウト
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

    setStreamingText("");
    setAppState("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      // ストリームを読み取りながら画面に反映
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamingText(accumulated);
      }

      // 完了後に JSON パースして構造化表示に切り替え
      const jsonText = (() => {
        try { JSON.parse(accumulated); return accumulated; }
        catch { return accumulated.match(/\{[\s\S]*\}/)?.[0] ?? null; }
      })();
      if (!jsonText) throw new Error("AI response format error");

      const data = JSON.parse(jsonText) as AnalysisResult;
      if (!data.sbar?.S || !data.sbar?.B || !data.sbar?.A || !data.sbar?.R || !data.shortSummary) {
        throw new Error("AI response incomplete");
      }

      await addReport(data.sbar, data.shortSummary);
      setStreamingText("");
      setResult(data);
      setInputText("");
      setAppState("idle");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErrorMsg(e instanceof Error ? e.message : "解析に失敗しました");
      setAppState("error");
    } finally {
      setStreamingText("");
      clearTimeout(timeoutId);
      if (abortCtrlRef.current === ctrl) abortCtrlRef.current = null;
    }
  }, []);

  // ---- 録音 ----
  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopVisualizer();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        try {
          const audioBase64 = await blobToBase64(blob);
          await analyze({ type: "audio", audioBase64, mimeType });
        } catch {
          setErrorMsg("音声データの変換に失敗しました");
          setAppState("error");
        }
      };
      recorder.start(100);
      startVisualizer(stream);
      setAppState("recording");
    } catch {
      setErrorMsg("マイクへのアクセスが拒否されました");
      setAppState("error");
    }
  }, [analyze, startVisualizer, stopVisualizer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleCancel = useCallback(() => {
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    setAppState("idle");
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setInputText("");
    setErrorMsg("");
    setAppState("idle");
  }, []);

  const handleAnalyzeText = useCallback(() => {
    if (!inputText.trim()) return;
    setResult(null);
    analyze({ type: "text", text: inputText.trim() });
  }, [inputText, analyze]);

  const isRecording = appState === "recording";
  const isAnalyzing = appState === "analyzing";
  const sheetOpen = isAnalyzing || !!result;
  const canAnalyze = appState === "idle" && inputText.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#F5F5DC] flex flex-col">
      <AppHeader />

      {/* 通知バナー */}
      <div className="px-4 space-y-2 w-full max-w-md mx-auto">
        {!isOnline && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2.5 text-sm text-yellow-800">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>オフラインです。テキスト入力のみ保存できます。</span>
          </div>
        )}
        {isSyncing && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-sm text-blue-700">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            <span>解析待ちデータを処理しています…</span>
          </div>
        )}
        {!isSyncing && pendingCount > 0 && (
          <div className="flex items-center justify-between bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm text-yellow-800">
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>{pendingCount}件が通信待ちです</span>
            </div>
            {isOnline && (
              <button
                onClick={retryPending}
                className="text-xs font-medium text-[#FF8C00]"
              >
                今すぐ解析
              </button>
            )}
          </div>
        )}
        {syncNotice && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-700">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{syncNotice}</span>
          </div>
        )}
      </div>

      {/* ── メインコンテンツ ── */}
      <main className="flex-1 flex flex-col items-center justify-between px-4 pb-4 pt-2">
        {/* 入力モード切り替えタブ（アイドル時のみ） */}
        {!isRecording && !isAnalyzing && !result && (
          <div
            className="w-full max-w-md flex bg-white/70 rounded-xl overflow-hidden text-sm"
            role="tablist"
          >
            <button
              role="tab"
              aria-selected={inputMode === "voice"}
              onClick={() => setInputMode("voice")}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                inputMode === "voice"
                  ? "bg-[#FF8C00] text-white"
                  : "text-gray-500"
              }`}
            >
              🎙 音声
            </button>
            <button
              role="tab"
              aria-selected={inputMode === "text"}
              onClick={() => setInputMode("text")}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                inputMode === "text"
                  ? "bg-[#FF8C00] text-white"
                  : "text-gray-500"
              }`}
            >
              ⌨ テキスト
            </button>
          </div>
        )}

        {/* テキスト入力エリア（テキストモード時） */}
        {inputMode === "text" && !isRecording && !isAnalyzing && !result && (
          <div className="flex-1 flex flex-col w-full max-w-md pt-8 gap-3">
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="例：患者A氏の血圧が150/90に上昇。頭痛を訴えています。"
                rows={6}
                maxLength={1000}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#FF8C00] resize-none"
              />
              <span className={`absolute bottom-2 right-3 text-xs ${inputText.length >= 900 ? 'text-orange-400' : 'text-gray-300'}`}>
                {inputText.length}/1000
              </span>
            </div>
            {appState === "error" && (
              <p className="text-red-500 text-sm flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </p>
            )}
            <button
              onClick={handleAnalyzeText}
              disabled={!canAnalyze}
              className="w-full h-12 rounded-xl font-semibold text-sm bg-[#FF8C00] text-white hover:bg-[#E07800] disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#D07000] transition-colors shadow"
            >
              SBARに変換する
            </button>
          </div>
        )}

        {/* 音声入力エリア */}
        {(inputMode === "voice" || isRecording || isAnalyzing) && (
          <div className="flex-1 flex flex-col items-center justify-start gap-4 w-full max-w-md min-h-0 pt-8">
            {/* ナースキャラクター */}
            <NurseCharacter animate={isRecording} />

            {/* マイクボタン */}
            <button
              onClick={
                isRecording
                  ? stopRecording
                  : appState === "idle"
                    ? startRecording
                    : undefined
              }
              disabled={isAnalyzing}
              aria-label={isRecording ? "録音停止" : "録音開始"}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600"
                  : isAnalyzing
                    ? "bg-gray-200 cursor-not-allowed"
                    : "bg-[#FF8C00] hover:bg-[#E07800]"
              }`}
            >
              {/* 録音中のリップル */}
              {isRecording && (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
                  <span className="absolute inset-[-8px] rounded-full bg-red-300 animate-ping opacity-20 animation-delay-150" />
                </>
              )}
              <Mic
                className={`w-12 h-12 text-white relative z-10 ${isAnalyzing ? "opacity-30" : ""}`}
              />
            </button>

            {/* ウェーブフォーム（録音中のみ） */}
            {isRecording && <WaveformBars bars={bars} />}

            {/* ステータステキスト */}
            <div className="text-center">
              {isRecording ? (
                <>
                  <p className="text-xs text-gray-400">recording...</p>
                  <p className="text-sm font-medium text-gray-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                    申し送り入力中
                  </p>
                </>
              ) : isAnalyzing ? (
                <p className="text-sm text-[#FF8C00] font-medium">
                  AIが解析中…
                </p>
              ) : appState === "error" ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-red-500 text-sm flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {errorMsg}
                  </p>
                  <button
                    onClick={() => {
                      setErrorMsg("");
                      setAppState("idle");
                    }}
                    className="text-sm text-[#FF8C00] font-medium flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    もう一度試す
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">タップして録音</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ボトムシート（解析中・結果表示） */}
      <ResultSheet
        isOpen={sheetOpen}
        isAnalyzing={isAnalyzing}
        streamingText={streamingText}
        result={result}
        onReset={handleReset}
        onCancel={handleCancel}
      />
    </div>
  );
}
