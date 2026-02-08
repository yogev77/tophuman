export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type LedgerEventType =
  | 'daily_grant'
  | 'turn_spend'
  | 'prize_win'
  | 'rebate'
  | 'sink'
  | 'expiration'
  | 'admin_adjustment'
  | 'referral_bonus'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          username: string
          display_name: string | null
          created_at: string
          updated_at: string
          banned_at: string | null
          ban_reason: string | null
          is_admin: boolean
          username_changed_at: string | null
        }
        Insert: {
          id: string
          user_id: string
          username: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
          banned_at?: string | null
          ban_reason?: string | null
          is_admin?: boolean
          username_changed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          username?: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
          banned_at?: string | null
          ban_reason?: string | null
          is_admin?: boolean
          username_changed_at?: string | null
        }
      }
      credit_ledger: {
        Row: {
          id: number
          event_id: string
          user_id: string
          event_type: LedgerEventType
          amount: number
          utc_day: string
          reference_id: string | null
          reference_type: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          event_id?: string
          user_id: string
          event_type: LedgerEventType
          amount: number
          utc_day: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          event_id?: string
          user_id?: string
          event_type?: LedgerEventType
          amount?: number
          utc_day?: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      daily_pools: {
        Row: {
          utc_day: string
          game_type_id: string
          total_credits: number
          unique_players: number
          total_turns: number
          status: string
          frozen_at: string | null
          settled_at: string | null
          settlement_id: string | null
        }
        Insert: {
          utc_day: string
          game_type_id: string
          total_credits?: number
          unique_players?: number
          total_turns?: number
          status?: string
          frozen_at?: string | null
          settled_at?: string | null
          settlement_id?: string | null
        }
        Update: {
          utc_day?: string
          game_type_id?: string
          total_credits?: number
          unique_players?: number
          total_turns?: number
          status?: string
          frozen_at?: string | null
          settled_at?: string | null
          settlement_id?: string | null
        }
      }
      game_types: {
        Row: {
          id: string
          name: string
          description: string | null
          config_schema: Json
          active: boolean
          created_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          config_schema: Json
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          config_schema?: Json
          active?: boolean
          created_at?: string
        }
      }
      daily_game_config: {
        Row: {
          utc_day: string
          game_type_id: string
          parameters: Json
          created_by: string
          created_at: string
        }
        Insert: {
          utc_day: string
          game_type_id: string
          parameters: Json
          created_by: string
          created_at?: string
        }
        Update: {
          utc_day?: string
          game_type_id?: string
          parameters?: Json
          created_by?: string
          created_at?: string
        }
      }
      game_turns: {
        Row: {
          id: string
          turn_token: string
          user_id: string
          game_type_id: string
          utc_day: string
          seed: string
          spec: Json
          created_at: string
          started_at: string | null
          completed_at: string | null
          expires_at: string
          status: string
          score: number | null
          completion_time_ms: number | null
          penalties: number
          fraud_score: number | null
          fraud_signals: Json | null
          flagged: boolean
          ledger_entry_id: string | null
        }
        Insert: {
          id?: string
          turn_token: string
          user_id: string
          game_type_id: string
          utc_day: string
          seed: string
          spec: Json
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          expires_at: string
          status?: string
          score?: number | null
          completion_time_ms?: number | null
          penalties?: number
          fraud_score?: number | null
          fraud_signals?: Json | null
          flagged?: boolean
          ledger_entry_id?: string | null
        }
        Update: {
          id?: string
          turn_token?: string
          user_id?: string
          game_type_id?: string
          utc_day?: string
          seed?: string
          spec?: Json
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
          expires_at?: string
          status?: string
          score?: number | null
          completion_time_ms?: number | null
          penalties?: number
          fraud_score?: number | null
          fraud_signals?: Json | null
          flagged?: boolean
          ledger_entry_id?: string | null
        }
      }
      turn_events: {
        Row: {
          id: number
          turn_id: string
          event_type: string
          event_index: number
          client_timestamp_ms: number | null
          client_data: Json | null
          server_timestamp: string
          server_data: Json | null
          prev_hash: string | null
          event_hash: string
        }
        Insert: {
          id?: number
          turn_id: string
          event_type: string
          event_index: number
          client_timestamp_ms?: number | null
          client_data?: Json | null
          server_timestamp?: string
          server_data?: Json | null
          prev_hash?: string | null
          event_hash: string
        }
        Update: {
          id?: number
          turn_id?: string
          event_type?: string
          event_index?: number
          client_timestamp_ms?: number | null
          client_data?: Json | null
          server_timestamp?: string
          server_data?: Json | null
          prev_hash?: string | null
          event_hash?: string
        }
      }
      settlements: {
        Row: {
          id: string
          utc_day: string
          status: string
          pool_total: number
          participant_count: number
          winner_user_id: string | null
          winner_amount: number | null
          rebate_total: number | null
          sink_amount: number | null
          computation_hash: string | null
          created_at: string
          completed_at: string | null
          idempotency_key: string
        }
        Insert: {
          id?: string
          utc_day: string
          status?: string
          pool_total: number
          participant_count: number
          winner_user_id?: string | null
          winner_amount?: number | null
          rebate_total?: number | null
          sink_amount?: number | null
          computation_hash?: string | null
          created_at?: string
          completed_at?: string | null
          idempotency_key: string
        }
        Update: {
          id?: string
          utc_day?: string
          status?: string
          pool_total?: number
          participant_count?: number
          winner_user_id?: string | null
          winner_amount?: number | null
          rebate_total?: number | null
          sink_amount?: number | null
          computation_hash?: string | null
          created_at?: string
          completed_at?: string | null
          idempotency_key?: string
        }
      }
      site_settings: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
      }
      treasury_snapshots: {
        Row: {
          id: number
          utc_day: string
          balance: number
          treasury_user_id: string
          treasury_username: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: number
          utc_day: string
          balance: number
          treasury_user_id: string
          treasury_username?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          utc_day?: string
          balance?: number
          treasury_user_id?: string
          treasury_username?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: number
          timestamp: string
          actor_type: string
          actor_id: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          details: Json | null
          ip_address: string | null
        }
        Insert: {
          id?: number
          timestamp?: string
          actor_type: string
          actor_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
        }
        Update: {
          id?: number
          timestamp?: string
          actor_type?: string
          actor_id?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
        }
      }
    }
    Views: {
      user_balances: {
        Row: {
          user_id: string
          balance: number
          last_activity: string
        }
      }
      daily_leaderboard: {
        Row: {
          user_id: string
          display_name: string | null
          best_score: number
          turns_played: number
          utc_day: string
        }
      }
    }
    Functions: {
      get_user_balance: {
        Args: { p_user_id: string }
        Returns: number
      }
      grant_daily_credits: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      spend_credit: {
        Args: { p_user_id: string; p_turn_id: string; p_game_type_id?: string }
        Returns: boolean
      }
    }
  }
}
