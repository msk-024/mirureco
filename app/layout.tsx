import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ミルレコ",
  description: "申し送りを10秒で整理するツール",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "ミルレコ",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "ミルレコ",
    title: "ミルレコ",
    description: "申し送りを10秒で整理するツール",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "ミルレコ",
    description: "申し送りを10秒で整理するツール",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF8C00",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
