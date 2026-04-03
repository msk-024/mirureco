import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ミルレコ',
  description: '申し送りを10秒で整理するツール',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#FF8C00',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#F5F5DC] antialiased">{children}</body>
    </html>
  );
}
