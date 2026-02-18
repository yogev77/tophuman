import { ImageResponse } from 'next/og'
import { LOGO_POLYGONS, SKILLS } from '@/lib/skills'

export const runtime = 'edge'

export const alt = 'Podium Arena - Daily Mind Battles'
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
          width="140"
          height="140"
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
            marginTop: 40,
            fontSize: 96,
            fontWeight: 800,
          }}
        >
          <span style={{ color: SKILLS.reflex.hex }}>Podium</span>
          <span style={{ color: '#ffffff', marginLeft: 20 }}>Arena</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            color: '#94a3b8',
            fontSize: 52,
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          Daily Mind Battles.
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
