import type { MetadataRoute } from 'next'
import { GAME_LIST } from '@/lib/skills'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://podiumarena.com'

  return [
    { url: base, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    ...GAME_LIST.map((game) => ({
      url: `${base}/game/${game.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
