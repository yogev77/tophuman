# TopHuman - Project Context

## What Is This?

A **daily skill-based gaming platform** where users compete for credits. Players prove they're human by playing reflex/skill games, competing on leaderboards, and winning pooled credits.

**Future roadmap:** Allow purchasing credits with money and bridging credits to USDT.

## Core Mechanics

### Credits System
- Users claim **5 free credits daily**
- Each game turn costs **1 credit**
- Credits go into the **game's daily pool**
- Pool is distributed back to players based on winning conditions (top scorers)
- Append-only ledger for full audit trail (`credit_ledger` table)

### Games
- **Each game has its own pool and leaderboard**
- Games run for **N hours** (configurable per game)
- Admin backend controls which games are active and when
- Settlement happens at end of game period

### Anti-Cheat
- Server generates seeded random game specs (spawn sequences, puzzles, etc.)
- Client actions logged with timestamps to `turn_events`
- Server validates timing patterns on completion
- Detects bots via: suspiciously consistent timing, impossible speeds
- Turns can be flagged (`flagged: true`) and excluded from leaderboards

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React, TypeScript, Tailwind |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (leaderboard updates) |
| Deploy | Vercel |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # Auth endpoints
│   │   ├── credits/       # Credit operations
│   │   ├── game/          # Turn create/start/event/complete
│   │   ├── games/         # List games, status
│   │   ├── leaderboard/   # Leaderboard data
│   │   ├── admin/         # Admin operations
│   │   └── cron/          # Settlement jobs
│   ├── auth/              # Login/signup pages
│   ├── game/              # Game play page
│   ├── profile/           # User profile
│   └── admin/             # Admin dashboard
├── components/
│   ├── WhackAMoleGame.tsx
│   ├── EmojiKeypadGame.tsx
│   ├── ReactionTimeGame.tsx
│   ├── TypingSpeedGame.tsx
│   ├── MentalMathGame.tsx
│   ├── ColorMatchGame.tsx
│   ├── VisualDiffGame.tsx
│   ├── AudioPatternGame.tsx
│   ├── DragSortGame.tsx
│   ├── ImageRotateGame.tsx
│   ├── Leaderboard.tsx
│   └── Header.tsx
├── lib/
│   ├── game/              # Server-side game logic & validation
│   │   ├── whack-a-mole.ts
│   │   ├── emoji-keypad.ts
│   │   └── ... (one per game)
│   └── supabase/          # Supabase client utilities
├── hooks/                 # React hooks
└── types/                 # TypeScript types
```

## Database Schema (Supabase)

Key tables:
- `profiles` - User profiles, extends Supabase auth
- `credit_ledger` - Append-only credit transactions
- `game_types` - Game definitions and config schemas
- `daily_game_config` - Which games run on which days
- `daily_pools` - Pool totals per game per day
- `game_turns` - Individual play sessions
- `turn_events` - Event log for each turn (for validation)
- `settlements` - End-of-day prize distribution records

## Games (10 Total)

| ID | Name | Status |
|----|------|--------|
| `emoji_keypad` | Emoji Keypad | Working |
| `image_rotate` | Image Rotate | Working |
| `reaction_time` | Reaction Time | Working |
| `whack_a_mole` | Whack-a-Mole | **Has bugs** |
| `typing_speed` | Typing Speed | Working |
| `mental_math` | Mental Math | Working |
| `color_match` | Color Match | Working |
| `visual_diff` | Visual Diff | Working |
| `audio_pattern` | Audio Pattern | Working |
| `drag_sort` | Drag Sort | Working |

## Known Issues

### WhackAMoleGame.tsx
- State defined as `activeEntities` but code references non-existent `activeMoles`
- Bombs exist in spec (`type: 1`) but aren't visually distinguished from moles
- `bombHits` tracked in state but not updated on bomb clicks

## Environment Variables

See `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Running Locally

```bash
npm install
npm run dev
# http://localhost:3000
```

## Session Notes

(Add notes here during work sessions for continuity)

---
*Last updated: Feb 4, 2025*
