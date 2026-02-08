# PodiumArena Security Hardening — Progress Tracker

**Started:** Feb 8, 2026
**Last Updated:** Feb 8, 2026

---

## P0 — Critical (Target: 48 hours)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Switch all scoring to `serverTimestamp` (not client) | DONE | Feb 8 |
| 2 | Atomic credit deduction (prevent double-spend) | TODO | |
| 3 | Atomic claim-winnings (prevent double-claim) | TODO | |

## P1 — High (Target: 1 week)

| # | Task | Status | Date |
|---|------|--------|------|
| 4 | Remove answers from client spec (progressive reveal) | TODO | |
| 5 | Server-side hitAccuracy for duck shoot | TODO | |
| 6 | Rate limit turn creation (5/min/user) | TODO | |
| 7 | gameType whitelist validation | TODO | |
| 8 | Cron secret validation (check undefined) | TODO | |

## P2 — Medium (Target: 2 weeks)

| # | Task | Status | Date |
|---|------|--------|------|
| 9 | Add security headers (CSP, X-Frame, etc.) | TODO | |
| 10 | Referral chain/cycle detection | TODO | |
| 11 | Admin audit logging + daily cap | TODO | |
| 12 | Filter injection sanitization in admin queries | TODO | |
| 13 | Server-side elapsed time cross-check in turn/complete | TODO | |
| 14 | Standardize bot-detection thresholds across games | TODO | |
| 15 | Verify/enforce event hash chain | TODO | |
| 16 | Generic error messages (stop leaking internals) | TODO | |

---

## Detailed Notes Per Task

### Task 1: Switch scoring to serverTimestamp
**Files to change:**
- `src/lib/game/whack-a-mole.ts` — uses clientTimestampMs for hit timing
- `src/lib/game/duck-shoot.ts` — uses clientTimestampMs for shot timing
- `src/lib/game/color-match.ts` — uses clientTimestampMs for inter-tap timing
- `src/lib/game/audio-pattern.ts` — uses clientTimestampMs for interval checks
- `src/lib/game/visual-diff.ts` — uses clientTimestampMs for timing

**What:** Replace all `clientTimestampMs` usage in scoring/validation with `serverTimestamp`.
**Why:** Client can spoof timestamps to fake speed and bypass bot detection.

### Task 2: Atomic credit deduction
**File:** `src/app/api/game/turn/create/route.ts:214-244`
**What:** Wrap balance check + turn insert + spend_credit in single transaction.

### Task 3: Atomic claim-winnings
**File:** `src/app/api/credits/claim-winnings/route.ts:43-109`
**What:** Use UPDATE...WHERE claimed_at IS NULL RETURNING * pattern or add UNIQUE constraint.

### Task 4: Remove answers from client spec
**Files:** All game components + turn/create API
**What:** Only send rendering data, not solutions. Progressive reveal per step.

### Task 5: Server-side hitAccuracy
**File:** `src/lib/game/duck-shoot.ts:196`
**What:** Calculate accuracy from (x,y) vs duck position server-side.

### Task 6: Rate limit turn creation
**File:** `src/app/api/game/turn/create/route.ts`
**What:** Check recent turn count per user, reject if >5/min.

### Task 7: gameType whitelist
**File:** `src/app/api/game/turn/create/route.ts:65-74`
**What:** Validate against Set of valid game IDs, return 400 for unknown.

### Task 8: Cron secret validation
**File:** `src/app/api/cron/settlement/route.ts:10-14`
**What:** Check CRON_SECRET is defined and non-empty before comparing.

### Task 9-16: See audit report
**Reference:** ~/Desktop/podiumarena-security-audit.txt
