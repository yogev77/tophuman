# Podium Arena (TopHuman)

Daily skill-based gaming platform. Players compete in reflex/skill games for credits on leaderboards with daily settlement pools.

**URL**: https://www.podiumarena.com
**Deploy**: `vercel --prod` from project root
**Version**: v0.7 (Feb 18, 2026) — 20 games, checkpoint-based Maze Path

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4 |
| Database | Supabase (Postgres + Auth + Realtime) |
| Deploy | Vercel |
| Mobile | Capacitor WebView wrapper (`mobile/` dir) |

## Project Structure

```
src/
├── app/
│   ├── api/game/turn/{create,start,event,complete}/  # Game turn flow
│   ├── api/{credits,games,leaderboard,admin,cron}/    # Platform APIs
│   ├── game/[type]/page.tsx                           # Game play page
│   ├── group/[token]/page.tsx                         # Group play page
│   ├── page.tsx                                       # Homepage
│   └── player/[username]/page.tsx                     # Player profile
├── components/<GameName>Game.tsx                       # 20 game UIs
├── components/GameThumbnail.tsx                        # Inline SVG thumbnails
├── lib/game/<game-id>.ts                              # Server-side scoring (20 games)
├── lib/skills.ts                                      # Skills + games config
├── lib/game-icons.ts                                  # Lucide icon mapping
├── lib/currency.tsx                                   # CC component + C constant
└── lib/supabase/server.ts                             # Supabase clients
```

## 20 Games

| # | Game | DB ID | Skill |
|---|------|-------|-------|
| 1 | Emoji Keypad | `emoji_keypad_sequence` | memory |
| 2 | Image Rotate | `image_rotate` | pattern |
| 3 | Reaction Tap | `reaction_time` | reflex |
| 4 | Whack-a-Mole | `whack_a_mole` | reflex |
| 5 | Typing Speed | `typing_speed` | focus |
| 6 | Mental Math | `mental_math` | logic |
| 7 | Color Match | `color_match` | focus |
| 8 | Follow Me | `follow_me` | pattern |
| 9 | Audio Pattern | `audio_pattern` | memory |
| 10 | Visual Diff | `visual_diff` | focus |
| 11 | Drag Sort | `drag_sort` | logic |
| 12 | Target Shoot | `duck_shoot` | reflex |
| 13 | Number Chain | `number_chain` | focus |
| 14 | Memory Cards | `memory_cards` | memory |
| 15 | Gridlock | `gridlock` | logic |
| 16 | Reaction Bars | `reaction_bars` | reflex |
| 17 | Image Puzzle | `image_puzzle` | pattern |
| 18 | Draw Me | `draw_me` | pattern |
| 19 | Beat Match | `beat_match` | memory |
| 20 | Grid Recall | `grid_recall` | memory |
| — | Maze Path | `maze_path` | logic |

All games: server-side spec generation, sqrt-based scoring (`baseScore * sqrt(maxTime / time)`), timing-based anti-cheat.

**Multi-level games**: Draw Me (3 paths), Emoji Keypad (2 levels), Maze Path (3 levels with checkpoints), Gridlock (3 rounds).

### Maze Path — Checkpoint System (v0.7)
- 3 levels, all 8x8 grids. Difficulty = more checkpoints per level:
  - Level 1: A → B (2 checkpoints)
  - Level 2: A → B → C (3 checkpoints)
  - Level 3: A → B → C → D (4 checkpoints)
- Checkpoints placed in different quadrants (TL→TR→BL→BR pattern)
- Player traces segments between checkpoints; completed segments shown in green
- Events: `level_complete` (levels 1-2) and `path_complete` (level 3) with `paths: [segment1, segment2, ...]`
- Scoring: avg_efficiency * 2500 per level * sqrt(90s / time)

## Core Mechanics

- **Credits**: 10 free daily, 1 per game turn → daily pool → settlement distributes to top scorers
- **Settlement**: Creates `pending_claims` → users claim via UI → `credit_ledger` entry
- **Group Play**: Separate pools per session, lazy settlement on GET after expiry (50% winner / 30% rebate / 20% treasury)
- **Skills**: 5 categories (reflex, logic, focus, memory, pattern), radar chart on profile, score-based percentile ranking

