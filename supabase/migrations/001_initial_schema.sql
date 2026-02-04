-- TopHuman MVP Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    banned_at TIMESTAMPTZ,
    ban_reason TEXT,
    is_admin BOOLEAN DEFAULT FALSE
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, user_id)
    VALUES (NEW.id, 'usr_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own display_name" ON profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- ============================================
-- CREDIT LEDGER (Append-Only)
-- ============================================
CREATE TYPE ledger_event_type AS ENUM (
    'daily_grant',
    'turn_spend',
    'prize_win',
    'rebate',
    'expiration',
    'admin_adjustment'
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID UNIQUE DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    event_type ledger_event_type NOT NULL,
    amount INTEGER NOT NULL,
    utc_day DATE NOT NULL,
    reference_id TEXT,
    reference_type TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_user_day ON credit_ledger(user_id, utc_day);
CREATE INDEX idx_ledger_day_type ON credit_ledger(utc_day, event_type);

-- Prevent updates/deletes on ledger
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Credit ledger is append-only. Mutations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutable ON credit_ledger;
CREATE TRIGGER ledger_immutable
BEFORE UPDATE OR DELETE ON credit_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- RLS for ledger
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger" ON credit_ledger
FOR SELECT USING (
    user_id = (SELECT user_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "System can insert ledger entries" ON credit_ledger
FOR INSERT WITH CHECK (true);

-- ============================================
-- BALANCE VIEW
-- ============================================
CREATE OR REPLACE VIEW user_balances AS
SELECT
    user_id,
    COALESCE(SUM(amount), 0)::INTEGER AS balance,
    MAX(created_at) AS last_activity
FROM credit_ledger
GROUP BY user_id;

-- ============================================
-- GAME TYPES
-- ============================================
CREATE TABLE IF NOT EXISTS game_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    config_schema JSONB NOT NULL DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default game type
INSERT INTO game_types (id, name, description, config_schema) VALUES (
    'emoji_keypad_sequence',
    'Emoji Keypad Sequence',
    'Memorize and tap the emoji sequence as fast as possible',
    '{
        "sequence_length": {"type": "integer", "default": 6, "min": 3, "max": 10},
        "keypad_size": {"type": "integer", "default": 12, "min": 9, "max": 20},
        "time_limit_seconds": {"type": "integer", "default": 30, "min": 15, "max": 60},
        "mistake_penalty_ms": {"type": "integer", "default": 2000, "min": 0, "max": 5000},
        "max_mistakes": {"type": "integer", "default": 1, "min": 0, "max": 3}
    }'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DAILY GAME CONFIG
-- ============================================
CREATE TABLE IF NOT EXISTS daily_game_config (
    utc_day DATE PRIMARY KEY,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    parameters JSONB NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DAILY POOLS
-- ============================================
CREATE TABLE IF NOT EXISTS daily_pools (
    utc_day DATE PRIMARY KEY,
    game_type_id TEXT NOT NULL,
    total_credits INTEGER DEFAULT 0,
    unique_players INTEGER DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    frozen_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    settlement_id UUID
);

CREATE INDEX idx_pools_status ON daily_pools(status);

-- ============================================
-- GAME TURNS
-- ============================================
CREATE TABLE IF NOT EXISTS game_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_token TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    utc_day DATE NOT NULL,
    seed TEXT NOT NULL,
    spec JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    score INTEGER,
    completion_time_ms INTEGER,
    penalties INTEGER DEFAULT 0,
    fraud_score FLOAT,
    fraud_signals JSONB,
    flagged BOOLEAN DEFAULT FALSE,
    ledger_entry_id UUID
);

CREATE INDEX idx_turns_user_day ON game_turns(user_id, utc_day);
CREATE INDEX idx_turns_day_score ON game_turns(utc_day, score DESC) WHERE status = 'completed' AND NOT flagged;
CREATE INDEX idx_turns_token ON game_turns(turn_token);

-- RLS for turns
ALTER TABLE game_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own turns" ON game_turns
FOR SELECT USING (
    user_id = (SELECT user_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can insert own turns" ON game_turns
FOR INSERT WITH CHECK (
    user_id = (SELECT user_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can update own turns" ON game_turns
FOR UPDATE USING (
    user_id = (SELECT user_id FROM profiles WHERE id = auth.uid())
);

-- ============================================
-- TURN EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS turn_events (
    id BIGSERIAL PRIMARY KEY,
    turn_id UUID NOT NULL REFERENCES game_turns(id),
    event_type TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    client_timestamp_ms BIGINT,
    client_data JSONB,
    server_timestamp TIMESTAMPTZ DEFAULT NOW(),
    server_data JSONB,
    prev_hash TEXT,
    event_hash TEXT NOT NULL
);

CREATE INDEX idx_events_turn ON turn_events(turn_id, event_index);

-- ============================================
-- SETTLEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utc_day DATE UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    pool_total INTEGER NOT NULL,
    participant_count INTEGER NOT NULL,
    winner_user_id TEXT,
    winner_amount INTEGER,
    rebate_total INTEGER,
    sink_amount INTEGER,
    computation_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE NOT NULL
);

CREATE INDEX idx_settlements_day ON settlements(utc_day);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    ip_address INET
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id, timestamp);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- ============================================
-- LEADERBOARD VIEW
-- ============================================
CREATE OR REPLACE VIEW daily_leaderboard AS
SELECT
    gt.user_id,
    p.display_name,
    MAX(gt.score) as best_score,
    COUNT(*)::INTEGER as turns_played,
    gt.utc_day
FROM game_turns gt
JOIN profiles p ON p.user_id = gt.user_id
WHERE gt.status = 'completed' AND NOT gt.flagged
GROUP BY gt.user_id, p.display_name, gt.utc_day
ORDER BY best_score DESC;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get user balance
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(amount) FROM credit_ledger WHERE user_id = p_user_id),
        0
    )::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant daily credits (idempotent)
CREATE OR REPLACE FUNCTION grant_daily_credits(p_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
    v_already_granted BOOLEAN;
BEGIN
    -- Check if already granted
    SELECT EXISTS(
        SELECT 1 FROM credit_ledger
        WHERE user_id = p_user_id
        AND utc_day = v_today
        AND event_type = 'daily_grant'
    ) INTO v_already_granted;

    IF v_already_granted THEN
        RETURN FALSE;
    END IF;

    -- Grant 5 credits
    INSERT INTO credit_ledger (user_id, event_type, amount, utc_day)
    VALUES (p_user_id, 'daily_grant', 5, v_today);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Spend credit for a turn
CREATE OR REPLACE FUNCTION spend_credit(p_user_id TEXT, p_turn_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
    v_balance INTEGER;
BEGIN
    -- Get current balance
    SELECT get_user_balance(p_user_id) INTO v_balance;

    IF v_balance < 1 THEN
        RETURN FALSE;
    END IF;

    -- Spend 1 credit
    INSERT INTO credit_ledger (user_id, event_type, amount, utc_day, reference_id, reference_type)
    VALUES (p_user_id, 'turn_spend', -1, v_today, p_turn_id, 'turn');

    -- Update daily pool
    INSERT INTO daily_pools (utc_day, game_type_id, total_credits, unique_players, total_turns)
    VALUES (v_today, 'emoji_keypad_sequence', 1, 1, 1)
    ON CONFLICT (utc_day) DO UPDATE SET
        total_credits = daily_pools.total_credits + 1,
        total_turns = daily_pools.total_turns + 1,
        unique_players = (
            SELECT COUNT(DISTINCT user_id)
            FROM game_turns
            WHERE utc_day = v_today AND status IN ('pending', 'active', 'completed')
        );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Enable realtime for leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE game_turns;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_pools;
