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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_kinds: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          wallet_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          wallet_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_kinds_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          kind_id: string | null
          name: string
          sort_order: number
          updated_at: string
          wallet_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind_id?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          wallet_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          kind_id?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_kind_id_fkey"
            columns: ["kind_id"]
            isOneToOne: false
            referencedRelation: "account_kinds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          content: Json
          created_at: string
          dismissed_at: string | null
          id: string
          period_end: string | null
          period_start: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          dismissed_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          dismissed_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          mood: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: string
          mood?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          mood?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_memories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          conversation_id: string | null
          created_at: string
          domain: string
          id: string
          kind: string
          patch: Json | null
          resolved_at: string | null
          status: string
          summary: string
          target_id: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          domain: string
          id?: string
          kind: string
          patch?: Json | null
          resolved_at?: string | null
          status?: string
          summary: string
          target_id: string
          user_id: string
          wallet_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          domain?: string
          id?: string
          kind?: string
          patch?: Json | null
          resolved_at?: string | null
          status?: string
          summary?: string
          target_id?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          endpoint: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          endpoint: string
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          endpoint?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_reconciliations: {
        Row: {
          actual_balance_minor: number
          computed_balance_minor: number
          created_at: string
          id: string
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          actual_balance_minor: number
          computed_balance_minor: number
          created_at?: string
          id?: string
          status: string
          user_id: string
          wallet_id: string
        }
        Update: {
          actual_balance_minor?: number
          computed_balance_minor?: number
          created_at?: string
          id?: string
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_reconciliations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_reconciliations_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_challenges: {
        Row: {
          archived_at: string | null
          created_at: string
          creator_id: string
          end_date: string
          id: string
          invite_code: string
          name: string
          start_date: string
          target_metric: Json
          type: string
          updated_at: string
          wallet_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          creator_id: string
          end_date: string
          id?: string
          invite_code?: string
          name: string
          start_date: string
          target_metric: Json
          type: string
          updated_at?: string
          wallet_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          creator_id?: string
          end_date?: string
          id?: string
          invite_code?: string
          name?: string
          start_date?: string
          target_metric?: Json
          type?: string
          updated_at?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_challenges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_challenges_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount_minor: number
          category_id: string | null
          created_at: string
          end_date: string | null
          id: string
          period: string
          rollover: boolean
          start_date: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          amount_minor: number
          category_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          period: string
          rollover?: boolean
          start_date?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          amount_minor?: number
          category_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          period?: string
          rollover?: boolean
          start_date?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          parent_category_id: string | null
          wallet_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          parent_category_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          parent_category_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          match_type: string
          match_value: string
          wallet_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          match_type: string
          match_value: string
          wallet_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          match_type?: string
          match_value?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string
          joined_at: string
          progress: Json
          user_id: string
        }
        Insert: {
          challenge_id: string
          joined_at?: string
          progress?: Json
          user_id: string
        }
        Update: {
          challenge_id?: string
          joined_at?: string
          progress?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "budget_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_pacts: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string
          description: string
          end_date: string
          goal_id: string | null
          id: string
          stake_amount_minor: number | null
          stake_kind: string | null
          stake_note: string | null
          start_date: string
          wallet_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by: string
          description: string
          end_date: string
          goal_id?: string | null
          id?: string
          stake_amount_minor?: number | null
          stake_kind?: string | null
          stake_note?: string | null
          start_date?: string
          wallet_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          end_date?: string
          goal_id?: string | null
          id?: string
          stake_amount_minor?: number | null
          stake_kind?: string | null
          stake_note?: string | null
          start_date?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_pacts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_pacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_pacts_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_pacts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_checkins: {
        Row: {
          created_at: string
          dedupe_key: string | null
          due_at: string
          id: string
          kind: string
          message: string
          payload: Json
          ref_id: string | null
          responded_at: string | null
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          due_at?: string
          id?: string
          kind: string
          message: string
          payload?: Json
          ref_id?: string | null
          responded_at?: string | null
          status?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          due_at?: string
          id?: string
          kind?: string
          message?: string
          payload?: Json
          ref_id?: string | null
          responded_at?: string | null
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_checkins_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_letters: {
        Row: {
          body: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          title: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          title: string
          user_id: string
          wallet_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          title?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_letters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_letters_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          account_id: string | null
          amount_minor: number
          debt_id: string
          id: string
          paid_date: string
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount_minor: number
          debt_id: string
          id?: string
          paid_date?: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount_minor?: number
          debt_id?: string
          id?: string
          paid_date?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          archived_at: string | null
          balance_minor: number
          counterparty: string | null
          created_at: string
          direction: string
          due_date: string | null
          id: string
          interest_rate: number | null
          name: string
          principal_minor: number
          updated_at: string
          wallet_id: string
        }
        Insert: {
          archived_at?: string | null
          balance_minor: number
          counterparty?: string | null
          created_at?: string
          direction: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          name: string
          principal_minor: number
          updated_at?: string
          wallet_id: string
        }
        Update: {
          archived_at?: string | null
          balance_minor?: number
          counterparty?: string | null
          created_at?: string
          direction?: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          name?: string
          principal_minor?: number
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      deferred_questions: {
        Row: {
          ask_after: string
          context: Json
          created_at: string
          id: string
          question: string
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          ask_after?: string
          context?: Json
          created_at?: string
          id?: string
          question: string
          status?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          ask_after?: string
          context?: Json
          created_at?: string
          id?: string
          question?: string
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deferred_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deferred_questions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          current_period_end: string | null
          plan: string
          receipt_scan_preview_used: boolean
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          plan?: string
          receipt_scan_preview_used?: boolean
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          plan?: string
          receipt_scan_preview_used?: boolean
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          fetched_at: string
          quote_currency: string
          rate: number
        }
        Insert: {
          base_currency: string
          fetched_at?: string
          quote_currency: string
          rate: number
        }
        Update: {
          base_currency?: string
          fetched_at?: string
          quote_currency?: string
          rate?: number
        }
        Relationships: []
      }
      expense_split_shares: {
        Row: {
          id: string
          member_user_id: string
          settled: boolean
          share_minor: number
          split_id: string
        }
        Insert: {
          id?: string
          member_user_id: string
          settled?: boolean
          share_minor: number
          split_id: string
        }
        Update: {
          id?: string
          member_user_id?: string
          settled?: boolean
          share_minor?: number
          split_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_split_shares_member_user_id_fkey"
            columns: ["member_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_split_shares_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "expense_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          created_at: string
          created_by: string
          id: string
          transaction_id: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          transaction_id: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          transaction_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_visits: {
        Row: {
          first_visited_at: string
          id: string
          last_visited_at: string
          page: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          first_visited_at?: string
          id?: string
          last_visited_at?: string
          page: string
          user_id: string
          wallet_id: string
        }
        Update: {
          first_visited_at?: string
          id?: string
          last_visited_at?: string
          page?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_visits_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_missions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          start_date: string
          status: string
          title: string
          wallet_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          start_date?: string
          status?: string
          title: string
          wallet_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          title?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_missions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          dedupe_key: string | null
          href: string
          id: string
          kind: string
          opened_at: string | null
          payload: Json
          push_sent_at: string | null
          read_at: string | null
          title: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          dedupe_key?: string | null
          href?: string
          id?: string
          kind: string
          opened_at?: string | null
          payload?: Json
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          href?: string
          id?: string
          kind?: string
          opened_at?: string | null
          payload?: Json
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_consent: Json
          ai_personality: string
          ai_trust: Json
          avatar_url: string | null
          blind_budgeting: boolean
          companion_prefs: Json
          created_at: string
          default_currency: string
          display_name: string | null
          engagement_stats: Json
          gender: string
          habits_goal_id: string | null
          home_card_colors: Json
          home_card_order: Json
          household_size: number | null
          id: string
          income_range: string | null
          life_event: Json | null
          mode: string
          notification_opt_in: boolean
          notification_prefs: Json
          onboarding_completed_at: string | null
          pay_yourself_first_pct: number
          primary_goal: string | null
          primary_goals: string[] | null
          round_up_enabled: boolean
          scheduled_deletion_at: string | null
          tax_reserve_pct: number
          timezone: string | null
        }
        Insert: {
          ai_consent?: Json
          ai_personality?: string
          ai_trust?: Json
          avatar_url?: string | null
          blind_budgeting?: boolean
          companion_prefs?: Json
          created_at?: string
          default_currency?: string
          display_name?: string | null
          engagement_stats?: Json
          gender?: string
          habits_goal_id?: string | null
          home_card_colors?: Json
          home_card_order?: Json
          household_size?: number | null
          id: string
          income_range?: string | null
          life_event?: Json | null
          mode?: string
          notification_opt_in?: boolean
          notification_prefs?: Json
          onboarding_completed_at?: string | null
          pay_yourself_first_pct?: number
          primary_goal?: string | null
          primary_goals?: string[] | null
          round_up_enabled?: boolean
          scheduled_deletion_at?: string | null
          tax_reserve_pct?: number
          timezone?: string | null
        }
        Update: {
          ai_consent?: Json
          ai_personality?: string
          ai_trust?: Json
          avatar_url?: string | null
          blind_budgeting?: boolean
          companion_prefs?: Json
          created_at?: string
          default_currency?: string
          display_name?: string | null
          engagement_stats?: Json
          gender?: string
          habits_goal_id?: string | null
          home_card_colors?: Json
          home_card_order?: Json
          household_size?: number | null
          id?: string
          income_range?: string | null
          life_event?: Json | null
          mode?: string
          notification_opt_in?: boolean
          notification_prefs?: Json
          onboarding_completed_at?: string | null
          pay_yourself_first_pct?: number
          primary_goal?: string | null
          primary_goals?: string[] | null
          round_up_enabled?: boolean
          scheduled_deletion_at?: string | null
          tax_reserve_pct?: number
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_habits_goal_id_fkey"
            columns: ["habits_goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_attempts: {
        Row: {
          created_at: string
          error: string | null
          id: string
          notification_id: string | null
          status: string
          status_code: number | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status: string
          status_code?: number | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status?: string
          status_code?: number | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          subscription_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload: Json
          subscription_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload?: Json
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          disabled_at: string | null
          endpoint: string
          failure_count: number
          id: string
          keys: Json
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          endpoint: string
          failure_count?: number
          id?: string
          keys: Json
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          endpoint?: string
          failure_count?: number
          id?: string
          keys?: Json
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          created_at: string
          created_by: string
          frequency: string
          id: string
          is_active: boolean
          last_run_date: string | null
          next_run_date: string
          template: Json
          updated_at: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          frequency: string
          id?: string
          is_active?: boolean
          last_run_date?: string | null
          next_run_date: string
          template: Json
          updated_at?: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_date?: string | null
          next_run_date?: string
          template?: Json
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_contributions: {
        Row: {
          amount_minor: number
          automation_kind: string | null
          contributed_date: string
          created_at: string
          created_by: string | null
          goal_id: string
          id: string
          source_transaction_id: string | null
        }
        Insert: {
          amount_minor: number
          automation_kind?: string | null
          contributed_date?: string
          created_at?: string
          created_by?: string | null
          goal_id: string
          id?: string
          source_transaction_id?: string | null
        }
        Update: {
          amount_minor?: number
          automation_kind?: string | null
          contributed_date?: string
          created_at?: string
          created_by?: string | null
          goal_id?: string
          id?: string
          source_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_contributions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_contributions_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          archived_at: string | null
          assigned_member_id: string | null
          created_at: string
          current_amount_minor: number
          icon: string | null
          id: string
          image_path: string | null
          motivation: string | null
          name: string
          target_amount_minor: number
          target_date: string | null
          updated_at: string
          wallet_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_member_id?: string | null
          created_at?: string
          current_amount_minor?: number
          icon?: string | null
          id?: string
          image_path?: string | null
          motivation?: string | null
          name: string
          target_amount_minor: number
          target_date?: string | null
          updated_at?: string
          wallet_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_member_id?: string | null
          created_at?: string
          current_amount_minor?: number
          icon?: string | null
          id?: string
          image_path?: string | null
          motivation?: string | null
          name?: string
          target_amount_minor?: number
          target_date?: string | null
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_plan_shares: {
        Row: {
          allocated_minor: number
          member_id: string
          plan_id: string
        }
        Insert: {
          allocated_minor: number
          member_id: string
          plan_id: string
        }
        Update: {
          allocated_minor?: number
          member_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_plan_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_plan_shares_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "spending_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_plans: {
        Row: {
          created_at: string
          created_by: string
          id: string
          intended_amount_minor: number
          month: string
          reflection: string | null
          updated_at: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          intended_amount_minor: number
          month: string
          reflection?: string | null
          updated_at?: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          intended_amount_minor?: number
          month?: string
          reflection?: string | null
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_plans_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_line_items: {
        Row: {
          amount_minor: number
          description: string | null
          id: string
          quantity: number
          transaction_id: string
        }
        Insert: {
          amount_minor: number
          description?: string | null
          id?: string
          quantity?: number
          transaction_id: string
        }
        Update: {
          amount_minor?: number
          description?: string | null
          id?: string
          quantity?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_line_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          ai_category_confidence: number | null
          ai_extraction: Json | null
          amount_minor: number
          category_id: string | null
          converted_amount_minor: number | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          description: string | null
          fx_rate_to_wallet_base: number | null
          id: string
          merchant: string | null
          receipt_storage_path: string | null
          source: string
          transaction_date: string
          transfer_group_id: string | null
          type: string
          updated_at: string
          user_confirmed: boolean
          version: number
          wallet_id: string
        }
        Insert: {
          account_id?: string | null
          ai_category_confidence?: number | null
          ai_extraction?: Json | null
          amount_minor: number
          category_id?: string | null
          converted_amount_minor?: number | null
          created_at?: string
          created_by: string
          currency: string
          deleted_at?: string | null
          description?: string | null
          fx_rate_to_wallet_base?: number | null
          id?: string
          merchant?: string | null
          receipt_storage_path?: string | null
          source: string
          transaction_date?: string
          transfer_group_id?: string | null
          type: string
          updated_at?: string
          user_confirmed?: boolean
          version?: number
          wallet_id: string
        }
        Update: {
          account_id?: string | null
          ai_category_confidence?: number | null
          ai_extraction?: Json | null
          amount_minor?: number
          category_id?: string | null
          converted_amount_minor?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          fx_rate_to_wallet_base?: number | null
          id?: string
          merchant?: string | null
          receipt_storage_path?: string | null
          source?: string
          transaction_date?: string
          transfer_group_id?: string | null
          type?: string
          updated_at?: string
          user_confirmed?: boolean
          version?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_invites: {
        Row: {
          created_at: string
          email_sent_at: string | null
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          invited_user_id: string | null
          resend_count: number
          responded_at: string | null
          role: string
          status: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          invited_user_id?: string | null
          resend_count?: number
          responded_at?: string | null
          role: string
          status?: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          invited_user_id?: string | null
          resend_count?: number
          responded_at?: string | null
          role?: string
          status?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_invites_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_members: {
        Row: {
          joined_at: string
          role: string
          seat_label: string | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          joined_at?: string
          role: string
          seat_label?: string | null
          user_id: string
          wallet_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          seat_label?: string | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_members_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string
          id: string
          is_shared: boolean
          name: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          created_by: string
          id?: string
          is_shared?: boolean
          name: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string
          id?: string
          is_shared?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_wallet_invite: {
        Args: { p_invite_id: string }
        Returns: {
          joined_at: string
          role: string
          seat_label: string | null
          user_id: string
          wallet_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_money_habits: { Args: { p_transaction_id: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests: number
          p_user_id: string
          p_window_minutes: number
        }
        Returns: boolean
      }
      claim_receipt_scan_preview: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      create_challenge: {
        Args: {
          p_end_date: string
          p_name: string
          p_start_date: string
          p_target_metric: Json
          p_type: string
          p_wallet_id?: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          creator_id: string
          end_date: string
          id: string
          invite_code: string
          name: string
          start_date: string
          target_metric: Json
          type: string
          updated_at: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "budget_challenges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_wallet_invite: {
        Args: { p_email: string; p_role?: string; p_wallet_id: string }
        Returns: {
          created_at: string
          email_sent_at: string | null
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          invited_user_id: string | null
          resend_count: number
          responded_at: string | null
          role: string
          status: string
          wallet_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_wallet_with_owner: {
        Args: { p_base_currency?: string; p_name: string }
        Returns: {
          base_currency: string
          created_at: string
          created_by: string
          id: string
          is_shared: boolean
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_wallet_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      default_account_id: { Args: { p_wallet_id: string }; Returns: string }
      get_budget_progress: {
        Args: { p_wallet_id: string }
        Returns: {
          amount_minor: number
          budget_id: string
          carried_over_minor: number
          category_id: string
          effective_amount_minor: number
          period: string
          period_end: string
          period_start: string
          rollover: boolean
          spent_minor: number
        }[]
      }
      get_challenge_leaderboard: {
        Args: { p_challenge_id: string }
        Returns: {
          display_name: string
          joined_at: string
          user_id: string
          value: number
        }[]
      }
      get_my_wallet_invites: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_by_name: string
          role: string
          wallet_id: string
          wallet_name: string
        }[]
      }
      get_wallet_members: {
        Args: { p_wallet_id: string }
        Returns: {
          display_name: string
          email: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      get_wallet_spending_summary: {
        Args: { p_since: string; p_until: string; p_wallet_id: string }
        Returns: Json
      }
      is_challenge_participant: {
        Args: { p_challenge_id: string }
        Returns: boolean
      }
      is_premium: { Args: { p_user_id: string }; Returns: boolean }
      is_wallet_member: {
        Args: { p_min_role?: string; p_wallet_id: string }
        Returns: boolean
      }
      join_challenge: {
        Args: { p_invite_code: string }
        Returns: {
          archived_at: string | null
          created_at: string
          creator_id: string
          end_date: string
          id: string
          invite_code: string
          name: string
          start_date: string
          target_metric: Json
          type: string
          updated_at: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "budget_challenges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_borrow_or_lend: {
        Args: {
          p_amount_minor: number
          p_category_id: string
          p_counterparty: string
          p_currency: string
          p_debt_name: string
          p_direction: string
          p_due_date: string
          p_transaction_date: string
          p_wallet_id: string
        }
        Returns: {
          debt_id: string
          transaction_id: string
        }[]
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_wallet_invite_delivered: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      materialize_recurring_transactions: { Args: never; Returns: undefined }
      record_notification_open: { Args: { p_id: string }; Returns: undefined }
      revoke_wallet_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      transaction_ledger_minor: {
        Args: { t: Database["public"]["Tables"]["transactions"]["Row"] }
        Returns: number
      }
      upsert_coaching_notification: {
        Args: {
          p_body: string
          p_dedupe_key: string
          p_href: string
          p_title: string
          p_wallet_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
