# TopHuman - Project Context

## What Is This?

A **daily skill-based gaming platform** where users compete for credits. Players prove they're human by playing reflex/skill games, competing on leaderboards, and winning pooled credits.

The homepage features a stats banner showing total pool, players, and time until settlement, followed by a scrolling ticker displaying top players across all games. Game tiles show pool size, player count, top score, and the current leader with a crown icon.

**Future roadmap:** Allow purchasing credits with money and bridging credits to USDT.

## Concept & Rationale

### The Problem
With AI and bots becoming increasingly sophisticated, there's a growing need for systems that can verify human presence and skill. CAPTCHAs are annoying and increasingly bypassable. We flip the script: instead of a chore, proving you're human becomes a **fun, competitive experience** with real rewards.

### The Solution
TopHuman is a "proof of humanity" gaming platform where:
1. **Skills matter** - Games test reflexes, pattern recognition, memory, and dexterity that are hard for bots to fake convincingly
2. **Stakes are real** - Credits have value, creating incentive to play honestly
3. **Competition drives engagement** - Daily pools and leaderboards create urgency and community
4. **Referrals grow the network** - 100 $Credits for inviting friends builds viral growth

### Why These Games?
Each game targets different human capabilities that are difficult to automate:
- **Reaction Time** - Tests genuine reflexes, timing patterns reveal bots
- **Emoji Keypad** - Memory + visual recognition + motor control
- **Whack-a-Mole** - Unpredictable targets, reaction speed, accuracy
- **Typing Speed** - Natural typing rhythm is hard to fake
- **Mental Math** - Cognitive processing speed
- **Color Match** - Visual perception and fine motor control
- **Follow Me** - Path tracing requires human-like imprecision
- **Audio Pattern** - Auditory memory and timing
- **Visual Diff** - Attention to detail, scanning patterns
- **Drag Sort** - Touch/mouse coordination
- **Image Rotate** - Spatial reasoning
- **Target Shoot** (ID: `duck_shoot`) - Olympic-style target shooting with red (hit) and green (avoid) targets

## Design System

### Colors & Theme
- **Dark/Light mode** toggle in header (Sun/Moon icons)
- Dark mode: slate-900 background, slate-800 cards
- Light mode: slate-100 background, white cards

### Buttons
- **Primary buttons**: Yellow (`bg-yellow-500 hover:bg-yellow-400 text-slate-900`)
- **Secondary/Ghost buttons**: Yellow border (`border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500`)
- **Disabled state**: Soft yellow (`disabled:bg-yellow-500/30 disabled:text-slate-900/50`)

### Typography
- **Titles**: Recursive font (Google Fonts) via `font-title` class
- **Body**: System fonts (Arial, Helvetica, sans-serif)

### Game Icons
Each game has a unique pastel color scheme for its icon:
- Emoji Keypad: Rose
- Image Rotate: Sky
- Reaction Time: Amber
- Whack-a-Mole: Green
- Typing Speed: Violet
- Mental Math: Orange
- Color Match: Pink
- Visual Diff: Teal
- Audio Pattern: Indigo
- Drag Sort: Lime
- Follow Me: Cyan
- Target Shoot: Emerald

### UI Components
- **Stats Banner**: Shows total credits, players, time until settlement
- **Top Players Ticker**: Scrolling marquee of game leaders (icon, crown, name, score, pool size)
- **Game Tiles**: Equal height cards with icon, title, description, stats grid, and top player footer
- **Referral Banner**: Invite friends UI with copy/share buttons

## Core Mechanics

### Credits System
- Users claim **10 free credits daily**
- Each game turn costs **1 credit**
- Credits go into the **game's daily pool**
- Pool is distributed back to players based on winning conditions (top scorers)
- Append-only ledger for full audit trail (`credit_ledger` table)

### Games
- **Each game has its own pool and leaderboard**
- Games run for **N hours** (configurable per game)
- Admin backend controls which games are active and when
- Settlement happens at end of game period

### Anti-Cheat (CRITICAL)

