import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'ミルレコ',
  description: '申し送りを10秒で整理するツール',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#FF8C00',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#F5F5DC] antialiased">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
