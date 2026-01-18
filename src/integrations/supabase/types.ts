export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          created_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean | null
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      match_participants: {
        Row: {
          id: string
          joined_at: string | null
          match_id: string
          ready: boolean | null
          ready_at: string | null
          result_at: string | null
          result_choice: string | null
          status: string | null
          team_id: string | null
          team_side: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          match_id: string
          ready?: boolean | null
          ready_at?: string | null
          result_at?: string | null
          result_choice?: string | null
          status?: string | null
          team_id?: string | null
          team_side?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          match_id?: string
          ready?: boolean | null
          ready_at?: string | null
          result_at?: string | null
          result_choice?: string | null
          status?: string | null
          team_id?: string | null
          team_side?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      match_results: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          dispute_reason: string | null
          id: string
          loser_confirmed: boolean | null
          match_id: string
          proof_url: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
          winner_confirmed: boolean | null
          winner_team_id: string | null
          winner_user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          loser_confirmed?: boolean | null
          match_id: string
          proof_url?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          winner_confirmed?: boolean | null
          winner_team_id?: string | null
          winner_user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          loser_confirmed?: boolean | null
          match_id?: string
          proof_url?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          winner_confirmed?: boolean | null
          winner_team_id?: string | null
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_results_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_results_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_results_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_winner_user_id_fkey"
            columns: ["winner_user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_results_winner_user_id_fkey"
            columns: ["winner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_results_winner_user_id_fkey"
            columns: ["winner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string | null
          creator_id: string
          entry_fee: number
          expires_at: string
          finished_at: string | null
          first_to: number | null
          game: string
          id: string
          is_private: boolean | null
          mode: string
          payment_mode_host: string | null
          payment_mode_joiner: string | null
          platform: string
          private_code: string | null
          region: string
          started_at: string | null
          status: string | null
          team_a_id: string | null
          team_b_id: string | null
          team_size: number | null
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          entry_fee: number
          expires_at: string
          finished_at?: string | null
          first_to?: number | null
          game?: string
          id?: string
          is_private?: boolean | null
          mode: string
          payment_mode_host?: string | null
          payment_mode_joiner?: string | null
          platform: string
          private_code?: string | null
          region: string
          started_at?: string | null
          status?: string | null
          team_a_id?: string | null
          team_b_id?: string | null
          team_size?: number | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          entry_fee?: number
          expires_at?: string
          finished_at?: string | null
          first_to?: number | null
          game?: string
          id?: string
          is_private?: boolean | null
          mode?: string
          payment_mode_host?: string | null
          payment_mode_joiner?: string | null
          platform?: string
          private_code?: string | null
          region?: string
          started_at?: string | null
          status?: string | null
          team_a_id?: string | null
          team_b_id?: string | null
          team_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          payload: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          payload?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          payload?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_earnings: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          match_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          match_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          match_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_earnings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_wallet: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          balance?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          epic_username: string | null
          iban: string | null
          id: string
          is_banned: boolean | null
          paypal_email: string | null
          preferred_platform: string | null
          preferred_region: string | null
          role: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          epic_username?: string | null
          iban?: string | null
          id?: string
          is_banned?: boolean | null
          paypal_email?: string | null
          preferred_platform?: string | null
          preferred_region?: string | null
          role?: string | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          epic_username?: string | null
          iban?: string | null
          id?: string
          is_banned?: boolean | null
          paypal_email?: string | null
          preferred_platform?: string | null
          preferred_region?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          role: string | null
          status: string | null
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          team_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          team_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          tag: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          tag: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          tag?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          match_id: string | null
          status: string | null
          stripe_session_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          match_id?: string | null
          status?: string | null
          stripe_session_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          match_id?: string | null
          status?: string | null
          stripe_session_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number | null
          created_at: string | null
          id: string
          locked_balance: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          id?: string
          locked_balance?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          payment_details: string
          payment_method: string
          processed_at: string | null
          processed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          payment_details: string
          payment_method: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          payment_details?: string
          payment_method?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          avatar_url: string | null
          id: string | null
          total_earnings: number | null
          total_matches: number | null
          user_id: string | null
          username: string | null
          wins: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          epic_username: string | null
          id: string | null
          preferred_platform: string | null
          preferred_region: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          epic_username?: string | null
          id?: string | null
          preferred_platform?: string | null
          preferred_region?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          epic_username?: string | null
          id?: string | null
          preferred_platform?: string | null
          preferred_region?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_resolve_dispute: {
        Args: {
          p_admin_notes?: string
          p_match_id: string
          p_winner_user_id: string
        }
        Returns: Json
      }
      admin_resolve_match_v2: {
        Args: { p_action: string; p_match_id: string; p_notes?: string }
        Returns: Json
      }
      cancel_match_v2: { Args: { p_match_id: string }; Returns: Json }
      check_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      complete_match_payout: {
        Args: { p_match_id: string; p_winner_user_id: string }
        Returns: Json
      }
      create_team: { Args: { p_name: string }; Returns: Json }
      create_team_match: {
        Args: {
          p_entry_fee: number
          p_first_to: number
          p_is_private?: boolean
          p_mode: string
          p_payment_mode: string
          p_platform: string
          p_region: string
          p_team_id: string
          p_team_size: number
        }
        Returns: Json
      }
      declare_match_result: {
        Args: { p_i_won: boolean; p_match_id: string }
        Returns: Json
      }
      delete_team: { Args: { p_team_id: string }; Returns: Json }
      expire_stale_matches: { Args: never; Returns: undefined }
      finalize_team_match: {
        Args: { p_match_id: string; p_winner_side: string }
        Returns: Json
      }
      get_team_members_with_balance: {
        Args: { p_team_id: string }
        Returns: {
          avatar_url: string
          balance: number
          has_sufficient_balance: boolean
          role: string
          user_id: string
          username: string
        }[]
      }
      has_active_match: { Args: { p_user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      join_match_v2: { Args: { p_match_id: string }; Returns: Json }
      join_team_match: {
        Args: { p_match_id: string; p_payment_mode?: string; p_team_id: string }
        Returns: Json
      }
      leave_match: { Args: { p_match_id: string }; Returns: Json }
      leave_team: { Args: { p_team_id: string }; Returns: Json }
      lock_funds_for_match: {
        Args: { p_amount: number; p_match_id: string }
        Returns: Json
      }
      process_withdrawal: {
        Args: {
          p_admin_notes?: string
          p_status: string
          p_withdrawal_id: string
        }
        Returns: Json
      }
      record_platform_fee: {
        Args: { p_fee_amount: number; p_match_id: string }
        Returns: Json
      }
      remove_team_member: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: Json
      }
      respond_to_invite: {
        Args: { p_action: string; p_team_id: string }
        Returns: Json
      }
      search_users_for_invite: {
        Args: { p_search_term: string; p_team_id: string }
        Returns: {
          avatar_url: string
          epic_username: string
          user_id: string
          username: string
        }[]
      }
      send_team_invite: {
        Args: { p_invitee_user_id: string; p_team_id: string }
        Returns: Json
      }
      set_player_ready: { Args: { p_match_id: string }; Returns: Json }
      submit_match_result: {
        Args: { p_match_id: string; p_result: string }
        Returns: Json
      }
      submit_team_result: {
        Args: { p_match_id: string; p_result: string }
        Returns: Json
      }
      team_has_active_match: { Args: { p_team_id: string }; Returns: Json }
      withdraw_platform_earnings: {
        Args: {
          p_amount: number
          p_payment_details: string
          p_payment_method: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