## Key Architecture

### Supabase Clients (CRITICAL)
- `createClient()` — uses `@supabase/ssr`, respects RLS, has user session
- `createServiceClient()` — uses `@supabase/supabase-js` directly (NO cookies), bypasses RLS. For cross-user ops.

### Game Turn Flow
`POST /api/game/turn/create` → `POST /turn/start` → N × `POST /turn/event` → `POST /turn/complete`

Server generates seeded specs, strips secrets for client, validates events + timing on completion.

### Anti-Cheat
- Server-authoritative timestamps for all scoring
- Timing analysis: avg interval, stdDev, impossible speeds → flag
- Hash chain verification (soft check — logs to fraud_signals)
- Rate limiting: 5 turns/min/user
- Game type whitelist validation

## Database Tables

`profiles`, `credit_ledger` (append-only), `game_types`, `daily_pools`, `game_turns`, `turn_events`, `settlements`, `pending_claims`, `audit_logs`, `treasury_snapshots`

## Design System

- Dark/light mode via class toggle (`@custom-variant dark` in globals.css)
- Primary buttons: `bg-yellow-500`; body: `bg-slate-100 dark:bg-slate-900`
- Titles: Recursive font (`font-title`), body: system fonts
- Currency: `CC` component (renders `⌀` at 1.4em), `C` string constant
- SVG thumbnails: `viewBox="0 0 480 200"`, theme-aware fills, no network requests
- All `Link` imports: `import { Link } from 'next-view-transitions'`
- Game page router: `useTransitionRouter` from `next-view-transitions`

### Homepage
- 3 view modes: list / icons / skills (default `'skills'`, persisted to localStorage)
- Sticky tab bar: Games + Charts tabs, logo + credits + profile when sticky
- Theme toggle hidden on mobile sticky bar (`hidden sm:block`)
- Skills view: section rotation via localStorage counter, stable game order within sections

## Adding a New Game — Checklist

**3 component maps:**
1. `src/app/game/[type]/page.tsx` — GAME_COMPONENTS
2. `src/app/group/[token]/page.tsx` — GAME_COMPONENTS
3. Homepage auto-appears via `GAMES` config in skills.ts

**3 API whitelists:**
1. `src/app/api/game/turn/create/route.ts` — VALID_GAME_TYPES + switch case
2. `src/app/api/game/turn/complete/route.ts` — validation case
3. `src/app/api/admin/game-settings/route.ts` — VALID_GAME_TYPES

**Also:**
- `src/lib/skills.ts` — GAMES + SKILL_LIST assignment
- `src/lib/game-icons.ts` — Lucide icon mapping
- `src/components/GameThumbnail.tsx` — inline SVG
- `game_types` DB table (SQL in Supabase)

## Common Gotchas

- `createServiceClient()` must use `createClient` from `@supabase/supabase-js` (NOT `createServerClient`)
- Credit ledger event type is `admin_adjustment` (NOT `admin_grant`)
- DB game type for emoji_keypad is `emoji_keypad_sequence`; duck_shoot UI says "Target Shoot"
- Always run `npx tsc --noEmit` before deploying
- Tailwind v4: must add `@custom-variant dark (&:where(.dark, .dark *))` for class-based toggle
- `useLayoutEffect` + DOM manipulation → hydration error #418; use `useEffect` + `document.body`
- `pendingEventRef` pattern: store last event fetch promise, await before calling /complete (race condition fix)

## Mobile App

`mobile/` — Capacitor WebView wrapping live site. `appId: com.podiumarena.app`
- Android: `cd mobile/android && ./gradlew assembleDebug`
- iOS: `npx cap add ios && npx cap open ios` (needs Xcode signing)

## Environment Variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Git State

- Branch: `main`, tag: `v0.7`
- Latest: `d4d23ed` — Maze Path 3 levels with checkpoints, Grid Recall, Beat Match, UI polish
