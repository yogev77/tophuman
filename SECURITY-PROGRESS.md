# PodiumArena Security Hardening — Progress Tracker

**Started:** Feb 8, 2026
**Last Updated:** Feb 8, 2026

---

## P0 — Critical (Target: 48 hours)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Switch all scoring to `serverTimestamp` (not client) | DONE | Feb 8 |
| 2 | Atomic credit deduction (prevent double-spend) | DONE | Feb 8 |
| 3 | Atomic claim-winnings (prevent double-claim) | DONE | Feb 8 |

## P1 — High (Target: 1 week)

| # | Task | Status | Date |
|---|------|--------|------|
| 4 | Remove answers from client spec (progressive reveal) | TODO | |
| 5 | Server-side hitAccuracy for duck shoot | DONE | Feb 8 |
| 6 | Rate limit turn creation (5/min/user) | DONE | Feb 8 |
| 7 | gameType whitelist validation | DONE | Feb 8 |
| 8 | Cron secret validation (check undefined) | DONE | Feb 8 |

## P2 — Medium (Target: 2 weeks)

| # | Task | Status | Date |
|---|------|--------|------|
| 9 | Add security headers (X-Frame, X-Content-Type, etc.) | DONE | Feb 8 |
| 10 | Referral abuse protection (max referrals, age check, code validation) | DONE | Feb 8 |
| 11 | Admin audit logging + daily cap + integer validation | DONE | Feb 8 |
| 12 | Filter injection sanitization in admin queries | DONE | Feb 8 |
| 13 | Server-side elapsed time cross-check in turn/complete | DONE | Feb 8 |
| 14 | Standardize bot-detection thresholds across games | TODO | |
| 15 | Verify/enforce event hash chain | DONE | Feb 8 |
| 16 | Generic error messages (stop leaking internals) | DONE | Feb 8 |

---

## Summary of Changes

### Task 1: Switch scoring to serverTimestamp
**Files changed:** `whack-a-mole.ts`, `duck-shoot.ts`, `color-match.ts`, `audio-pattern.ts`, `visual-diff.ts`
Replaced all `clientTimestampMs` usage in scoring/validation with `serverTimestamp`.

### Task 2: Atomic credit deduction
**Files changed:** `turn/create/route.ts`, `database.ts`
**SQL migration:** `002_atomic_spend_credit.sql` — adds `pg_advisory_xact_lock` + `p_game_type_id` param.

### Task 3: Atomic claim-winnings
**File changed:** `claim-winnings/route.ts`
Uses `UPDATE...WHERE claimed_at IS NULL` + `.select('id')` to atomically lock claims before inserting ledger entries.

### Task 5: Server-side hitAccuracy
**File changed:** `duck-shoot.ts`
Calculates duck position at shot time using spawn data + server timestamps. Computes accuracy from (x,y) distance to expected position instead of trusting client-reported `hitAccuracy`.

### Task 6: Rate limit turn creation
**File changed:** `turn/create/route.ts`
Checks `game_turns` created in last 60s. Returns 429 if >= 5 recent turns.

### Task 7: gameType whitelist
**File changed:** `turn/create/route.ts`
Validates `activeGameType` against a `Set` of 16 valid game IDs. Returns 400 for unknown types.

### Task 8: Cron secret validation
**File changed:** `settlement/route.ts`
Extracts `CRON_SECRET` into a variable and checks it's defined and non-empty before comparing.

### Task 9: Security headers
**File changed:** `next.config.ts`
Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-XSS-Protection`, `Permissions-Policy`.

### Task 10: Referral abuse protection
**File changed:** `referral/route.ts`
- Referral code format validation (hex, exactly 8 chars)
- Targeted DB query via `.like()` instead of loading all profiles
- Referrer account age minimum: 7 days
- Max 10 successful referrals per referrer

### Task 11: Admin audit logging + daily cap
**File changed:** `grant-credits/route.ts`
- Integer validation (`Number.isInteger`)
- Daily admin grant cap: 10,000 credits/day across all admins
- Audit log entry in `audit_logs` table on every grant

### Task 12: Filter injection sanitization
**Files changed:** `treasury-history/route.ts`, `settlement-history/route.ts`, `treasury-snapshots/route.ts`, `settlement/route.ts`
Replaced all `.or(\`user_id.eq.${value},username.eq.${value}\`)` with safe two-step `.eq()` lookups (first by user_id, fallback by username).

### Task 13: Server-side elapsed time cross-check
**File changed:** `turn/complete/route.ts`
Checks `Date.now() - turn.started_at` against `spec.timeLimitMs + 10s grace`. Expires turn if exceeded.

### Task 15: Event hash chain verification
**File changed:** `turn/complete/route.ts`
Verifies `prev_hash` chain on all events: first event must have `null`, subsequent must reference previous `event_hash`.

### Task 16: Generic error messages
**Files changed:** `turn/create/route.ts`, `settlement/route.ts`
Removed error message details (`turnError.message`, `err.message`) from API responses.

---

## Remaining Work

### Task 4: Remove answers from client spec (progressive reveal)
**Priority:** P1 — requires significant refactoring of all game components.
Games that send answers to client: mental_math (answers), audio_pattern (full sequence), drag_sort (sorted order). Requires progressive reveal per step or removing answer data from client spec.

### Task 14: Standardize bot-detection thresholds
**Priority:** P2 — tuning task. Different games naturally have different timing characteristics. Current thresholds are functional but inconsistent (some check avg < 100ms, others < 50ms).