**Security is paramount.** Since credits have real value, cheating directly impacts honest players and platform integrity. Every feature must consider exploit vectors.

#### Current Defenses
- **Server-authoritative game specs** - Server generates seeded random sequences (spawn patterns, puzzles, target positions). Client cannot predict or manipulate.
- **Event logging** - All client actions logged with timestamps to `turn_events` table
- **Timing validation** - Server analyzes timing patterns on completion:
  - Too consistent = bot (humans have natural variance)
  - Impossible speeds = scripted (below human reaction limits ~150ms)
  - Suspicious patterns = flagged for review
- **Flagging system** - Turns can be flagged (`flagged: true`) and excluded from leaderboards/payouts

#### Threat Vectors to Guard Against
1. **API Tampering** - Direct API calls bypassing the UI
   - Mitigation: Validate timing, require proper event sequences, server-side game state
2. **Scripting/Automation** - Browser scripts, Selenium, Puppeteer
   - Mitigation: Timing analysis, mouse movement patterns, interaction entropy
3. **AI/Computer Vision** - Using AI to play games
   - Mitigation: Time pressure, human-like variance requirements, CAPTCHA on suspicious accounts
4. **Replay Attacks** - Replaying captured valid game sessions
   - Mitigation: Unique turn tokens, timestamp validation, server-generated seeds
5. **Collusion** - Multiple accounts, score manipulation
   - Mitigation: IP tracking, device fingerprinting, referral abuse detection
6. **Referral Fraud** - Fake accounts to farm referral bonuses
   - See detailed mitigation below

#### Referral Fraud Prevention
Referral bonuses (100 $Credits) are high-value targets for abuse. Defenses:

**Email Normalization**
- Strip `+suffix` from Gmail/Google addresses (`john+test@gmail.com` → `john@gmail.com`)
- Remove dots from Gmail local part (`j.o.h.n@gmail.com` → `john@gmail.com`)
- Track normalized base email - reject if already exists
- Apply similar rules for other providers (outlook, yahoo, etc.)

**Account Quality Signals**
- Don't grant referral bonus immediately on signup
- Require referred user to:
  - Verify email
  - Play at least N games (e.g., 3-5)
  - Have a minimum account age (e.g., 24 hours)
- Only then credit the referrer

**Pattern Detection**
- Track signup IP addresses - flag multiple accounts from same IP
- Device fingerprinting - same browser/device creating accounts
- Referral velocity - if user refers 50 accounts in a day, flag for review
- Referred account behavior - if referred accounts never play or all play identically, flag referrer

**Database Schema Additions Needed**
- `profiles.normalized_email` - Store normalized email for duplicate detection
- `profiles.signup_ip` - Track registration IP
- `profiles.device_fingerprint` - Browser fingerprint hash
- `referral_pending` table - Hold referral bonuses until conditions met
- `referral_flags` table - Track suspicious referral patterns

#### Security Principles
- **Never trust the client** - All scoring happens server-side
- **Validate everything** - Timestamps, sequences, physically possible movements
- **Statistical detection** - Flag outliers for manual review before payout
- **Rate limiting** - Prevent brute force attempts
- **Audit trail** - `credit_ledger` is append-only for forensics

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React, TypeScript, Tailwind |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (leaderboard updates) |
| Deploy | Vercel |

