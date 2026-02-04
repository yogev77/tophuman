-- Add username to profiles
-- Run this in Supabase SQL Editor

-- Add username column with unique constraint (case-insensitive)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Create unique index for case-insensitive lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (LOWER(username));

-- Update trigger to read username from user metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, user_id, username)
    VALUES (
        NEW.id,
        'usr_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
        NEW.raw_user_meta_data->>'username'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing users with username based on user_id
UPDATE profiles
SET username = user_id
WHERE username IS NULL;

-- Now make username NOT NULL (after backfill)
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
