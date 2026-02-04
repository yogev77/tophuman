import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Podium Arena - Daily Skill Games'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Trophy Icon */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#facc15"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 30,
            fontSize: 72,
            fontWeight: 800,
          }}
        >
          <span style={{ color: '#facc15' }}>Podium</span>
          <span style={{ color: '#ffffff', marginLeft: 16 }}>Arena</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            color: '#94a3b8',
            fontSize: 32,
            marginTop: 20,
            textAlign: 'center',
          }}
        >
          New Champions. Every Day.
        </div>

        {/* Description */}
        <div
          style={{
            color: '#64748b',
            fontSize: 24,
            marginTop: 16,
            textAlign: 'center',
            maxWidth: 800,
          }}
        >
          Play skill games, top the leaderboard, and claim your share of the pool
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