### Why This Stack?
- **Next.js** - Server components for secure game logic, API routes for backend, fast client hydration
- **Supabase** - Postgres reliability, built-in auth, row-level security, realtime subscriptions for live leaderboards
- **TypeScript** - Type safety critical for game logic and anti-cheat validation
- **Vercel** - Edge deployment, automatic scaling for traffic spikes during settlement
- **Tailwind** - Rapid UI iteration, consistent design system

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # Auth endpoints
│   │   ├── credits/       # Credit operations (grant, history)
│   │   ├── game/          # Turn create/start/event/complete
│   │   ├── games/         # List games, status
│   │   ├── leaderboard/   # Leaderboard data
│   │   ├── admin/         # Admin operations
│   │   └── cron/          # Settlement jobs
│   ├── auth/              # Login/signup pages
│   ├── credits/           # Credit history page
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
│   ├── DuckShootGame.tsx
│   ├── FollowMeGame.tsx
│   ├── ImageRotateGame.tsx
│   ├── Leaderboard.tsx
│   └── Header.tsx
├── lib/
│   ├── game/              # Server-side game logic & validation
│   │   ├── whack-a-mole.ts
│   │   ├── emoji-keypad.ts
│   │   ├── follow-me.ts
│   │   ├── duck-shoot.ts
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
- `pending_claims` - Unclaimed winnings from settlements (users must claim via UI)

## Games (12 Total)

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
| `follow_me` | Follow Me | Working |
| `duck_shoot` | Target Shoot | Working |

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

## Important Architecture Notes

### Supabase Client Pattern (CRITICAL)
There are two Supabase clients in `src/lib/supabase/server.ts`:

1. **`createClient()`** — Uses `@supabase/ssr`'s `createServerClient` with cookies. Respects RLS, tied to the logged-in user's session. Use for user-facing operations.

2. **`createServiceClient()`** — Uses `@supabase/supabase-js`'s `createClient` directly with the service role key, **without cookies**. Bypasses RLS entirely. Use for cross-user operations (leaderboards, admin, ticker).

**Past bug:** `createServiceClient()` previously used `createServerClient` from `@supabase/ssr` which passes session cookies. The cookies caused Supabase to apply RLS even with the service role key, making the client only see the logged-in user's data. This broke: admin grant credits (couldn't find other users), homepage ticker (only showed logged-in user), leaderboards. Fixed by switching to `createClient` from `@supabase/supabase-js` (no cookies).

### Credit Ledger Event Types
The `credit_ledger` table has a `LedgerEventType` enum. Valid values:
- `daily_grant`, `turn_spend`, `prize_win`, `rebate`, `expiration`, `admin_adjustment`, `referral_bonus`

**Note:** `admin_grant` is NOT a valid event type. Use `admin_adjustment`.

### Game ID Mapping
The `emoji_keypad` game is stored as `emoji_keypad_sequence` in the database (legacy). The mapping is in `src/app/api/games/route.ts` (`DB_GAME_TYPE_MAP`). All other games use their UI ID directly as the DB ID.

### Target Shoot (formerly Duck Shoot)
The game was redesigned from ducks to Olympic-style target shooting. The DB ID remains `duck_shoot` everywhere (database, gameType params, file names) to preserve existing data. Only UI-facing labels say "Target Shoot".

Key mechanics:
- Targets are concentric circles with a red (shoot) or green (avoid) center dot
- ~25% of targets are decoys (green dot, `isDecoy: true` in spawn data)
- Shooting a decoy = -200 score penalty
- Server validates decoy hits in `src/lib/game/duck-shoot.ts`
- Background is a minimalist gray gradient (no sky/grass)

## Session Notes

### Feb 5, 2026

**Features added:**
- **Credit History page** (`/credits`) — Shows full credit ledger grouped by day. Same event types within a day are collapsed (e.g., "Game Played x5"). Pagination with "Load more". Accessible from History button in credits dropdown in Header.
  - API: `src/app/api/credits/history/route.ts`
  - Page: `src/app/credits/page.tsx`
  - Header link added in `src/components/Header.tsx`

- **Target Shoot redesign** — Complete visual overhaul of DuckShootGame from duck sprites to minimalist concentric ring targets. Added decoy mechanic (green targets = penalty). All text renamed across UI files.
  - `src/components/DuckShootGame.tsx` — New `drawTarget()` rendering, decoy handling
  - `src/lib/game/duck-shoot.ts` — `isDecoy` field, decoy validation, -200 penalty scoring

- **Daily credits increased** from 5 to 10. Changed in:
  - Postgres function `grant_daily_credits` (run SQL in Supabase dashboard)
  - `src/app/api/credits/grant/route.ts` response

