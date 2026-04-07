import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#FF8C00',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* マイク本体 */}
        <svg width="100" height="110" viewBox="0 0 32 36" fill="none">
          <rect x="10" y="0" width="12" height="18" rx="6" fill="white" />
          <path d="M4 16a12 12 0 0 0 24 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <line x1="16" y1="28" x2="16" y2="33" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="10" y1="33" x2="22" y2="33" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
