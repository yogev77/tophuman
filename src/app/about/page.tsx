import { Link } from 'next-view-transitions'
import { ArrowLeft, Coins, Trophy, Play, Zap, Cog, Crosshair, Brain, Shapes } from 'lucide-react'
import Image from 'next/image'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import { GAMES, SKILLS, SKILL_LIST, getGameIdsForSkill, type SkillId, SKILL_HEX } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'

export const metadata: Metadata = {
  title: 'About Podium Arena — Daily Brain Games & Mind Skills Competition',
  description:
    'Podium Arena is a free daily competitive brain games platform. Compete worldwide in 20+ mind games across five skills — Reflex, Logic, Focus, Memory, and Pattern. Play daily, climb the leaderboard, win credits.',
  keywords: [
    'brain games',
    'mind games',
    'daily puzzle games',
    'online brain training',
    'competitive mind games',
    'daily brain challenge',
    'skill games online',
    'free brain games',
    'daily leaderboard games',
    'mind skills competition',
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Podium Arena',
  description:
    'A free daily competitive brain games platform where players worldwide compete in 20+ mind skill challenges across Reflex, Logic, Focus, Memory, and Pattern.',
  url: 'https://podiumarena.com',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

const SKILL_ICONS: Record<SkillId, LucideIcon> = {
  reflex: Zap,
  logic: Cog,
  focus: Crosshair,
  memory: Brain,
  pattern: Shapes,
}

const SKILL_DESCRIPTIONS: Record<string, string> = {
  reflex: 'How fast can you react? Reflex games test your reaction speed, hand-eye coordination, and ability to respond under pressure.',
  logic: 'Think fast, think smart. Logic games challenge your problem-solving, numerical reasoning, and strategic thinking.',
  focus: 'Sharpen your attention. Focus games measure your ability to concentrate, spot details, and maintain precision.',
  memory: 'Train your recall. Memory games test short-term memory, pattern retention, and sequential recall.',
  pattern: 'See the bigger picture. Pattern games challenge your ability to recognize, reproduce, and follow complex sequences.',
}

// Sample radar data for the demo chart (percentile 0–1 per skill)
const SAMPLE_RADAR: Record<SkillId, number> = {
  reflex: 0.85,
  logic: 0.55,
  focus: 0.70,
  memory: 0.40,
  pattern: 0.92,
}

const RADAR_CX = 170
const RADAR_CY = 140
const RADAR_R = 90

function SampleRadarChart() {
  const angles = SKILL_LIST.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5)

  const pt = (angle: number, r: number) => ({
    x: RADAR_CX + r * Math.cos(angle),
    y: RADAR_CY + r * Math.sin(angle),
  })

  const poly = (r: number) =>
    angles.map(a => { const p = pt(a, r); return `${p.x},${p.y}` }).join(' ')

  const dataPoints = SKILL_LIST.map((def, i) => {
    const ratio = SAMPLE_RADAR[def.id]
    return pt(angles[i], ratio * RADAR_R)
  })

  const labelConfigs = SKILL_LIST.map((_, i) => {
    const edge = pt(angles[i], RADAR_R + 18)
    if (i === 0) return { x: edge.x, y: edge.y - 10, anchor: 'middle' as const }
    if (i === 1) return { x: edge.x + 6, y: edge.y + 4, anchor: 'start' as const }
    if (i === 2) return { x: edge.x + 6, y: edge.y + 4, anchor: 'start' as const }
    if (i === 3) return { x: edge.x - 6, y: edge.y + 4, anchor: 'end' as const }
    return { x: edge.x - 6, y: edge.y + 4, anchor: 'end' as const }
  })

  return (
    <svg viewBox="0 0 340 280" className="w-full max-w-xs mx-auto">
      {/* Grid pentagons */}
      {[0.33, 0.66, 1].map(s => (
        <polygon key={s} points={poly(RADAR_R * s)} fill="none" className="stroke-slate-300 dark:stroke-slate-600/30" strokeWidth="0.8" />
      ))}
      {/* Spokes */}
      {angles.map((a, i) => {
        const p = pt(a, RADAR_R)
        return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={p.x} y2={p.y} className="stroke-slate-300 dark:stroke-slate-600/30" strokeWidth="0.8" />
      })}
      {/* Data polygon */}
      <polygon
        points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
        fill={`${SKILLS.reflex.hex}1F`}
        stroke={`${SKILLS.reflex.hex}80`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={SKILL_HEX[SKILL_LIST[i].id]} />
      ))}
      {/* Labels */}
      {SKILL_LIST.map((def, i) => {
        const cfg = labelConfigs[i]
        return (
          <text
            key={def.id}
            x={cfg.x}
            y={cfg.y}
            textAnchor={cfg.anchor}
            className="fill-slate-600 dark:fill-slate-300 text-[12px] font-semibold"
          >
            {def.name}
          </text>
        )
      })}
    </svg>
  )
}

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      {/* Hero with selfie */}
      <div className="text-center mb-10">
        <Image
          src="/team-selfie.png"
          alt="Five characters representing Podium Arena's skill categories — Reflex, Memory, Logic, Focus, and Pattern"
          width={800}
          height={400}
          className="rounded-2xl mx-auto mb-6"
          priority
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white font-title mb-3">
          Compete Daily Across Five Mind Skills
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Podium Arena is a free daily competitive brain games platform where players worldwide go head-to-head in skill-based challenges. Think NYT Games meets worldwide daily competition — 20 games, five skill categories, one daily leaderboard.
        </p>
      </div>

      {/* How It Works — 3 step cards */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto mb-3">
              <Coins className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">Get 10 Free Credits</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Every player receives 10 free credits daily. No ads, no subscriptions.</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto mb-3">
              <Play className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">Play Any Game</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Spend 1 credit per game. Your score enters the daily leaderboard.</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">Win Rewards</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Daily settlement rewards top performers from the credits pool.</p>
          </div>
        </div>
      </section>

      {/* Your Skill Profile — radar chart section */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">Discover Your Skill Profile</h2>
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="p-6 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700">
              <SampleRadarChart />
            </div>
            <div className="p-6 flex flex-col justify-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Your Unique Strengths</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Every player has a different skill profile. As you play games across the five categories, Podium Arena builds your personal radar chart — a visual map of your cognitive strengths.
              </p>
              <ul className="space-y-2.5">
                {SKILL_LIST.map((skill) => {
                  const Icon = SKILL_ICONS[skill.id]
                  const pct = Math.round(SAMPLE_RADAR[skill.id] * 100)
                  return (
                    <li key={skill.id} className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${skill.hex}20` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: skill.hex }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{skill.name}</span>
                          <span className="text-xs text-slate-400">Top {100 - pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mt-1">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: skill.hex }} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-slate-400 mt-4">
                Sample profile shown. Your chart updates as you play more games.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5 Skill Sections with game thumbnail grids */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 text-center">The Five Skills</h2>
        <div className="space-y-10">
          {SKILL_LIST.map((skill) => {
            const gameIds = getGameIdsForSkill(skill.id)
            const SkillIcon = SKILL_ICONS[skill.id]
            return (
              <div
                key={skill.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                {/* Skill header with icon + colored accent */}
                <div
                  className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3"
                  style={{ borderLeftWidth: 4, borderLeftColor: skill.hex }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${skill.hex}20` }}
                  >
                    <SkillIcon className="w-5 h-5" style={{ color: skill.hex }} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: skill.hex }}>
                      {skill.name}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {SKILL_DESCRIPTIONS[skill.id]}
                    </p>
                  </div>
                </div>

                {/* Game list */}
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {gameIds.map((id) => {
                    const game = GAMES[id]
                    const Icon = GAME_ICONS[id]
                    return (
                      <Link
                        key={id}
                        href={`/game/${id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                      >
                        {Icon && (
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${skill.hex}15` }}
                          >
                            <Icon className="w-4.5 h-4.5" style={{ color: skill.hex }} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {game.name}
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {game.description}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* SEO Content */}
      <section className="space-y-6 text-slate-700 dark:text-slate-300 text-[15px] leading-relaxed mb-10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Daily Brain Games</h2>
          <p>
            Podium Arena offers a fresh set of daily brain games designed to challenge your cognitive abilities. Unlike single-player brain training apps, every game you play here is a real competition. Your score is ranked against every other player who plays that day, making each session meaningful and motivating.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Online Mind Games</h2>
          <p>
            Looking for online mind games that actually test your skills? Podium Arena covers five core cognitive skills — from lightning-fast reflexes to deep logical reasoning. Whether you prefer quick reaction challenges, memory puzzles, or complex pattern recognition, there is a game for every type of thinker.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Competitive Puzzle Games</h2>
          <p>
            Most puzzle games are solo experiences. Podium Arena turns every puzzle into a competition. With daily credit pools, leaderboard rankings, and settlement rewards, you are not just solving puzzles — you are competing for the top spot against players around the globe.
          </p>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-8 border-t border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Ready to Compete?</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Jump in — your 10 daily credits are waiting.
        </p>
        <Link
          href="/"
          className="inline-block bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-6 py-3 rounded-lg transition-colors"
        >
          Start Playing
        </Link>
      </div>
    </div>
  )
}
