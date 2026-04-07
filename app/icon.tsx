import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#FF8C00',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="22" viewBox="0 0 32 36" fill="none">
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
