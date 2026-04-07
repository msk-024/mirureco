export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[#F5F5DC] px-4 pt-6 pb-24 flex flex-col items-center gap-6">
      <header className="w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-700">設定</h1>
      </header>

      <section className="w-full max-w-md bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-500">アプリ情報</h2>
        <div className="space-y-1">
          <p className="text-sm text-gray-700 font-medium">ミルレコ</p>
          <p className="text-xs text-gray-400">申し送りを10秒で整理するツール</p>
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-1">
          <p className="text-xs text-gray-400">バージョン：v1.0.0</p>
          <p className="text-xs text-gray-400">AI：Gemini 3 Flash Preview</p>
          <p className="text-xs text-gray-400">データ保存：端末内のみ（最新20件）</p>
        </div>
      </section>
    </main>
  );
}
