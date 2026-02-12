-- ============================================
-- Per-Game Pools & Settlement
-- Changes daily_pools PK to (utc_day, game_type_id)
-- Adds game_type_id to settlements
-- Updates spend_credit to use compound conflict key
-- ============================================

-- 1. daily_pools: change PK from (utc_day) to (utc_day, game_type_id)
ALTER TABLE daily_pools DROP CONSTRAINT daily_pools_pkey;
ALTER TABLE daily_pools ADD PRIMARY KEY (utc_day, game_type_id);

-- 2. settlements: add game_type_id, add compound unique constraint
ALTER TABLE settlements ADD COLUMN game_type_id TEXT;
ALTER TABLE settlements ADD CONSTRAINT settlements_utc_day_game_type_id_key UNIQUE (utc_day, game_type_id);

-- 3. Update spend_credit to use compound ON CONFLICT
CREATE OR REPLACE FUNCTION spend_credit(
  p_user_id TEXT,
  p_turn_id TEXT,
  p_game_type_id TEXT DEFAULT 'emoji_keypad_sequence'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
    v_balance INTEGER;
BEGIN
    -- Acquire per-user advisory lock to prevent concurrent double-spend.
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id));

    -- Check balance (now serialized — no TOCTOU race condition)
    SELECT get_user_balance(p_user_id) INTO v_balance;

    IF v_balance < 1 THEN
        RETURN FALSE;
    END IF;

    -- Deduct 1 credit
    INSERT INTO credit_ledger (user_id, event_type, amount, utc_day, reference_id, reference_type)
    VALUES (p_user_id, 'turn_spend', -1, v_today, p_turn_id, 'turn');

    -- Update daily pool with correct game type (compound key)
    INSERT INTO daily_pools (utc_day, game_type_id, total_credits, unique_players, total_turns)
    VALUES (v_today, p_game_type_id, 1, 1, 1)
    ON CONFLICT (utc_day, game_type_id) DO UPDATE SET
        total_credits = daily_pools.total_credits + 1,
        total_turns = daily_pools.total_turns + 1,
        unique_players = (
            SELECT COUNT(DISTINCT user_id)
            FROM game_turns
            WHERE utc_day = v_today
              AND game_type_id = p_game_type_id
              AND status IN ('pending', 'active', 'completed')
        ),
        status = 'active';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
