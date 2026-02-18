import { ImageResponse } from 'next/og'
import { LOGO_POLYGONS, SKILLS } from '@/lib/skills'

export const runtime = 'edge'

export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'transparent',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="160"
          height="160"
          viewBox="104 96 304 290"
        >
          {LOGO_POLYGONS.map(p => (
            <polygon key={p.skill} fill={SKILLS[p.skill].hex} points={p.points} />
          ))}
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}
