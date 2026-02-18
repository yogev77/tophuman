import { ImageResponse } from 'next/og'
import { LOGO_POLYGONS, SKILLS } from '@/lib/skills'

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
        {/* Pentagon Logo */}
        <svg
          width="120"
          height="120"
          viewBox="104 96 304 290"
        >
          {LOGO_POLYGONS.map(p => (
            <polygon key={p.skill} fill={SKILLS[p.skill].hex} points={p.points} />
          ))}
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
          <span style={{ color: SKILLS.reflex.hex }}>Podium</span>
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
