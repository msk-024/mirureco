'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, FolderOpen, Settings } from 'lucide-react';

const TABS = [
  { href: '/',         label: '録音', icon: Mic        },
  { href: '/history',  label: '履歴', icon: FolderOpen  },
  { href: '/settings', label: '設定', icon: Settings    },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center pt-3 pb-2 gap-0.5 transition-colors ${
              active ? 'text-[#FF8C00]' : 'text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