**Bugs fixed:**
- **Admin grant credits 404** — Multiple issues: invalid `event_type` (`admin_grant` → `admin_adjustment`), `.single()` failing (→ `.limit(1)`), RLS blocking cross-user profile lookups (→ fixed service client globally)
- **`createServiceClient()` RLS bypass** — Root cause fix in `src/lib/supabase/server.ts`. Affected all service client consumers (games, leaderboard, admin, ticker).
- **Ticker only showing logged-in user** — Same RLS root cause, fixed by the global service client fix.

**Pending (manual, Supabase Dashboard):**
- Update Site URL from `localhost:3000` to `https://www.podiumarena.com` in Authentication → URL Configuration (fixes confirmation email linking to localhost)
- Customize confirmation email template in Authentication → Email Templates (HTML template with Podium Arena branding was provided)
- Optional: Set up custom SMTP (e.g., Resend) to change sender name from "Supabase Auth" to "Podium Arena"

### Feb 6, 2026

**Major feature: Pending Claims System**

Settlement no longer credits users directly. Instead, it creates entries in `pending_claims` table that users must claim via the UI. This creates engagement touchpoints and prevents users from missing their winnings.

**New database table:**
```sql
CREATE TABLE pending_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    claim_type TEXT NOT NULL,  -- 'prize_win', 'rebate', 'referral_bonus'
    amount INTEGER NOT NULL,
    settlement_id UUID REFERENCES settlements(id),
    utc_day DATE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    ledger_entry_id BIGINT
);
```

**Settlement cycle awareness:**
- Games API (`/api/games`) checks for completed settlements for the current day
- Only counts turns created AFTER the settlement's `completed_at` timestamp
- This means after settlement, leaderboards and pools reset to fresh state
- When new games are played, they start a new cycle
- Pool size, ticker, and stats all respect cycle boundaries

**Files modified:**
- `src/app/api/cron/settlement/route.ts` — Creates `pending_claims` instead of direct ledger entries
- `src/app/api/credits/claim-winnings/route.ts` — NEW: Claims all pending winnings, creates ledger entries
- `src/app/api/credits/balance/route.ts` — Returns `pendingClaims` array and `pendingTotal`
- `src/app/api/games/route.ts` — Cycle-aware filtering based on settlement timestamp
- `src/app/admin/page.tsx` — Uses games API for cycle-aware stats display

**UI claim flow:**
- `BottomNotificationBar` shows when user has claimable credits (daily OR pending winnings)
- Auto-resets dismissed state when NEW claims arrive (tracks previous state via ref)
- `Header` shows red pulsing dot on credits button when `hasUnseenNotification`
- Red dot clears when user opens credits popup (`markNotificationSeen`)
- `ClaimSuccessModal` shows itemized breakdown of claimed items:
  - 1st Place Prize, Participation Rebate, Daily Claim, Referral Bonus, Admin Grant
  - Shows total if multiple items, new balance at bottom
- Page auto-refreshes after claim modal closes to update pool/ticker

**Files modified:**
- `src/components/CreditsNotificationProvider.tsx` — Manages claim state, notification tracking, modal
- `src/components/BottomNotificationBar.tsx` — Shows claim banner
- `src/components/Header.tsx` — Red notification dot logic
- `src/components/ClaimSuccessModal.tsx` — Itemized breakdown display
- `src/hooks/useCredits.ts` — Added `claimWinnings()` returning claimed items array

**Testing settlements:**
- Idempotency key is `settlement_{utcDay}` — only one settlement per day
- To re-test same day: delete from `pending_claims` then `settlements` (FK constraint)
- `spend_credit` SQL function resets pool status to 'active' when new games played after settlement

**SQL function update needed:**
The `spend_credit` function should reset pool status when inserting into a settled pool:
```sql
-- In the INSERT ... ON CONFLICT for daily_pools:
-- Set status = 'active' to allow new cycle after settlement
```

---
*Last updated: Feb 6, 2026*
