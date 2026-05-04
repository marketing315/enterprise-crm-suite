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
      access_review_items: {
        Row: {
          created_at: string
          current_role_label: string | null
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_notes: string | null
          id: string
          last_login_at: string | null
          review_id: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_role_label?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_notes?: string | null
          id?: string
          last_login_at?: string | null
          review_id: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_role_label?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_notes?: string | null
          id?: string
          last_login_at?: string | null
          review_id?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "access_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      access_reviews: {
        Row: {
          brand_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          review_period: string
          reviewed_users: number
          reviewer_user_id: string | null
          revoked_count: number
          started_at: string | null
          status: string
          total_users: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          review_period: string
          reviewed_users?: number
          reviewer_user_id?: string | null
          revoked_count?: number
          started_at?: string | null
          status?: string
          total_users?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          review_period?: string
          reviewed_users?: number
          reviewer_user_id?: string | null
          revoked_count?: number
          started_at?: string | null
          status?: string
          total_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      action_suggestions: {
        Row: {
          acted_on_at: string | null
          acted_on_by: string | null
          brand_id: string
          confidence: number
          created_at: string
          description: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          metadata: Json | null
          priority: number
          suggestion_type: string
          title: string
          user_id: string | null
        }
        Insert: {
          acted_on_at?: string | null
          acted_on_by?: string | null
          brand_id: string
          confidence: number
          created_at?: string
          description?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          priority?: number
          suggestion_type: string
          title: string
          user_id?: string | null
        }
        Update: {
          acted_on_at?: string | null
          acted_on_by?: string | null
          brand_id?: string
          confidence?: number
          created_at?: string
          description?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          priority?: number
          suggestion_type?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_suggestions_acted_on_by_fkey"
            columns: ["acted_on_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_suggestions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_suggestions_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creative_stats: {
        Row: {
          account_id: string
          brand_id: string
          clicks: number
          conversions: number | null
          created_at: string
          currency: string
          external_ad_id: string
          external_ad_name: string | null
          external_campaign_id: string
          external_campaign_name: string | null
          frequency: number | null
          id: string
          imported_at: string
          impressions: number
          platform: Database["public"]["Enums"]["ad_platform"]
          reach: number | null
          spend: number
          stat_date: string
          thumbnail_url: string | null
        }
        Insert: {
          account_id: string
          brand_id: string
          clicks?: number
          conversions?: number | null
          created_at?: string
          currency?: string
          external_ad_id: string
          external_ad_name?: string | null
          external_campaign_id: string
          external_campaign_name?: string | null
          frequency?: number | null
          id?: string
          imported_at?: string
          impressions?: number
          platform?: Database["public"]["Enums"]["ad_platform"]
          reach?: number | null
          spend?: number
          stat_date: string
          thumbnail_url?: string | null
        }
        Update: {
          account_id?: string
          brand_id?: string
          clicks?: number
          conversions?: number | null
          created_at?: string
          currency?: string
          external_ad_id?: string
          external_ad_name?: string | null
          external_campaign_id?: string
          external_campaign_name?: string | null
          frequency?: number | null
          id?: string
          imported_at?: string
          impressions?: number
          platform?: Database["public"]["Enums"]["ad_platform"]
          reach?: number | null
          spend?: number
          stat_date?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creative_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_demographic_stats: {
        Row: {
          account_id: string
          age_range: string
          brand_id: string
          clicks: number
          conversions: number | null
          created_at: string
          external_campaign_id: string
          gender: string
          id: string
          imported_at: string
          impressions: number
          platform: Database["public"]["Enums"]["ad_platform"]
          reach: number | null
          spend: number
          stat_date: string
        }
        Insert: {
          account_id: string
          age_range: string
          brand_id: string
          clicks?: number
          conversions?: number | null
          created_at?: string
          external_campaign_id: string
          gender: string
          id?: string
          imported_at?: string
          impressions?: number
          platform?: Database["public"]["Enums"]["ad_platform"]
          reach?: number | null
          spend?: number
          stat_date: string
        }
        Update: {
          account_id?: string
          age_range?: string
          brand_id?: string
          clicks?: number
          conversions?: number | null
          created_at?: string
          external_campaign_id?: string
          gender?: string
          id?: string
          imported_at?: string
          impressions?: number
          platform?: Database["public"]["Enums"]["ad_platform"]
          reach?: number | null
          spend?: number
          stat_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_demographic_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_platform_stats: {
        Row: {
          account_id: string
          brand_id: string
          campaign_id: string | null
          clicks: number
          conversions: number | null
          conversions_value: number | null
          created_at: string
          currency: string
          external_campaign_id: string
          external_campaign_name: string | null
          frequency: number | null
          id: string
          imported_at: string
          impressions: number
          platform: Database["public"]["Enums"]["ad_platform"]
          raw_data: Json | null
          reach: number | null
          spend: number
          stat_date: string
        }
        Insert: {
          account_id: string
          brand_id: string
          campaign_id?: string | null
          clicks?: number
          conversions?: number | null
          conversions_value?: number | null
          created_at?: string
          currency?: string
          external_campaign_id: string
          external_campaign_name?: string | null
          frequency?: number | null
          id?: string
          imported_at?: string
          impressions?: number
          platform: Database["public"]["Enums"]["ad_platform"]
          raw_data?: Json | null
          reach?: number | null
          spend?: number
          stat_date: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          campaign_id?: string | null
          clicks?: number
          conversions?: number | null
          conversions_value?: number | null
          created_at?: string
          currency?: string
          external_campaign_id?: string
          external_campaign_name?: string | null
          frequency?: number | null
          id?: string
          imported_at?: string
          impressions?: number
          platform?: Database["public"]["Enums"]["ad_platform"]
          raw_data?: Json | null
          reach?: number | null
          spend?: number
          stat_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_platform_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_platform_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sync_log: {
        Row: {
          account_id: string
          brand_id: string | null
          campaigns_synced: number | null
          created_at: string | null
          error_message: string | null
          id: string
          provider: string
          success: boolean
          sync_from: string
          sync_to: string
        }
        Insert: {
          account_id: string
          brand_id?: string | null
          campaigns_synced?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          provider: string
          success: boolean
          sync_from: string
          sync_to: string
        }
        Update: {
          account_id?: string
          brand_id?: string | null
          campaigns_synced?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          provider?: string
          success?: boolean
          sync_from?: string
          sync_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sync_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          brand_id: string
          content: string
          created_at: string | null
          created_by: string
          id: string
          ref_id: string | null
          ref_table: string | null
          type: string
        }
        Insert: {
          brand_id: string
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          ref_id?: string | null
          ref_table?: string | null
          type: string
        }
        Update: {
          brand_id?: string
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          ref_id?: string | null
          ref_table?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_todos: {
        Row: {
          brand_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string
          display_order: number
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_todos_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_todos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_action_decisions: {
        Row: {
          brand_id: string
          decided_at: string
          decided_by: string
          decision: Database["public"]["Enums"]["call_action_decision_status"]
          edited_changes: Json | null
          id: string
          proposal_id: string
          rejection_reason: string | null
        }
        Insert: {
          brand_id: string
          decided_at?: string
          decided_by: string
          decision: Database["public"]["Enums"]["call_action_decision_status"]
          edited_changes?: Json | null
          id?: string
          proposal_id: string
          rejection_reason?: string | null
        }
        Update: {
          brand_id?: string
          decided_at?: string
          decided_by?: string
          decision?: Database["public"]["Enums"]["call_action_decision_status"]
          edited_changes?: Json | null
          id?: string
          proposal_id?: string
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_action_decisions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_decisions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_call_action_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_action_executions: {
        Row: {
          brand_id: string
          created_at: string
          decision_id: string
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          idempotency_key: string
          proposal_id: string
          result_snapshot: Json | null
          status: Database["public"]["Enums"]["call_action_execution_status"]
        }
        Insert: {
          brand_id: string
          created_at?: string
          decision_id: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key: string
          proposal_id: string
          result_snapshot?: Json | null
          status?: Database["public"]["Enums"]["call_action_execution_status"]
        }
        Update: {
          brand_id?: string
          created_at?: string
          decision_id?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key?: string
          proposal_id?: string
          result_snapshot?: Json | null
          status?: Database["public"]["Enums"]["call_action_execution_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_action_executions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_executions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "ai_call_action_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_executions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_call_action_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_action_proposals: {
        Row: {
          action_label: string
          action_type: Database["public"]["Enums"]["call_action_type"]
          ai_confidence: number | null
          ai_model: string
          ai_prompt_version: string
          ai_rationale: string | null
          brand_id: string
          call_log_id: string
          contact_id: string | null
          created_at: string
          current_snapshot: Json | null
          deal_id: string | null
          decision_status: Database["public"]["Enums"]["call_action_decision_status"]
          display_order: number
          id: string
          proposed_changes: Json
          transcript_excerpt: string | null
          transcript_id: string | null
          updated_at: string
        }
        Insert: {
          action_label: string
          action_type: Database["public"]["Enums"]["call_action_type"]
          ai_confidence?: number | null
          ai_model?: string
          ai_prompt_version?: string
          ai_rationale?: string | null
          brand_id: string
          call_log_id: string
          contact_id?: string | null
          created_at?: string
          current_snapshot?: Json | null
          deal_id?: string | null
          decision_status?: Database["public"]["Enums"]["call_action_decision_status"]
          display_order?: number
          id?: string
          proposed_changes?: Json
          transcript_excerpt?: string | null
          transcript_id?: string | null
          updated_at?: string
        }
        Update: {
          action_label?: string
          action_type?: Database["public"]["Enums"]["call_action_type"]
          ai_confidence?: number | null
          ai_model?: string
          ai_prompt_version?: string
          ai_rationale?: string | null
          brand_id?: string
          call_log_id?: string
          contact_id?: string | null
          created_at?: string
          current_snapshot?: Json | null
          deal_id?: string | null
          decision_status?: Database["public"]["Enums"]["call_action_decision_status"]
          display_order?: number
          id?: string
          proposed_changes?: Json
          transcript_excerpt?: string | null
          transcript_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_action_proposals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_proposals_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_action_proposals_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "call_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_logs: {
        Row: {
          brand_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          flagged_incorrect: boolean | null
          flagged_reason: string | null
          id: string
          input_text: string
          latency_ms: number | null
          output_text: string | null
          prompt_version: string | null
          status: string
          tokens_used: number | null
          tool_name: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          flagged_incorrect?: boolean | null
          flagged_reason?: string | null
          id?: string
          input_text: string
          latency_ms?: number | null
          output_text?: string | null
          prompt_version?: string | null
          status?: string
          tokens_used?: number | null
          tool_name?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          flagged_incorrect?: boolean | null
          flagged_reason?: string | null
          id?: string
          input_text?: string
          latency_ms?: number | null
          output_text?: string | null
          prompt_version?: string | null
          status?: string
          tokens_used?: number | null
          tool_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_runs: {
        Row: {
          assistant_message_id: string | null
          brand_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string | null
          status: string
          thread_id: string
          tokens_used: number | null
          tools_json: Json | null
          user_id: string
          user_message_id: string | null
        }
        Insert: {
          assistant_message_id?: string | null
          brand_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          status?: string
          thread_id: string
          tokens_used?: number | null
          tools_json?: Json | null
          user_id: string
          user_message_id?: string | null
        }
        Update: {
          assistant_message_id?: string | null
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          status?: string
          thread_id?: string
          tokens_used?: number | null
          tools_json?: Json | null
          user_id?: string
          user_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_runs_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_runs_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_configs: {
        Row: {
          active_prompt_version: string | null
          brand_id: string
          confidence_threshold: number | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["ai_mode"]
          rules_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_prompt_version?: string | null
          brand_id: string
          confidence_threshold?: number | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["ai_mode"]
          rules_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_prompt_version?: string | null
          brand_id?: string
          confidence_threshold?: number | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["ai_mode"]
          rules_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_configs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decision_logs: {
        Row: {
          ai_job_id: string | null
          appointment_action: string | null
          brand_id: string
          confidence: number | null
          created_at: string
          id: string
          initial_stage_name: string | null
          lead_event_id: string
          lead_type: string
          model_version: string
          original_decision: Json | null
          overridden_at: string | null
          overridden_by_user_id: string | null
          override_reason: string | null
          override_reason_category:
            | Database["public"]["Enums"]["override_reason_category"]
            | null
          priority: number
          prompt_version: string
          rationale: string
          raw_response: Json | null
          should_create_or_update_appointment: boolean
          should_create_ticket: boolean
          tags_to_apply: string[]
          ticket_type: string | null
          was_overridden: boolean
        }
        Insert: {
          ai_job_id?: string | null
          appointment_action?: string | null
          brand_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          initial_stage_name?: string | null
          lead_event_id: string
          lead_type: string
          model_version: string
          original_decision?: Json | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          override_reason_category?:
            | Database["public"]["Enums"]["override_reason_category"]
            | null
          priority: number
          prompt_version?: string
          rationale: string
          raw_response?: Json | null
          should_create_or_update_appointment?: boolean
          should_create_ticket?: boolean
          tags_to_apply?: string[]
          ticket_type?: string | null
          was_overridden?: boolean
        }
        Update: {
          ai_job_id?: string | null
          appointment_action?: string | null
          brand_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          initial_stage_name?: string | null
          lead_event_id?: string
          lead_type?: string
          model_version?: string
          original_decision?: Json | null
          overridden_at?: string | null
          overridden_by_user_id?: string | null
          override_reason?: string | null
          override_reason_category?:
            | Database["public"]["Enums"]["override_reason_category"]
            | null
          priority?: number
          prompt_version?: string
          rationale?: string
          raw_response?: Json | null
          should_create_or_update_appointment?: boolean
          should_create_ticket?: boolean
          tags_to_apply?: string[]
          ticket_type?: string | null
          was_overridden?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_logs_ai_job_id_fkey"
            columns: ["ai_job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_logs_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_logs_overridden_by_user_id_fkey"
            columns: ["overridden_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          ai_decision_id: string
          brand_id: string
          corrected_output_json: Json | null
          created_at: string
          id: string
          label: string
          note: string | null
          user_id: string
        }
        Insert: {
          ai_decision_id: string
          brand_id: string
          corrected_output_json?: Json | null
          created_at?: string
          id?: string
          label: string
          note?: string | null
          user_id: string
        }
        Update: {
          ai_decision_id?: string
          brand_id?: string
          corrected_output_json?: Json | null
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_ai_decision_id_fkey"
            columns: ["ai_decision_id"]
            isOneToOne: false
            referencedRelation: "ai_decision_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempts: number
          brand_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          lead_event_id: string
          max_attempts: number
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lead_event_id: string
          max_attempts?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lead_event_id?: string
          max_attempts?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: true
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          brand_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          version: string
        }
        Insert: {
          brand_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          version: string
        }
        Update: {
          brand_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tag_deal_jobs: {
        Row: {
          attempts: number | null
          brand_id: string
          completed_at: string | null
          created_at: string | null
          deal_id: string
          id: string
          last_error: string | null
          max_attempts: number | null
          started_at: string | null
          status: string | null
          trigger_reason: string
        }
        Insert: {
          attempts?: number | null
          brand_id: string
          completed_at?: string | null
          created_at?: string | null
          deal_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          started_at?: string | null
          status?: string | null
          trigger_reason: string
        }
        Update: {
          attempts?: number | null
          brand_id?: string
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          started_at?: string | null
          status?: string | null
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tag_deal_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tag_deal_jobs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_baselines: {
        Row: {
          brand_id: string | null
          computed_at: string
          id: string
          mean_value: number
          metric_name: string
          sample_count: number
          stddev_value: number
          window_hours: number
        }
        Insert: {
          brand_id?: string | null
          computed_at?: string
          id?: string
          mean_value: number
          metric_name: string
          sample_count: number
          stddev_value: number
          window_hours?: number
        }
        Update: {
          brand_id?: string | null
          computed_at?: string
          id?: string
          mean_value?: number
          metric_name?: string
          sample_count?: number
          stddev_value?: number
          window_hours?: number
        }
        Relationships: []
      }
      anomaly_detections: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          brand_id: string | null
          context: Json | null
          detected_at: string
          direction: string
          expected_value: number
          id: string
          metric_name: string
          observed_value: number
          severity: string
          z_score: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          brand_id?: string | null
          context?: Json | null
          detected_at?: string
          direction: string
          expected_value: number
          id?: string
          metric_name: string
          observed_value: number
          severity: string
          z_score: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          brand_id?: string | null
          context?: Json | null
          detected_at?: string
          direction?: string
          expected_value?: number
          id?: string
          metric_name?: string
          observed_value?: number
          severity?: string
          z_score?: number
        }
        Relationships: []
      }
      appointment_outcomes: {
        Row: {
          appointment_id: string
          brand_id: string
          created_at: string
          id: string
          metadata: Json
          next_action: string | null
          outcome_code: Database["public"]["Enums"]["appointment_outcome_code"]
          outcome_notes: string | null
          recorded_at: string
          recorded_by_user_id: string | null
          reschedule_reason: string | null
        }
        Insert: {
          appointment_id: string
          brand_id: string
          created_at?: string
          id?: string
          metadata?: Json
          next_action?: string | null
          outcome_code: Database["public"]["Enums"]["appointment_outcome_code"]
          outcome_notes?: string | null
          recorded_at?: string
          recorded_by_user_id?: string | null
          reschedule_reason?: string | null
        }
        Update: {
          appointment_id?: string
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          next_action?: string | null
          outcome_code?: Database["public"]["Enums"]["appointment_outcome_code"]
          outcome_notes?: string | null
          recorded_at?: string
          recorded_by_user_id?: string | null
          reschedule_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_outcomes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          address: string | null
          appointment_order: number | null
          appointment_type:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          assigned_sales_user_id: string | null
          brand_id: string
          cap: string | null
          city: string | null
          contact_id: string
          created_at: string
          created_by_user_id: string | null
          deal_id: string | null
          duration_minutes: number
          id: string
          last_outcome_at: string | null
          last_outcome_code:
            | Database["public"]["Enums"]["appointment_outcome_code"]
            | null
          notes: string | null
          parent_appointment_id: string | null
          reschedule_count: number
          reschedule_reason: string | null
          risk_score: number | null
          scheduled_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          appointment_order?: number | null
          appointment_type?:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          assigned_sales_user_id?: string | null
          brand_id: string
          cap?: string | null
          city?: string | null
          contact_id: string
          created_at?: string
          created_by_user_id?: string | null
          deal_id?: string | null
          duration_minutes?: number
          id?: string
          last_outcome_at?: string | null
          last_outcome_code?:
            | Database["public"]["Enums"]["appointment_outcome_code"]
            | null
          notes?: string | null
          parent_appointment_id?: string | null
          reschedule_count?: number
          reschedule_reason?: string | null
          risk_score?: number | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          appointment_order?: number | null
          appointment_type?:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          assigned_sales_user_id?: string | null
          brand_id?: string
          cap?: string | null
          city?: string | null
          contact_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deal_id?: string | null
          duration_minutes?: number
          id?: string
          last_outcome_at?: string | null
          last_outcome_code?:
            | Database["public"]["Enums"]["appointment_outcome_code"]
            | null
          notes?: string | null
          parent_appointment_id?: string | null
          reschedule_count?: number
          reschedule_reason?: string | null
          risk_score?: number | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_sales_user_id_fkey"
            columns: ["assigned_sales_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_appointment_id_fkey"
            columns: ["parent_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_access_log: {
        Row: {
          access_type: string
          accessed_at: string
          accessed_by: string
          accessed_by_display_name: string | null
          brand_id: string | null
          filters: Json | null
          id: string
          ip_hash: string | null
          reason: string | null
          result_count: number | null
          user_agent: string | null
        }
        Insert: {
          access_type: string
          accessed_at?: string
          accessed_by: string
          accessed_by_display_name?: string | null
          brand_id?: string | null
          filters?: Json | null
          id?: string
          ip_hash?: string | null
          reason?: string | null
          result_count?: number | null
          user_agent?: string | null
        }
        Update: {
          access_type?: string
          accessed_at?: string
          accessed_by?: string
          accessed_by_display_name?: string | null
          brand_id?: string | null
          filters?: Json | null
          id?: string
          ip_hash?: string | null
          reason?: string | null
          result_count?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      audit_alert_channels: {
        Row: {
          anomaly_types: string[]
          brand_id: string
          channel_type: string
          created_at: string
          created_by: string | null
          destination: string
          id: string
          is_active: boolean
          mask_pii: boolean
          min_severity: string
          name: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          anomaly_types?: string[]
          brand_id?: string
          channel_type: string
          created_at?: string
          created_by?: string | null
          destination: string
          id?: string
          is_active?: boolean
          mask_pii?: boolean
          min_severity?: string
          name: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          anomaly_types?: string[]
          brand_id?: string
          channel_type?: string
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          is_active?: boolean
          mask_pii?: boolean
          min_severity?: string
          name?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      audit_alert_deliveries: {
        Row: {
          anomaly_id: string | null
          attempt_count: number
          brand_id: string
          channel_id: string
          created_at: string
          error_message: string | null
          id: string
          payload: Json | null
          response_status: number | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          anomaly_id?: string | null
          attempt_count?: number
          brand_id: string
          channel_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          response_status?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          anomaly_id?: string | null
          attempt_count?: number
          brand_id?: string
          channel_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          response_status?: number | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_alert_deliveries_anomaly_id_fkey"
            columns: ["anomaly_id"]
            isOneToOne: false
            referencedRelation: "audit_anomalies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_alert_deliveries_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "audit_alert_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_anomalies: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          actor_user_id: string | null
          anomaly_type: string
          brand_id: string
          created_at: string
          description: string | null
          details: Json
          detected_at: string
          id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actor_user_id?: string | null
          anomaly_type: string
          brand_id?: string
          created_at?: string
          description?: string | null
          details?: Json
          detected_at?: string
          id?: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actor_user_id?: string | null
          anomaly_type?: string
          brand_id?: string
          created_at?: string
          description?: string | null
          details?: Json
          detected_at?: string
          id?: string
          severity?: string
          title?: string
        }
        Relationships: []
      }
      audit_compliance_reports: {
        Row: {
          brand_id: string
          checksum: string
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          report_type: string
          summary: Json
        }
        Insert: {
          brand_id: string
          checksum: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          report_type: string
          summary?: Json
        }
        Update: {
          brand_id?: string
          checksum?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          report_type?: string
          summary?: Json
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_display_name: string | null
          actor_type: string
          actor_user_id: string | null
          brand_id: string
          changed_fields: string[] | null
          correlation_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          search_text: string | null
          source: string
        }
        Insert: {
          action: string
          actor_display_name?: string | null
          actor_type?: string
          actor_user_id?: string | null
          brand_id: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          search_text?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_display_name?: string | null
          actor_type?: string
          actor_user_id?: string | null
          brand_id?: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          search_text?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events_archive: {
        Row: {
          action: string
          actor_display_name: string | null
          actor_type: string
          actor_user_id: string | null
          archived_at: string
          brand_id: string
          changed_fields: string[] | null
          correlation_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          source: string
        }
        Insert: {
          action: string
          actor_display_name?: string | null
          actor_type: string
          actor_user_id?: string | null
          archived_at?: string
          brand_id: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata?: Json
          new_value?: Json | null
          occurred_at: string
          old_value?: Json | null
          source: string
        }
        Update: {
          action?: string
          actor_display_name?: string | null
          actor_type?: string
          actor_user_id?: string | null
          archived_at?: string
          brand_id?: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          source?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          brand_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          brand_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          brand_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_pii_policies: {
        Row: {
          created_at: string
          description: string | null
          exempt_roles: string[]
          field_pattern: string
          id: string
          is_active: boolean
          strategy: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exempt_roles?: string[]
          field_pattern: string
          id?: string
          is_active?: boolean
          strategy: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exempt_roles?: string[]
          field_pattern?: string
          id?: string
          is_active?: boolean
          strategy?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_retention_policies: {
        Row: {
          archive_enabled: boolean
          brand_id: string
          created_at: string
          id: string
          last_archived_count: number | null
          last_purge_at: string | null
          last_purged_count: number | null
          retention_months: number
          updated_at: string
        }
        Insert: {
          archive_enabled?: boolean
          brand_id: string
          created_at?: string
          id?: string
          last_archived_count?: number | null
          last_purge_at?: string | null
          last_purged_count?: number | null
          retention_months?: number
          updated_at?: string
        }
        Update: {
          archive_enabled?: boolean
          brand_id?: string
          created_at?: string
          id?: string
          last_archived_count?: number | null
          last_purge_at?: string | null
          last_purged_count?: number | null
          retention_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          attempts: number
          brand_id: string
          contact_id: string | null
          created_at: string
          endpoint: string
          headers: Json
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          method: string
          payload: Json
          run_at: string
          sent_at: string | null
          source_event_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          contact_id?: string | null
          created_at?: string
          endpoint: string
          headers?: Json
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          method?: string
          payload?: Json
          run_at: string
          sent_at?: string | null
          source_event_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          contact_id?: string | null
          created_at?: string
          endpoint?: string
          headers?: Json
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          method?: string
          payload?: Json
          run_at?: string
          sent_at?: string | null
          source_event_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_inbound_events"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          action_details: Json | null
          action_taken: string
          brand_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_entities: Json | null
          duration_ms: number | null
          entity_id: string
          entity_type: string
          error_message: string | null
          event_id: string | null
          finished_at: string | null
          id: string
          rule_id: string | null
          started_at: string | null
          status: string
          steps_log: Json | null
        }
        Insert: {
          action_details?: Json | null
          action_taken: string
          brand_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_entities?: Json | null
          duration_ms?: number | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          event_id?: string | null
          finished_at?: string | null
          id?: string
          rule_id?: string | null
          started_at?: string | null
          status?: string
          steps_log?: Json | null
        }
        Update: {
          action_details?: Json | null
          action_taken?: string
          brand_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_entities?: Json | null
          duration_ms?: number | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          event_id?: string | null
          finished_at?: string | null
          id?: string
          rule_id?: string | null
          started_at?: string | null
          status?: string
          steps_log?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "webhook_inbound_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          actions: Json
          brand_id: string
          conditions: Json
          created_at: string
          created_by: string | null
          cron_expression: string | null
          description: string | null
          execution_count: number
          id: string
          is_active: boolean
          last_executed_at: string | null
          name: string
          priority: number
          requires_confirmation: boolean
          stop_on_failure: boolean
          trigger_config: Json
          trigger_event_type: string | null
          trigger_source: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          actions?: Json
          brand_id: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          cron_expression?: string | null
          description?: string | null
          execution_count?: number
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name: string
          priority?: number
          requires_confirmation?: boolean
          stop_on_failure?: boolean
          trigger_config?: Json
          trigger_event_type?: string | null
          trigger_source?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          actions?: Json
          brand_id?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          cron_expression?: string | null
          description?: string | null
          execution_count?: number
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name?: string
          priority?: number
          requires_confirmation?: boolean
          stop_on_failure?: boolean
          trigger_config?: Json
          trigger_event_type?: string | null
          trigger_source?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          brand_id: string
          checksum: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number
          error: string | null
          expires_at: string | null
          id: string
          schedule_id: string | null
          scope: string
          size_bytes: number
          status: string
          storage_path: string | null
          storage_uploaded_at: string | null
          tables_included: string[]
          total_rows: number
          triggered_by_user_id: string | null
          truncated_tables: string[]
        }
        Insert: {
          brand_id: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          expires_at?: string | null
          id?: string
          schedule_id?: string | null
          scope: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          storage_uploaded_at?: string | null
          tables_included?: string[]
          total_rows?: number
          triggered_by_user_id?: string | null
          truncated_tables?: string[]
        }
        Update: {
          brand_id?: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          expires_at?: string | null
          id?: string
          schedule_id?: string | null
          scope?: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          storage_uploaded_at?: string | null
          tables_included?: string[]
          total_rows?: number
          triggered_by_user_id?: string | null
          truncated_tables?: string[]
        }
        Relationships: []
      }
      backup_schedules: {
        Row: {
          brand_id: string
          created_at: string
          created_by_user_id: string | null
          day_of_week: number | null
          enabled: boolean
          frequency: string
          hour_utc: number
          id: string
          last_run_at: string | null
          last_run_status: string | null
          next_run_at: string | null
          retention_days: number
          scope: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by_user_id?: string | null
          day_of_week?: number | null
          enabled?: boolean
          frequency?: string
          hour_utc?: number
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          next_run_at?: string | null
          retention_days?: number
          scope?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by_user_id?: string | null
          day_of_week?: number | null
          enabled?: boolean
          frequency?: string
          hour_utc?: number
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          next_run_at?: string | null
          retention_days?: number
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_assignment_state: {
        Row: {
          brand_id: string
          last_assigned_user_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assignment_state_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_assignment_state_last_assigned_user_id_fkey"
            columns: ["last_assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_tax_settings: {
        Row: {
          brand_id: string
          corporate_tax_rate: number
          fiscal_year_start: number
          id: string
          notes: string | null
          regional_tax_rate: number
          updated_at: string
          updated_by: string | null
          vat_rate_default: number
        }
        Insert: {
          brand_id: string
          corporate_tax_rate?: number
          fiscal_year_start?: number
          id?: string
          notes?: string | null
          regional_tax_rate?: number
          updated_at?: string
          updated_by?: string | null
          vat_rate_default?: number
        }
        Update: {
          brand_id?: string
          corporate_tax_rate?: number
          fiscal_year_start?: number
          id?: string
          notes?: string | null
          regional_tax_rate?: number
          updated_at?: string
          updated_by?: string | null
          vat_rate_default?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_tax_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_tax_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          alert_thresholds: Json | null
          auto_assign_enabled: boolean
          created_at: string
          funnel_lost_threshold_days: number
          id: string
          is_system: boolean | null
          name: string
          parent_brand_id: string | null
          sales_visibility_callcenter: string
          sla_thresholds_minutes: Json
          slug: string
          updated_at: string
        }
        Insert: {
          alert_thresholds?: Json | null
          auto_assign_enabled?: boolean
          created_at?: string
          funnel_lost_threshold_days?: number
          id?: string
          is_system?: boolean | null
          name: string
          parent_brand_id?: string | null
          sales_visibility_callcenter?: string
          sla_thresholds_minutes?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          alert_thresholds?: Json | null
          auto_assign_enabled?: boolean
          created_at?: string
          funnel_lost_threshold_days?: number
          id?: string
          is_system?: boolean | null
          name?: string
          parent_brand_id?: string | null
          sales_visibility_callcenter?: string
          sla_thresholds_minutes?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_parent_brand_id_fkey"
            columns: ["parent_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          brand_id: string
          category_id: string | null
          created_at: string | null
          created_by: string
          id: string
          notes: string | null
          period_month: string
          planned_amount: number
          updated_at: string | null
        }
        Insert: {
          brand_id: string
          category_id?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          notes?: string | null
          period_month: string
          planned_amount: number
          updated_at?: string | null
        }
        Update: {
          brand_id?: string
          category_id?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          notes?: string | null
          period_month?: string
          planned_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          answered_at: string | null
          brand_id: string
          call_type: string
          contact_id: string
          created_at: string
          deal_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          event_version: number | null
          id: string
          last_error: string | null
          notes: string | null
          outcome: string | null
          phone_number: string
          provider: string | null
          provider_call_id: string | null
          provider_ext_id: string | null
          recording_url: string | null
          response_time_seconds: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          brand_id: string
          call_type?: string
          contact_id: string
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          event_version?: number | null
          id?: string
          last_error?: string | null
          notes?: string | null
          outcome?: string | null
          phone_number: string
          provider?: string | null
          provider_call_id?: string | null
          provider_ext_id?: string | null
          recording_url?: string | null
          response_time_seconds?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          answered_at?: string | null
          brand_id?: string
          call_type?: string
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          event_version?: number | null
          id?: string
          last_error?: string | null
          notes?: string | null
          outcome?: string | null
          phone_number?: string
          provider?: string | null
          provider_call_id?: string | null
          provider_ext_id?: string | null
          recording_url?: string | null
          response_time_seconds?: number | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          ai_status: string
          brand_id: string
          call_log_id: string
          contact_id: string
          created_at: string
          full_text: string | null
          id: string
          latency_ms: number | null
          summary: string | null
          tokens_used: number | null
          updated_at: string
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          ai_status?: string
          brand_id: string
          call_log_id: string
          contact_id: string
          created_at?: string
          full_text?: string | null
          id?: string
          latency_ms?: number | null
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          ai_status?: string
          brand_id?: string
          call_log_id?: string
          contact_id?: string
          created_at?: string
          full_text?: string | null
          id?: string
          latency_ms?: number | null
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcripts_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcripts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_snapshots: {
        Row: {
          brand_id: string | null
          captured_at: string
          id: string
          metadata: Json | null
          metric_name: string
          metric_value: number
          unit: string | null
        }
        Insert: {
          brand_id?: string | null
          captured_at?: string
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_value: number
          unit?: string | null
        }
        Update: {
          brand_id?: string | null
          captured_at?: string
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_value?: number
          unit?: string | null
        }
        Relationships: []
      }
      capacity_thresholds: {
        Row: {
          critical_threshold: number
          growth_rate_warn_pct: number | null
          id: string
          is_active: boolean
          metric_name: string
          unit: string | null
          updated_at: string
          warn_threshold: number
        }
        Insert: {
          critical_threshold: number
          growth_rate_warn_pct?: number | null
          id?: string
          is_active?: boolean
          metric_name: string
          unit?: string | null
          updated_at?: string
          warn_threshold: number
        }
        Update: {
          critical_threshold?: number
          growth_rate_warn_pct?: number | null
          id?: string
          is_active?: boolean
          metric_name?: string
          unit?: string | null
          updated_at?: string
          warn_threshold?: number
        }
        Relationships: []
      }
      chat_message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          ai_context: Json | null
          attachments: Json | null
          brand_id: string
          created_at: string
          deleted_at: string | null
          delivery_status: string
          edited_at: string | null
          id: string
          message_text: string
          sender_type: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id: string | null
          thread_id: string
          tool_trace_id: string | null
        }
        Insert: {
          ai_context?: Json | null
          attachments?: Json | null
          brand_id: string
          created_at?: string
          deleted_at?: string | null
          delivery_status?: string
          edited_at?: string | null
          id?: string
          message_text: string
          sender_type?: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id?: string | null
          thread_id: string
          tool_trace_id?: string | null
        }
        Update: {
          ai_context?: Json | null
          attachments?: Json | null
          brand_id?: string
          created_at?: string
          deleted_at?: string | null
          delivery_status?: string
          edited_at?: string | null
          id?: string
          message_text?: string
          sender_type?: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id?: string | null
          thread_id?: string
          tool_trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread_members: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          thread_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          archived_at: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          title: string | null
          type: Database["public"]["Enums"]["chat_thread_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          title?: string | null
          type: Database["public"]["Enums"]["chat_thread_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          title?: string | null
          type?: Database["public"]["Enums"]["chat_thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_topic_aliases: {
        Row: {
          alias_text: string
          brand_id: string
          created_at: string
          created_by: Database["public"]["Enums"]["topic_created_by"]
          id: string
          topic_id: string
        }
        Insert: {
          alias_text: string
          brand_id: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["topic_created_by"]
          id?: string
          topic_id: string
        }
        Update: {
          alias_text?: string
          brand_id?: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["topic_created_by"]
          id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_topic_aliases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_topic_aliases_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "clinical_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_topics: {
        Row: {
          brand_id: string
          canonical_name: string
          created_at: string
          created_by: Database["public"]["Enums"]["topic_created_by"]
          id: string
          is_active: boolean
          needs_review: boolean
          slug: string
          updated_at: string | null
        }
        Insert: {
          brand_id: string
          canonical_name: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["topic_created_by"]
          id?: string
          is_active?: boolean
          needs_review?: boolean
          slug: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string
          canonical_name?: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["topic_created_by"]
          id?: string
          is_active?: boolean
          needs_review?: boolean
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_topics_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_change_log: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          brand_id: string | null
          change_type: string
          id: string
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          reason: string | null
          target_resource: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          brand_id?: string | null
          change_type: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          reason?: string | null
          target_resource?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          brand_id?: string | null
          change_type?: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          reason?: string | null
          target_resource?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      compliance_evidence: {
        Row: {
          brand_id: string | null
          collected_at: string
          collected_by_user_id: string | null
          evidence_type: string
          hash_sha256: string | null
          id: string
          notes: string | null
          payload: Json
          period: string
        }
        Insert: {
          brand_id?: string | null
          collected_at?: string
          collected_by_user_id?: string | null
          evidence_type: string
          hash_sha256?: string | null
          id?: string
          notes?: string | null
          payload?: Json
          period: string
        }
        Update: {
          brand_id?: string | null
          collected_at?: string
          collected_by_user_id?: string | null
          evidence_type?: string
          hash_sha256?: string | null
          id?: string
          notes?: string | null
          payload?: Json
          period?: string
        }
        Relationships: []
      }
      contact_field_definitions: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          display_order: number
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          is_active: boolean
          is_indexed: boolean
          is_required: boolean
          key: string
          label: string
          options: Json | null
          scope: Database["public"]["Enums"]["custom_field_scope"]
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          display_order?: number
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_active?: boolean
          is_indexed?: boolean
          is_required?: boolean
          key: string
          label: string
          options?: Json | null
          scope?: Database["public"]["Enums"]["custom_field_scope"]
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          display_order?: number
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_active?: boolean
          is_indexed?: boolean
          is_required?: boolean
          key?: string
          label?: string
          options?: Json | null
          scope?: Database["public"]["Enums"]["custom_field_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_definitions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_field_values: {
        Row: {
          brand_id: string
          contact_id: string
          field_definition_id: string
          id: string
          updated_at: string
          updated_by_user_id: string | null
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          brand_id: string
          contact_id: string
          field_definition_id: string
          id?: string
          updated_at?: string
          updated_by_user_id?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          brand_id?: string
          contact_id?: string
          field_definition_id?: string
          id?: string
          updated_at?: string
          updated_by_user_id?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_values_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_values_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "contact_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_phones: {
        Row: {
          assumed_country: boolean
          brand_id: string
          contact_id: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          phone_normalized: string
          phone_raw: string
        }
        Insert: {
          assumed_country?: boolean
          brand_id: string
          contact_id: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          phone_normalized: string
          phone_raw: string
        }
        Update: {
          assumed_country?: boolean
          brand_id?: string
          contact_id?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          phone_normalized?: string
          phone_raw?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_phones_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_search_index: {
        Row: {
          brand_id: string
          contact_id: string
          search_text: string
          search_vector: unknown
          updated_at: string
        }
        Insert: {
          brand_id: string
          contact_id: string
          search_text?: string
          search_vector?: unknown
          updated_at?: string
        }
        Update: {
          brand_id?: string
          contact_id?: string
          search_text?: string
          search_vector?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_search_index_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_search_index_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_table_views: {
        Row: {
          brand_id: string | null
          brand_scope: Database["public"]["Enums"]["table_view_scope"]
          columns: Json
          created_at: string
          filters: Json | null
          id: string
          is_default: boolean
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          brand_scope?: Database["public"]["Enums"]["table_view_scope"]
          columns?: Json
          created_at?: string
          filters?: Json | null
          id?: string
          is_default?: boolean
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          brand_scope?: Database["public"]["Enums"]["table_view_scope"]
          columns?: Json
          created_at?: string
          filters?: Json | null
          id?: string
          is_default?: boolean
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_table_views_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_table_views_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tracking: {
        Row: {
          brand_id: string
          client_ip: string | null
          client_user_agent: string | null
          contact_id: string
          created_at: string | null
          fbc: string | null
          fbp: string | null
          first_touch_at: string | null
          first_touch_source: string | null
          gbraid: string | null
          gclid: string | null
          id: string
          last_touch_at: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wbraid: string | null
        }
        Insert: {
          brand_id: string
          client_ip?: string | null
          client_user_agent?: string | null
          contact_id: string
          created_at?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_at?: string | null
          first_touch_source?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          last_touch_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Update: {
          brand_id?: string
          client_ip?: string | null
          client_user_agent?: string | null
          contact_id?: string
          created_at?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_at?: string | null
          first_touch_source?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          last_touch_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tracking_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tracking_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          brand_id: string
          callback_requested: boolean
          cap: string | null
          city: string | null
          company_address: string | null
          company_city: string | null
          company_name: string | null
          company_province: string | null
          company_zip: string | null
          country: string | null
          created_at: string
          email: string | null
          esito_chiamata: string | null
          fax: string | null
          first_name: string | null
          fiscal_code: string | null
          id: string
          last_interaction_at: string | null
          last_name: string | null
          lead_cost: number | null
          lead_extra: string | null
          lead_heat_class: Database["public"]["Enums"]["heat_class"] | null
          lead_message: string | null
          lead_note: string | null
          lead_reason: string | null
          lead_reason_id: string | null
          lead_score: number | null
          lead_score_updated_at: string | null
          lead_state_id: string | null
          lead_type: string | null
          lead_valid: boolean | null
          lead_validation_ts: string | null
          marketing_consent: boolean | null
          marketing_consent_at: string | null
          note1: string | null
          note10: string | null
          note2: string | null
          note3: string | null
          note4: string | null
          note5: string | null
          note6: string | null
          note7: string | null
          note8: string | null
          note9: string | null
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          province: string | null
          quiz_answers: Json | null
          status: Database["public"]["Enums"]["contact_status"]
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          brand_id: string
          callback_requested?: boolean
          cap?: string | null
          city?: string | null
          company_address?: string | null
          company_city?: string | null
          company_name?: string | null
          company_province?: string | null
          company_zip?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          esito_chiamata?: string | null
          fax?: string | null
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          last_interaction_at?: string | null
          last_name?: string | null
          lead_cost?: number | null
          lead_extra?: string | null
          lead_heat_class?: Database["public"]["Enums"]["heat_class"] | null
          lead_message?: string | null
          lead_note?: string | null
          lead_reason?: string | null
          lead_reason_id?: string | null
          lead_score?: number | null
          lead_score_updated_at?: string | null
          lead_state_id?: string | null
          lead_type?: string | null
          lead_valid?: boolean | null
          lead_validation_ts?: string | null
          marketing_consent?: boolean | null
          marketing_consent_at?: string | null
          note1?: string | null
          note10?: string | null
          note2?: string | null
          note3?: string | null
          note4?: string | null
          note5?: string | null
          note6?: string | null
          note7?: string | null
          note8?: string | null
          note9?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          province?: string | null
          quiz_answers?: Json | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          brand_id?: string
          callback_requested?: boolean
          cap?: string | null
          city?: string | null
          company_address?: string | null
          company_city?: string | null
          company_name?: string | null
          company_province?: string | null
          company_zip?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          esito_chiamata?: string | null
          fax?: string | null
          first_name?: string | null
          fiscal_code?: string | null
          id?: string
          last_interaction_at?: string | null
          last_name?: string | null
          lead_cost?: number | null
          lead_extra?: string | null
          lead_heat_class?: Database["public"]["Enums"]["heat_class"] | null
          lead_message?: string | null
          lead_note?: string | null
          lead_reason?: string | null
          lead_reason_id?: string | null
          lead_score?: number | null
          lead_score_updated_at?: string | null
          lead_state_id?: string | null
          lead_type?: string | null
          lead_valid?: boolean | null
          lead_validation_ts?: string | null
          marketing_consent?: boolean | null
          marketing_consent_at?: string | null
          note1?: string | null
          note10?: string | null
          note2?: string | null
          note3?: string | null
          note4?: string | null
          note5?: string | null
          note6?: string | null
          note7?: string | null
          note8?: string | null
          note9?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          province?: string | null
          quiz_answers?: Json | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          brand_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          brand_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          brand_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_scores: {
        Row: {
          brand_id: string
          calculated_at: string
          deal_id: string
          factors: Json
          id: string
          risk_level: string
          score: number
          score_date: string
        }
        Insert: {
          brand_id: string
          calculated_at?: string
          deal_id: string
          factors?: Json
          id?: string
          risk_level: string
          score: number
          score_date?: string
        }
        Update: {
          brand_id?: string
          calculated_at?: string
          deal_id?: string
          factors?: Json
          id?: string
          risk_level?: string
          score?: number
          score_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_scores_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_scores_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          deal_id: string
          from_stage_id: string | null
          id: string
          notes: string | null
          to_stage_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deal_id: string
          from_stage_id?: string | null
          id?: string
          notes?: string | null
          to_stage_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deal_id?: string
          from_stage_id?: string | null
          id?: string
          notes?: string | null
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_transitions: {
        Row: {
          actor_display_name: string | null
          actor_user_id: string | null
          brand_id: string
          chat_message_id: string | null
          created_at: string
          deal_id: string
          from_stage_id: string | null
          from_stage_label: string | null
          id: string
          idempotency_key: string
          occurred_at: string
          to_stage_id: string
          to_stage_label: string
        }
        Insert: {
          actor_display_name?: string | null
          actor_user_id?: string | null
          brand_id: string
          chat_message_id?: string | null
          created_at?: string
          deal_id: string
          from_stage_id?: string | null
          from_stage_label?: string | null
          id?: string
          idempotency_key: string
          occurred_at?: string
          to_stage_id: string
          to_stage_label: string
        }
        Update: {
          actor_display_name?: string | null
          actor_user_id?: string | null
          brand_id?: string
          chat_message_id?: string | null
          created_at?: string
          deal_id?: string
          from_stage_id?: string | null
          from_stage_label?: string | null
          id?: string
          idempotency_key?: string
          occurred_at?: string
          to_stage_id?: string
          to_stage_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_transitions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_transitions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_transitions_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_transitions_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_user_id: string | null
          brand_id: string
          closed_at: string | null
          contact_id: string
          created_at: string
          current_stage_id: string | null
          deal_risk_level: string | null
          deal_score: number | null
          id: string
          marketing_campaign_id: string | null
          notes: string | null
          score_updated_at: string | null
          stage_locked_by_user: boolean
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_user_id?: string | null
          brand_id: string
          closed_at?: string | null
          contact_id: string
          created_at?: string
          current_stage_id?: string | null
          deal_risk_level?: string | null
          deal_score?: number | null
          id?: string
          marketing_campaign_id?: string | null
          notes?: string | null
          score_updated_at?: string | null
          stage_locked_by_user?: boolean
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_user_id?: string | null
          brand_id?: string
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          current_stage_id?: string | null
          deal_risk_level?: string | null
          deal_score?: number | null
          id?: string
          marketing_campaign_id?: string | null
          notes?: string | null
          score_updated_at?: string | null
          stage_locked_by_user?: boolean
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      dependency_inventory: {
        Row: {
          created_at: string
          current_version: string
          has_vulnerability: boolean
          id: string
          is_dev_dependency: boolean
          is_outdated: boolean
          last_scanned_at: string
          latest_version: string | null
          license: string | null
          package_name: string
          vulnerability_details: Json | null
          vulnerability_severity: string | null
        }
        Insert: {
          created_at?: string
          current_version: string
          has_vulnerability?: boolean
          id?: string
          is_dev_dependency?: boolean
          is_outdated?: boolean
          last_scanned_at?: string
          latest_version?: string | null
          license?: string | null
          package_name: string
          vulnerability_details?: Json | null
          vulnerability_severity?: string | null
        }
        Update: {
          created_at?: string
          current_version?: string
          has_vulnerability?: boolean
          id?: string
          is_dev_dependency?: boolean
          is_outdated?: boolean
          last_scanned_at?: string
          latest_version?: string | null
          license?: string | null
          package_name?: string
          vulnerability_details?: Json | null
          vulnerability_severity?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      executive_reports: {
        Row: {
          brand_id: string
          confidence: number
          content_markdown: string
          content_plain: string | null
          created_at: string
          generated_by: string
          id: string
          metrics_snapshot: Json
          period_end: string
          period_start: string
          report_type: string
          sent_at: string | null
          sent_to: Json | null
        }
        Insert: {
          brand_id: string
          confidence: number
          content_markdown: string
          content_plain?: string | null
          created_at?: string
          generated_by?: string
          id?: string
          metrics_snapshot?: Json
          period_end: string
          period_start: string
          report_type?: string
          sent_at?: string | null
          sent_to?: Json | null
        }
        Update: {
          brand_id?: string
          confidence?: number
          content_markdown?: string
          content_plain?: string | null
          created_at?: string
          generated_by?: string
          id?: string
          metrics_snapshot?: Json
          period_end?: string
          period_start?: string
          report_type?: string
          sent_at?: string | null
          sent_to?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "executive_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          brand_id: string
          category_type: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_deductible: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          brand_id: string
          category_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_deductible?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          brand_id?: string
          category_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_deductible?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          brand_id: string
          category_id: string | null
          cost_center_id: string | null
          created_at: string | null
          created_by: string
          currency: string | null
          description: string | null
          expense_date: string
          gross_amount: number | null
          id: string
          is_deductible: boolean | null
          notes: string | null
          periodicity: string | null
          recurring_until: string | null
          tax_rate: number | null
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          created_by: string
          currency?: string | null
          description?: string | null
          expense_date: string
          gross_amount?: number | null
          id?: string
          is_deductible?: boolean | null
          notes?: string | null
          periodicity?: string | null
          recurring_until?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          created_by?: string
          currency?: string | null
          description?: string | null
          expense_date?: string
          gross_amount?: number | null
          id?: string
          is_deductible?: boolean | null
          notes?: string | null
          periodicity?: string | null
          recurring_until?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          brand_id: string
          frozen_message: string | null
          frozen_redirect: string | null
          id: string
          module_key: string
          module_label: string
          status: Database["public"]["Enums"]["module_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          frozen_message?: string | null
          frozen_redirect?: string | null
          id?: string
          module_key: string
          module_label: string
          status?: Database["public"]["Enums"]["module_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          frozen_message?: string | null
          frozen_redirect?: string | null
          id?: string
          module_key?: string
          module_label?: string
          status?: Database["public"]["Enums"]["module_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          brand_id: string
          confidence_level: number
          created_at: string
          factors: Json
          forecast_type: string
          id: string
          model_version: string
          period_end: string
          period_start: string
          predicted_max: number | null
          predicted_min: number | null
          predicted_value: number
        }
        Insert: {
          brand_id: string
          confidence_level: number
          created_at?: string
          factors?: Json
          forecast_type: string
          id?: string
          model_version?: string
          period_end: string
          period_start: string
          predicted_max?: number | null
          predicted_min?: number | null
          predicted_value: number
        }
        Update: {
          brand_id?: string
          confidence_level?: number
          created_at?: string
          factors?: Json
          forecast_type?: string
          id?: string
          model_version?: string
          period_end?: string
          period_start?: string
          predicted_max?: number | null
          predicted_min?: number | null
          predicted_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      ga4_stats: {
        Row: {
          avg_session_duration: number
          bounce_rate: number
          brand_id: string
          conversion_events: Json | null
          conversions: number
          id: string
          imported_at: string
          new_users: number
          pageviews: number
          sessions: number
          stat_date: string
          top_campaigns: Json | null
          top_pages: Json | null
          top_sources: Json | null
          users: number
        }
        Insert: {
          avg_session_duration?: number
          bounce_rate?: number
          brand_id: string
          conversion_events?: Json | null
          conversions?: number
          id?: string
          imported_at?: string
          new_users?: number
          pageviews?: number
          sessions?: number
          stat_date: string
          top_campaigns?: Json | null
          top_pages?: Json | null
          top_sources?: Json | null
          users?: number
        }
        Update: {
          avg_session_duration?: number
          bounce_rate?: number
          brand_id?: string
          conversion_events?: Json | null
          conversions?: number
          id?: string
          imported_at?: string
          new_users?: number
          pageviews?: number
          sessions?: number
          stat_date?: string
          top_campaigns?: Json | null
          top_pages?: Json | null
          top_sources?: Json | null
          users?: number
        }
        Relationships: [
          {
            foreignKeyName: "ga4_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      household_people: {
        Row: {
          brand_id: string
          contact_id: string
          created_at: string
          first_name: string | null
          has_device: boolean | null
          id: string
          is_primary: boolean
          last_name: string | null
          pacemaker_status: string | null
          phone_normalized: string | null
          phone_raw: string | null
          role: Database["public"]["Enums"]["household_person_role"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          contact_id: string
          created_at?: string
          first_name?: string | null
          has_device?: boolean | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          pacemaker_status?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          role?: Database["public"]["Enums"]["household_person_role"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          contact_id?: string
          created_at?: string
          first_name?: string | null
          has_device?: boolean | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          pacemaker_status?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          role?: Database["public"]["Enums"]["household_person_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_people_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_people_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_drills: {
        Row: {
          action_items: Json | null
          brand_id: string
          completed_at: string | null
          created_at: string
          debrief_notes: string | null
          drill_type: string
          escalation_correct: boolean | null
          facilitator_user_id: string | null
          id: string
          quarter: string
          runbook_compliance_pct: number | null
          scenario_id: string
          scenario_name: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          ttd_minutes: number | null
          ttm_minutes: number | null
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          brand_id: string
          completed_at?: string | null
          created_at?: string
          debrief_notes?: string | null
          drill_type?: string
          escalation_correct?: boolean | null
          facilitator_user_id?: string | null
          id?: string
          quarter: string
          runbook_compliance_pct?: number | null
          scenario_id: string
          scenario_name: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          ttd_minutes?: number | null
          ttm_minutes?: number | null
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          debrief_notes?: string | null
          drill_type?: string
          escalation_correct?: boolean | null
          facilitator_user_id?: string | null
          id?: string
          quarter?: string
          runbook_compliance_pct?: number | null
          scenario_id?: string
          scenario_name?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          ttd_minutes?: number | null
          ttm_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_drills_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_drills_facilitator_user_id_fkey"
            columns: ["facilitator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_calls: {
        Row: {
          brand_id: string
          call_log_id: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          dismissed_at: string | null
          id: string
          phone_number: string
          provider_call_id: string | null
          status: string
          user_id: string | null
          voispeed_ext: string | null
        }
        Insert: {
          brand_id: string
          call_log_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          dismissed_at?: string | null
          id?: string
          phone_number: string
          provider_call_id?: string | null
          status?: string
          user_id?: string | null
          voispeed_ext?: string | null
        }
        Update: {
          brand_id?: string
          call_log_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          dismissed_at?: string | null
          id?: string
          phone_number?: string
          provider_call_id?: string | null
          status?: string
          user_id?: string | null
          voispeed_ext?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_calls_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_calls_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_calls_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_requests: {
        Row: {
          brand_id: string | null
          correlation_id: string | null
          created_at: string
          dlq_reason: Database["public"]["Enums"]["dlq_reason"] | null
          error_message: string | null
          headers: Json | null
          id: string
          ip_address: string | null
          lead_event_id: string | null
          processed: boolean
          raw_body: Json | null
          raw_body_text: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["ingest_status"] | null
          user_agent: string | null
        }
        Insert: {
          brand_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dlq_reason?: Database["public"]["Enums"]["dlq_reason"] | null
          error_message?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          lead_event_id?: string | null
          processed?: boolean
          raw_body?: Json | null
          raw_body_text?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["ingest_status"] | null
          user_agent?: string | null
        }
        Update: {
          brand_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dlq_reason?: Database["public"]["Enums"]["dlq_reason"] | null
          error_message?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          lead_event_id?: string | null
          processed?: boolean
          raw_body?: Json | null
          raw_body_text?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["ingest_status"] | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_requests_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_requests_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_requests_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      keplero_interactions: {
        Row: {
          appointment_id: string | null
          beneficiary_person_id: string | null
          brand_id: string
          contact_id: string
          created_at: string
          deal_id: string | null
          disponibilita_orarie: string | null
          esito_chiamata: string | null
          fingerprint: string | null
          fissato_keplero: boolean
          id: string
          motivo_contatto: string | null
          motivo_rifiuto: string | null
          raw_payload: Json
          requester_person_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          beneficiary_person_id?: string | null
          brand_id: string
          contact_id: string
          created_at?: string
          deal_id?: string | null
          disponibilita_orarie?: string | null
          esito_chiamata?: string | null
          fingerprint?: string | null
          fissato_keplero?: boolean
          id?: string
          motivo_contatto?: string | null
          motivo_rifiuto?: string | null
          raw_payload?: Json
          requester_person_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          beneficiary_person_id?: string | null
          brand_id?: string
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          disponibilita_orarie?: string | null
          esito_chiamata?: string | null
          fingerprint?: string | null
          fissato_keplero?: boolean
          id?: string
          motivo_contatto?: string | null
          motivo_rifiuto?: string | null
          raw_payload?: Json
          requester_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keplero_interactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keplero_interactions_beneficiary_person_id_fkey"
            columns: ["beneficiary_person_id"]
            isOneToOne: false
            referencedRelation: "household_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keplero_interactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keplero_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keplero_interactions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keplero_interactions_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "household_people"
            referencedColumns: ["id"]
          },
        ]
      }
      keplero_lookup_secrets: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          rotated_at: string | null
          secret_hash: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rotated_at?: string | null
          secret_hash: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rotated_at?: string | null
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "keplero_lookup_secrets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      keplero_lookup_settings: {
        Row: {
          brand_id: string | null
          created_at: string
          extra_fields: Json | null
          id: string
          is_enabled: boolean
          response_profile: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          extra_fields?: Json | null
          id?: string
          is_enabled?: boolean
          response_profile?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          extra_fields?: Json | null
          id?: string
          is_enabled?: boolean
          response_profile?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keplero_lookup_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaign_attribution: {
        Row: {
          brand_id: string
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          group_id: string | null
          id: string
          lead_event_id: string
          match_type: string
          matched_at: string
          metadata: Json | null
        }
        Insert: {
          brand_id: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          lead_event_id: string
          match_type: string
          matched_at?: string
          metadata?: Json | null
        }
        Update: {
          brand_id?: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          lead_event_id?: string
          match_type?: string
          matched_at?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaign_attribution_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaign_attribution_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaign_attribution_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaign_attribution_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaign_attribution_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_digest_config: {
        Row: {
          cc_recipients: string[] | null
          id: string
          include_filtered_link: boolean
          is_enabled: boolean
          schedule_times: string[]
          timezone: string
          to_recipients: string[]
          updated_at: string
          updated_by: string | null
          webhook_url_override: string | null
        }
        Insert: {
          cc_recipients?: string[] | null
          id?: string
          include_filtered_link?: boolean
          is_enabled?: boolean
          schedule_times?: string[]
          timezone?: string
          to_recipients?: string[]
          updated_at?: string
          updated_by?: string | null
          webhook_url_override?: string | null
        }
        Update: {
          cc_recipients?: string[] | null
          id?: string
          include_filtered_link?: boolean
          is_enabled?: boolean
          schedule_times?: string[]
          timezone?: string
          to_recipients?: string[]
          updated_at?: string
          updated_by?: string | null
          webhook_url_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_digest_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_digest_runs: {
        Row: {
          attempt_no: number
          cc_recipients: string[] | null
          created_at: string
          created_by: string | null
          dedupe_stats: Json | null
          error_message: string | null
          filtered_link: string | null
          id: string
          include_filtered_link: boolean
          lead_count_raw: number
          lead_count_unique: number
          payload: Json | null
          response_body: string | null
          response_status: number | null
          retry_of_run_id: string | null
          scheduled_for_retry_at: string | null
          sent_at: string | null
          status: string
          to_recipients: string[]
          trigger_type: string
          window_end: string
          window_start: string
        }
        Insert: {
          attempt_no?: number
          cc_recipients?: string[] | null
          created_at?: string
          created_by?: string | null
          dedupe_stats?: Json | null
          error_message?: string | null
          filtered_link?: string | null
          id?: string
          include_filtered_link?: boolean
          lead_count_raw?: number
          lead_count_unique?: number
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          retry_of_run_id?: string | null
          scheduled_for_retry_at?: string | null
          sent_at?: string | null
          status?: string
          to_recipients?: string[]
          trigger_type: string
          window_end: string
          window_start: string
        }
        Update: {
          attempt_no?: number
          cc_recipients?: string[] | null
          created_at?: string
          created_by?: string | null
          dedupe_stats?: Json | null
          error_message?: string | null
          filtered_link?: string | null
          id?: string
          include_filtered_link?: boolean
          lead_count_raw?: number
          lead_count_unique?: number
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          retry_of_run_id?: string | null
          scheduled_for_retry_at?: string | null
          sent_at?: string | null
          status?: string
          to_recipients?: string[]
          trigger_type?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_digest_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_digest_runs_retry_of_run_id_fkey"
            columns: ["retry_of_run_id"]
            isOneToOne: false
            referencedRelation: "lead_digest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_event_clinical_topics: {
        Row: {
          created_at: string
          lead_event_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          lead_event_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          lead_event_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_event_clinical_topics_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_event_clinical_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "clinical_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          ai_confidence: number | null
          ai_conversation_summary: string | null
          ai_model_version: string | null
          ai_priority: number | null
          ai_processed: boolean
          ai_processed_at: string | null
          ai_prompt_version: string | null
          ai_rationale: string | null
          archived: boolean
          booking_notes: string | null
          brand_id: string
          contact_channel: Database["public"]["Enums"]["contact_channel"] | null
          contact_id: string | null
          created_at: string
          customer_sentiment:
            | Database["public"]["Enums"]["customer_sentiment"]
            | null
          deal_id: string | null
          decision_status: Database["public"]["Enums"]["decision_status"] | null
          external_id: string | null
          id: string
          lead_source_channel:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          lead_type: Database["public"]["Enums"]["lead_type"] | null
          logistics_notes: string | null
          marketing_campaign_id: string | null
          objection_type: Database["public"]["Enums"]["objection_type"] | null
          occurred_at: string
          pacemaker_status:
            | Database["public"]["Enums"]["pacemaker_status"]
            | null
          raw_payload: Json
          received_at: string
          should_create_ticket: boolean | null
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_conversation_summary?: string | null
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_processed?: boolean
          ai_processed_at?: string | null
          ai_prompt_version?: string | null
          ai_rationale?: string | null
          archived?: boolean
          booking_notes?: string | null
          brand_id: string
          contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          contact_id?: string | null
          created_at?: string
          customer_sentiment?:
            | Database["public"]["Enums"]["customer_sentiment"]
            | null
          deal_id?: string | null
          decision_status?:
            | Database["public"]["Enums"]["decision_status"]
            | null
          external_id?: string | null
          id?: string
          lead_source_channel?:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          logistics_notes?: string | null
          marketing_campaign_id?: string | null
          objection_type?: Database["public"]["Enums"]["objection_type"] | null
          occurred_at?: string
          pacemaker_status?:
            | Database["public"]["Enums"]["pacemaker_status"]
            | null
          raw_payload?: Json
          received_at?: string
          should_create_ticket?: boolean | null
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_conversation_summary?: string | null
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_processed?: boolean
          ai_processed_at?: string | null
          ai_prompt_version?: string | null
          ai_rationale?: string | null
          archived?: boolean
          booking_notes?: string | null
          brand_id?: string
          contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          contact_id?: string | null
          created_at?: string
          customer_sentiment?:
            | Database["public"]["Enums"]["customer_sentiment"]
            | null
          deal_id?: string | null
          decision_status?:
            | Database["public"]["Enums"]["decision_status"]
            | null
          external_id?: string | null
          id?: string
          lead_source_channel?:
            | Database["public"]["Enums"]["lead_source_channel"]
            | null
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          logistics_notes?: string | null
          marketing_campaign_id?: string | null
          objection_type?: Database["public"]["Enums"]["objection_type"] | null
          occurred_at?: string
          pacemaker_status?:
            | Database["public"]["Enums"]["pacemaker_status"]
            | null
          raw_payload?: Json
          received_at?: string
          should_create_ticket?: boolean | null
          source?: Database["public"]["Enums"]["lead_source_type"]
          source_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_marketing_campaign_id_fkey"
            columns: ["marketing_campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_history: {
        Row: {
          brand_id: string
          computed_at: string
          contact_id: string
          heat_class: Database["public"]["Enums"]["heat_class"]
          id: string
          negative_drivers: string[]
          positive_drivers: string[]
          score: number
          trigger_event: string | null
        }
        Insert: {
          brand_id: string
          computed_at?: string
          contact_id: string
          heat_class: Database["public"]["Enums"]["heat_class"]
          id?: string
          negative_drivers?: string[]
          positive_drivers?: string[]
          score: number
          trigger_event?: string | null
        }
        Update: {
          brand_id?: string
          computed_at?: string
          contact_id?: string
          heat_class?: Database["public"]["Enums"]["heat_class"]
          id?: string
          negative_drivers?: string[]
          positive_drivers?: string[]
          score?: number
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          brand_id: string
          computed_at: string
          contact_id: string
          created_at: string
          heat_class: Database["public"]["Enums"]["heat_class"]
          id: string
          negative_drivers: string[]
          next_best_action: string | null
          positive_drivers: string[]
          score: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          computed_at?: string
          contact_id: string
          created_at?: string
          heat_class?: Database["public"]["Enums"]["heat_class"]
          id?: string
          negative_drivers?: string[]
          next_best_action?: string | null
          positive_drivers?: string[]
          score?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          computed_at?: string
          contact_id?: string
          created_at?: string
          heat_class?: Database["public"]["Enums"]["heat_class"]
          id?: string
          negative_drivers?: string[]
          next_best_action?: string | null
          positive_drivers?: string[]
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_groups: {
        Row: {
          brand_id: string
          campaign_ids: string[]
          created_at: string
          id: string
          is_active: boolean
          match_rules: Json
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          campaign_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          match_rules?: Json
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          campaign_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          match_rules?: Json
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_groups_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          allow_name_fallback: boolean
          brand_id: string
          channel_id: string | null
          created_at: string
          created_by: string
          end_date: string | null
          external_id: string | null
          id: string
          name: string
          planned_budget: number | null
          start_date: string
          status: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at: string
        }
        Insert: {
          allow_name_fallback?: boolean
          brand_id: string
          channel_id?: string | null
          created_at?: string
          created_by: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          name: string
          planned_budget?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at?: string
        }
        Update: {
          allow_name_fallback?: boolean
          brand_id?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          name?: string
          planned_budget?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "marketing_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_channels: {
        Row: {
          brand_id: string
          channel_subtype: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          platform: Database["public"]["Enums"]["ad_platform_type"] | null
          type: string
        }
        Insert: {
          brand_id: string
          channel_subtype?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          platform?: Database["public"]["Enums"]["ad_platform_type"] | null
          type: string
        }
        Update: {
          brand_id?: string
          channel_subtype?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          platform?: Database["public"]["Enums"]["ad_platform_type"] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_channels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_costs: {
        Row: {
          amount: number
          brand_id: string
          campaign_id: string | null
          cost_date: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          source: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          campaign_id?: string | null
          cost_date: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          source?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          campaign_id?: string | null
          cost_date?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_costs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_access_tokens: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          last_used_at: string | null
          name: string
          rate_limit_per_min: number
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          last_used_at?: string | null
          name: string
          rate_limit_per_min?: number
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_min?: number
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_access_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_access_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_approvals: {
        Row: {
          approver_user_id: string | null
          created_at: string
          decided_at: string | null
          decision: Database["public"]["Enums"]["mcp_approval_decision"] | null
          execution_id: string
          expires_at: string | null
          id: string
          reason: string | null
          required_by_policy: string | null
        }
        Insert: {
          approver_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["mcp_approval_decision"] | null
          execution_id: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          required_by_policy?: string | null
        }
        Update: {
          approver_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["mcp_approval_decision"] | null
          execution_id?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          required_by_policy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_approvals_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_approvals_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "mcp_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_approvals_required_by_policy_fkey"
            columns: ["required_by_policy"]
            isOneToOne: false
            referencedRelation: "mcp_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_executions: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["mcp_actor_type"]
          brand_id: string | null
          completed_at: string | null
          created_at: string
          decision: Database["public"]["Enums"]["mcp_policy_action"] | null
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          input_redacted: Json | null
          latency_ms: number | null
          metadata: Json
          output_redacted: Json | null
          policy_id: string | null
          request_id: string
          resource_uri: string | null
          server_id: string | null
          status: Database["public"]["Enums"]["mcp_execution_status"]
          tool_name: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["mcp_actor_type"]
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["mcp_policy_action"] | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_redacted?: Json | null
          latency_ms?: number | null
          metadata?: Json
          output_redacted?: Json | null
          policy_id?: string | null
          request_id: string
          resource_uri?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["mcp_execution_status"]
          tool_name?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["mcp_actor_type"]
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["mcp_policy_action"] | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_redacted?: Json | null
          latency_ms?: number | null
          metadata?: Json
          output_redacted?: Json | null
          policy_id?: string | null
          request_id?: string
          resource_uri?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["mcp_execution_status"]
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_executions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "mcp_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_executions_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_policies: {
        Row: {
          action: Database["public"]["Enums"]["mcp_policy_action"]
          brand_scope: string | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          priority: number
          role: string
          tool_pattern: string
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["mcp_policy_action"]
          brand_scope?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          priority?: number
          role: string
          tool_pattern?: string
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["mcp_policy_action"]
          brand_scope?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          priority?: number
          role?: string
          tool_pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_request_log: {
        Row: {
          brand_id: string | null
          client_ip: string | null
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          method: string
          request_id: string
          request_size: number | null
          response_size: number | null
          status_code: number
          token_id: string | null
          tool_name: string | null
          trace_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          client_ip?: string | null
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          method: string
          request_id: string
          request_size?: number | null
          response_size?: number | null
          status_code: number
          token_id?: string | null
          tool_name?: string | null
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          client_ip?: string | null
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          method?: string
          request_id?: string
          request_size?: number | null
          response_size?: number | null
          status_code?: number
          token_id?: string | null
          tool_name?: string | null
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_request_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_resource_changes: {
        Row: {
          brand_id: string | null
          change_type: string
          id: number
          occurred_at: string
          resource_id: string | null
          resource_type: string
          uri: string
        }
        Insert: {
          brand_id?: string | null
          change_type: string
          id?: number
          occurred_at?: string
          resource_id?: string | null
          resource_type: string
          uri: string
        }
        Update: {
          brand_id?: string | null
          change_type?: string
          id?: number
          occurred_at?: string
          resource_id?: string | null
          resource_type?: string
          uri?: string
        }
        Relationships: []
      }
      mcp_resources: {
        Row: {
          created_at: string
          data_classification: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          required_scope: string
          schema_json: Json
          server_id: string
          updated_at: string
          uri_template: string
        }
        Insert: {
          created_at?: string
          data_classification?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          required_scope?: string
          schema_json?: Json
          server_id: string
          updated_at?: string
          uri_template: string
        }
        Update: {
          created_at?: string
          data_classification?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          required_scope?: string
          schema_json?: Json
          server_id?: string
          updated_at?: string
          uri_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_resources_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_secrets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          key_name: string
          provider: string
          rotated_at: string | null
          secret_ref: string
          server_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key_name: string
          provider: string
          rotated_at?: string | null
          secret_ref: string
          server_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key_name?: string
          provider?: string
          rotated_at?: string | null
          secret_ref?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_secrets_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          canary_brand_ids: string[] | null
          canary_role_whitelist: string[] | null
          capabilities_json: Json
          created_at: string
          description: string | null
          endpoint: string | null
          id: string
          kill_switch: boolean
          name: string
          owner_user_id: string | null
          status: Database["public"]["Enums"]["mcp_server_status"]
          transport: Database["public"]["Enums"]["mcp_transport"]
          updated_at: string
          version: string
        }
        Insert: {
          canary_brand_ids?: string[] | null
          canary_role_whitelist?: string[] | null
          capabilities_json?: Json
          created_at?: string
          description?: string | null
          endpoint?: string | null
          id?: string
          kill_switch?: boolean
          name: string
          owner_user_id?: string | null
          status?: Database["public"]["Enums"]["mcp_server_status"]
          transport?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          version?: string
        }
        Update: {
          canary_brand_ids?: string[] | null
          canary_role_whitelist?: string[] | null
          capabilities_json?: Json
          created_at?: string
          description?: string | null
          endpoint?: string | null
          id?: string
          kill_switch?: boolean
          name?: string
          owner_user_id?: string | null
          status?: Database["public"]["Enums"]["mcp_server_status"]
          transport?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_slo_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          details: Json
          id: string
          metric_value: number | null
          severity: string
          threshold: number | null
          window_end: string
          window_start: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          details?: Json
          id?: string
          metric_value?: number | null
          severity?: string
          threshold?: number | null
          window_end: string
          window_start: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          details?: Json
          id?: string
          metric_value?: number | null
          severity?: string
          threshold?: number | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      mcp_subscriptions: {
        Row: {
          created_at: string
          id: string
          last_notified_at: string | null
          resource_type: string | null
          token_id: string
          uri: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_notified_at?: string | null
          resource_type?: string | null
          token_id: string
          uri: string
        }
        Update: {
          created_at?: string
          id?: string
          last_notified_at?: string | null
          resource_type?: string | null
          token_id?: string
          uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_subscriptions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tools: {
        Row: {
          category: Database["public"]["Enums"]["mcp_tool_category"]
          created_at: string
          data_classification: string
          description: string | null
          enabled: boolean
          id: string
          input_schema_json: Json
          max_timeout_ms: number
          name: string
          output_schema_json: Json
          rate_limit_per_min: number | null
          required_scope: string
          requires_approval: boolean
          server_id: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["mcp_tool_category"]
          created_at?: string
          data_classification?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema_json?: Json
          max_timeout_ms?: number
          name: string
          output_schema_json?: Json
          rate_limit_per_min?: number | null
          required_scope?: string
          requires_approval?: boolean
          server_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["mcp_tool_category"]
          created_at?: string
          data_classification?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema_json?: Json
          max_timeout_ms?: number
          name?: string
          output_schema_json?: Json
          rate_limit_per_min?: number | null
          required_scope?: string
          requires_approval?: boolean
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tools_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_apps: {
        Row: {
          access_token: string
          ad_account_id: string | null
          app_secret: string
          brand_id: string
          brand_slug: string
          capi_enabled: boolean | null
          capi_test_event_code: string | null
          capi_token_key: string | null
          created_at: string
          id: string
          is_active: boolean
          page_id: string | null
          pixel_id: string | null
          stats_enabled: boolean
          updated_at: string
          verify_token: string
        }
        Insert: {
          access_token: string
          ad_account_id?: string | null
          app_secret: string
          brand_id: string
          brand_slug: string
          capi_enabled?: boolean | null
          capi_test_event_code?: string | null
          capi_token_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          page_id?: string | null
          pixel_id?: string | null
          stats_enabled?: boolean
          updated_at?: string
          verify_token: string
        }
        Update: {
          access_token?: string
          ad_account_id?: string | null
          app_secret?: string
          brand_id?: string
          brand_slug?: string
          capi_enabled?: boolean | null
          capi_test_event_code?: string | null
          capi_token_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          page_id?: string | null
          pixel_id?: string | null
          stats_enabled?: boolean
          updated_at?: string
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_apps_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_event_queue: {
        Row: {
          action_source: string
          attempts: number
          brand_id: string
          consent_snapshot: boolean
          contact_id: string | null
          created_at: string | null
          custom_data: Json | null
          deal_id: string | null
          event_id: string
          event_name: string
          event_time: string
          id: string
          last_error: string | null
          lead_event_id: string | null
          max_attempts: number
          meta_app_id: string
          processing_at: string | null
          processing_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["meta_capi_status"]
          user_data: Json | null
        }
        Insert: {
          action_source?: string
          attempts?: number
          brand_id: string
          consent_snapshot?: boolean
          contact_id?: string | null
          created_at?: string | null
          custom_data?: Json | null
          deal_id?: string | null
          event_id: string
          event_name: string
          event_time: string
          id?: string
          last_error?: string | null
          lead_event_id?: string | null
          max_attempts?: number
          meta_app_id: string
          processing_at?: string | null
          processing_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["meta_capi_status"]
          user_data?: Json | null
        }
        Update: {
          action_source?: string
          attempts?: number
          brand_id?: string
          consent_snapshot?: boolean
          contact_id?: string | null
          created_at?: string | null
          custom_data?: Json | null
          deal_id?: string | null
          event_id?: string
          event_name?: string
          event_time?: string
          id?: string
          last_error?: string | null
          lead_event_id?: string | null
          max_attempts?: number
          meta_app_id?: string
          processing_at?: string | null
          processing_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["meta_capi_status"]
          user_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_event_queue_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_capi_event_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_capi_event_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_capi_event_queue_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_capi_event_queue_meta_app_id_fkey"
            columns: ["meta_app_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_events: {
        Row: {
          ad_id: string | null
          brand_id: string
          campaign_id: string | null
          contact_id: string | null
          error: string | null
          fetched_payload: Json | null
          form_id: string | null
          id: string
          lead_event_id: string | null
          leadgen_id: string
          page_id: string
          processed_at: string | null
          raw_event: Json
          received_at: string
          source_id: string
          status: Database["public"]["Enums"]["meta_lead_status"]
        }
        Insert: {
          ad_id?: string | null
          brand_id: string
          campaign_id?: string | null
          contact_id?: string | null
          error?: string | null
          fetched_payload?: Json | null
          form_id?: string | null
          id?: string
          lead_event_id?: string | null
          leadgen_id: string
          page_id: string
          processed_at?: string | null
          raw_event: Json
          received_at?: string
          source_id: string
          status?: Database["public"]["Enums"]["meta_lead_status"]
        }
        Update: {
          ad_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          contact_id?: string | null
          error?: string | null
          fetched_payload?: Json | null
          form_id?: string | null
          id?: string
          lead_event_id?: string | null
          leadgen_id?: string
          page_id?: string
          processed_at?: string | null
          raw_event?: Json
          received_at?: string
          source_id?: string
          status?: Database["public"]["Enums"]["meta_lead_status"]
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_events_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "meta_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_sources: {
        Row: {
          access_token: string
          brand_id: string
          created_at: string
          form_id: string | null
          id: string
          is_active: boolean
          page_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          brand_id: string
          created_at?: string
          form_id?: string | null
          id?: string
          is_active?: boolean
          page_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          brand_id?: string
          created_at?: string
          form_id?: string | null
          id?: string
          is_active?: boolean
          page_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_sources_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      module_usage_events: {
        Row: {
          brand_id: string
          created_at: string
          event_type: string
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          event_type?: string
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          event_type?: string
          id?: string
          module_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_usage_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          brand_id: string
          created_at: string
          enabled: boolean
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_webhook_destinations: {
        Row: {
          brand_id: string
          consecutive_failures: number
          created_at: string
          created_by: string | null
          endpoint_url: string
          hmac_secret: string
          id: string
          include_payload: boolean
          is_active: boolean
          last_error: string | null
          last_success_at: string | null
          name: string
          notification_types: Database["public"]["Enums"]["notification_type"][]
          preset: string
          retry_max: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          endpoint_url: string
          hmac_secret: string
          id?: string
          include_payload?: boolean
          is_active?: boolean
          last_error?: string | null
          last_success_at?: string | null
          name: string
          notification_types?: Database["public"]["Enums"]["notification_type"][]
          preset?: string
          retry_max?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          endpoint_url?: string
          hmac_secret?: string
          id?: string
          include_payload?: boolean
          is_active?: boolean
          last_error?: string | null
          last_success_at?: string | null
          name?: string
          notification_types?: Database["public"]["Enums"]["notification_type"][]
          preset?: string
          retry_max?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_webhook_destinations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_webhook_outbox: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          delivered_at: string | null
          destination_id: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_retry_at: string
          notification_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          payload: Json
          status: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          delivered_at?: string | null
          destination_id: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string
          notification_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          payload: Json
          status?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          delivered_at?: string | null
          destination_id?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string
          notification_id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_webhook_outbox_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "notification_webhook_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          brand_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          brand_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          brand_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_tokens: {
        Row: {
          access_token_encrypted: string
          account_id: string
          brand_id: string
          created_at: string | null
          expires_at: string
          id: string
          provider: string
          refresh_token_encrypted: string
          scopes: string[] | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted: string
          account_id: string
          brand_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          provider: string
          refresh_token_encrypted: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string
          account_id?: string
          brand_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          provider?: string
          refresh_token_encrypted?: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhook_deliveries: {
        Row: {
          attempt_count: number
          brand_id: string
          created_at: string
          dead_at: string | null
          duration_ms: number | null
          event_id: string
          event_type: Database["public"]["Enums"]["webhook_event_type"]
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          response_body: string | null
          response_status: number | null
          status: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          brand_id: string
          created_at?: string
          dead_at?: string | null
          duration_ms?: number | null
          event_id: string
          event_type: Database["public"]["Enums"]["webhook_event_type"]
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          brand_id?: string
          created_at?: string
          dead_at?: string | null
          duration_ms?: number | null
          event_id?: string
          event_type?: Database["public"]["Enums"]["webhook_event_type"]
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhook_deliveries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          brand_id: string
          created_at: string
          custom_url_params: Json | null
          event_types: Database["public"]["Enums"]["webhook_event_type"][]
          id: string
          is_active: boolean
          name: string
          payload_format: string
          payload_mapping: Json | null
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          custom_url_params?: Json | null
          event_types?: Database["public"]["Enums"]["webhook_event_type"][]
          id?: string
          is_active?: boolean
          name: string
          payload_format?: string
          payload_mapping?: Json | null
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          custom_url_params?: Json | null
          event_types?: Database["public"]["Enums"]["webhook_event_type"][]
          id?: string
          is_active?: boolean
          name?: string
          payload_format?: string
          payload_mapping?: Json | null
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          order_id: string
          paid_at: string | null
          plan_details: Json | null
          recorded_by_user_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id: string
          paid_at?: string | null
          plan_details?: Json | null
          recorded_by_user_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          plan_details?: Json | null
          recorded_by_user_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          brand_id: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          brand_id: string
          created_at: string
          default_price: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          sku: string | null
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sku?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sku?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_error: string | null
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          id: string
          last_refill_at: string
          max_tokens: number
          refill_rate: number
          source_id: string
          tokens: number
        }
        Insert: {
          id?: string
          last_refill_at?: string
          max_tokens: number
          refill_rate: number
          source_id: string
          tokens: number
        }
        Update: {
          id?: string
          last_refill_at?: string
          max_tokens?: number
          refill_rate?: number
          source_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "webhook_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_limit_buckets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "webhook_sources_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_runs: {
        Row: {
          brand_id: string
          completed_at: string | null
          conflict_strategy: string
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          mode: string
          source_brand_id: string | null
          source_checksum: string | null
          source_filename: string | null
          source_run_id: string | null
          source_scope: string | null
          status: string
          tables_selected: string[]
          tables_summary: Json
          total_rows_in_archive: number
          total_rows_inserted: number
          total_rows_skipped: number
          triggered_by_user_id: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          conflict_strategy?: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          mode?: string
          source_brand_id?: string | null
          source_checksum?: string | null
          source_filename?: string | null
          source_run_id?: string | null
          source_scope?: string | null
          status?: string
          tables_selected?: string[]
          tables_summary?: Json
          total_rows_in_archive?: number
          total_rows_inserted?: number
          total_rows_skipped?: number
          triggered_by_user_id?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          conflict_strategy?: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          mode?: string
          source_brand_id?: string | null
          source_checksum?: string | null
          source_filename?: string | null
          source_run_id?: string | null
          source_scope?: string | null
          status?: string
          tables_selected?: string[]
          tables_summary?: Json
          total_rows_in_archive?: number
          total_rows_inserted?: number
          total_rows_skipped?: number
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restore_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_runs_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_hidden_columns: {
        Row: {
          brand_id: string
          column_key: string
          created_at: string
          id: string
          is_hidden: boolean
          role: string
          table_name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          column_key: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          role: string
          table_name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          column_key?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          role?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_hidden_columns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      role_page_permissions: {
        Row: {
          brand_id: string
          can_access: boolean
          created_at: string
          id: string
          page: Database["public"]["Enums"]["app_page"]
          role: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          can_access?: boolean
          created_at?: string
          id?: string
          page: Database["public"]["Enums"]["app_page"]
          role: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          can_access?: boolean
          created_at?: string
          id?: string
          page?: Database["public"]["Enums"]["app_page"]
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_page_permissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_availability: {
        Row: {
          brand_id: string
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          notes: string | null
          start_time: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_to: string | null
          weekday: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_time: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_to?: string | null
          weekday: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_time?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_to?: string | null
          weekday?: number
        }
        Relationships: []
      }
      sales_commissions: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          brand_id: string
          commission_amount: number
          commission_fixed: number | null
          commission_percent: number | null
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["commission_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          brand_id: string
          commission_amount: number
          commission_fixed?: number | null
          commission_percent?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          brand_id?: string
          commission_amount?: number
          commission_fixed?: number | null
          commission_percent?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_commissions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_history: {
        Row: {
          action: string
          changed_by_user_id: string | null
          changes: Json | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["sales_order_status"] | null
          old_status: Database["public"]["Enums"]["sales_order_status"] | null
          order_id: string
        }
        Insert: {
          action: string
          changed_by_user_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["sales_order_status"] | null
          old_status?: Database["public"]["Enums"]["sales_order_status"] | null
          order_id: string
        }
        Update: {
          action?: string
          changed_by_user_id?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["sales_order_status"] | null
          old_status?: Database["public"]["Enums"]["sales_order_status"] | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string
          description: string | null
          discount_percent: number | null
          id: string
          line_total: number
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          line_total?: number
          name: string
          order_id: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          line_total?: number
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          assigned_user_id: string | null
          brand_id: string
          cancelled_at: string | null
          confirmed_at: string | null
          contact_id: string
          created_at: string
          deal_id: string | null
          discount_amount: number
          discount_percent: number | null
          id: string
          notes: string | null
          order_number: string
          paid_amount: number
          paid_at: string | null
          status: Database["public"]["Enums"]["sales_order_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          brand_id: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          contact_id: string
          created_at?: string
          deal_id?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          notes?: string | null
          order_number: string
          paid_amount?: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          brand_id?: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          discount_amount?: number
          discount_percent?: number | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_amount?: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          target_amount: number
          target_count: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          target_amount: number
          target_count?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          target_amount?: number
          target_count?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_time_off: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          off_type: Database["public"]["Enums"]["sales_time_off_type"]
          reason: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          off_type?: Database["public"]["Enums"]["sales_time_off_type"]
          reason?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          off_type?: Database["public"]["Enums"]["sales_time_off_type"]
          reason?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      security_findings: {
        Row: {
          area: string
          brand_id: string
          checklist_ref: string | null
          created_at: string
          description: string | null
          id: string
          owner_user_id: string | null
          remediated_at: string | null
          remediation_pr: string | null
          review_id: string
          severity: string
          sla_deadline: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          area: string
          brand_id: string
          checklist_ref?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          remediated_at?: string | null
          remediation_pr?: string | null
          review_id: string
          severity?: string
          sla_deadline?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          area?: string
          brand_id?: string
          checklist_ref?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          remediated_at?: string | null
          remediation_pr?: string | null
          review_id?: string
          severity?: string
          sla_deadline?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_findings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_findings_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_findings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "security_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      security_reviews: {
        Row: {
          brand_id: string
          completed_at: string | null
          created_at: string
          critical_findings: number | null
          high_findings: number | null
          id: string
          lead_user_id: string | null
          low_findings: number | null
          medium_findings: number | null
          quarter: string
          review_type: string
          signed_off_at: string | null
          signed_off_by: string | null
          started_at: string | null
          status: string
          summary: string | null
          total_findings: number | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          created_at?: string
          critical_findings?: number | null
          high_findings?: number | null
          id?: string
          lead_user_id?: string | null
          low_findings?: number | null
          medium_findings?: number | null
          quarter: string
          review_type?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          total_findings?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          critical_findings?: number | null
          high_findings?: number | null
          id?: string
          lead_user_id?: string | null
          low_findings?: number | null
          medium_findings?: number | null
          quarter?: string
          review_type?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          total_findings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_reviews_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reviews_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reviews_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sheets_export_logs: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          dead_letter: boolean
          error: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          lead_event_id: string
          max_attempts: number
          next_attempt_at: string | null
          payload: Json | null
          rows_exported: number | null
          status: string
          tab_name: string | null
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          dead_letter?: boolean
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          lead_event_id: string
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json | null
          rows_exported?: number | null
          status: string
          tab_name?: string | null
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          dead_letter?: boolean
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          lead_event_id?: string
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json | null
          rows_exported?: number | null
          status?: string
          tab_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sheets_export_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheets_export_logs_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: true
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      siem_destinations: {
        Row: {
          actions_filter: string[] | null
          batch_size: number
          brand_id: string
          consecutive_failures: number
          created_at: string
          created_by: string | null
          endpoint_url: string
          entity_types_filter: string[] | null
          hmac_secret: string
          id: string
          is_active: boolean
          last_error: string | null
          last_exported_at: string
          last_success_at: string | null
          mask_pii: boolean
          name: string
          updated_at: string
        }
        Insert: {
          actions_filter?: string[] | null
          batch_size?: number
          brand_id: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          endpoint_url: string
          entity_types_filter?: string[] | null
          hmac_secret: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_exported_at?: string
          last_success_at?: string | null
          mask_pii?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          actions_filter?: string[] | null
          batch_size?: number
          brand_id?: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          endpoint_url?: string
          entity_types_filter?: string[] | null
          hmac_secret?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_exported_at?: string
          last_success_at?: string | null
          mask_pii?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      siem_export_log: {
        Row: {
          brand_id: string
          created_at: string
          destination_id: string
          error_message: string | null
          events_count: number
          exported_from: string | null
          exported_to: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          status: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          destination_id: string
          error_message?: string | null
          events_count?: number
          exported_from?: string | null
          exported_to?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          status: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          destination_id?: string
          error_message?: string | null
          events_count?: number
          exported_from?: string | null
          exported_to?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "siem_export_log_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "siem_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      slo_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metric_type: string
          name: string
          service_name: string
          target_percentage: number
          threshold_value: number | null
          updated_at: string
          window_days: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_type: string
          name: string
          service_name: string
          target_percentage: number
          threshold_value?: number | null
          updated_at?: string
          window_days?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_type?: string
          name?: string
          service_name?: string
          target_percentage?: number
          threshold_value?: number | null
          updated_at?: string
          window_days?: number
        }
        Relationships: []
      }
      slo_measurements: {
        Row: {
          burn_rate_1h: number | null
          burn_rate_24h: number | null
          burn_rate_6h: number | null
          current_sli: number | null
          error_budget_remaining: number | null
          good_events: number
          id: string
          measured_at: string
          metadata: Json | null
          slo_id: string
          total_events: number
        }
        Insert: {
          burn_rate_1h?: number | null
          burn_rate_24h?: number | null
          burn_rate_6h?: number | null
          current_sli?: number | null
          error_budget_remaining?: number | null
          good_events?: number
          id?: string
          measured_at?: string
          metadata?: Json | null
          slo_id: string
          total_events?: number
        }
        Update: {
          burn_rate_1h?: number | null
          burn_rate_24h?: number | null
          burn_rate_6h?: number | null
          current_sli?: number | null
          error_budget_remaining?: number | null
          good_events?: number
          id?: string
          measured_at?: string
          metadata?: Json | null
          slo_id?: string
          total_events?: number
        }
        Relationships: [
          {
            foreignKeyName: "slo_measurements_slo_id_fkey"
            columns: ["slo_id"]
            isOneToOne: false
            referencedRelation: "slo_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          brand_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          mode: string
          period_from: string
          period_to: string
          report_payload: Json | null
          status: string
          triggered_by: string | null
          webhook_response: string | null
          webhook_status_code: number | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          mode: string
          period_from: string
          period_to: string
          report_payload?: Json | null
          status?: string
          triggered_by?: string | null
          webhook_response?: string | null
          webhook_status_code?: number | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          mode?: string
          period_from?: string
          period_to?: string
          report_payload?: Json | null
          status?: string
          triggered_by?: string | null
          webhook_response?: string | null
          webhook_status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: Database["public"]["Enums"]["assigned_by"]
          assigned_by_user_id: string | null
          brand_id: string
          confidence: number | null
          contact_id: string | null
          deal_id: string | null
          id: string
          lead_event_id: string | null
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: Database["public"]["Enums"]["assigned_by"]
          assigned_by_user_id?: string | null
          brand_id: string
          confidence?: number | null
          contact_id?: string | null
          deal_id?: string | null
          id?: string
          lead_event_id?: string | null
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: Database["public"]["Enums"]["assigned_by"]
          assigned_by_user_id?: string | null
          brand_id?: string
          confidence?: number | null
          contact_id?: string | null
          deal_id?: string | null
          id?: string
          lead_event_id?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_assignments_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          brand_id: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          parent_id: string | null
          scope: Database["public"]["Enums"]["tag_scope"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          parent_id?: string | null
          scope?: Database["public"]["Enums"]["tag_scope"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          parent_id?: string | null
          scope?: Database["public"]["Enums"]["tag_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_read_state: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_read_state_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_read_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_audit_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["ticket_audit_action"]
          brand_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["ticket_audit_action"]
          brand_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["ticket_audit_action"]
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_audit_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_audit_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_user_id: string
          body: string
          brand_id: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          brand_id: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          brand_id?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_escalation_policies: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          level_1_minutes: number
          level_1_roles: Database["public"]["Enums"]["app_role"][]
          level_2_minutes: number
          level_2_roles: Database["public"]["Enums"]["app_role"][]
          level_3_minutes: number
          level_3_roles: Database["public"]["Enums"]["app_role"][]
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level_1_minutes?: number
          level_1_roles?: Database["public"]["Enums"]["app_role"][]
          level_2_minutes?: number
          level_2_roles?: Database["public"]["Enums"]["app_role"][]
          level_3_minutes?: number
          level_3_roles?: Database["public"]["Enums"]["app_role"][]
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level_1_minutes?: number
          level_1_roles?: Database["public"]["Enums"]["app_role"][]
          level_2_minutes?: number
          level_2_roles?: Database["public"]["Enums"]["app_role"][]
          level_3_minutes?: number
          level_3_roles?: Database["public"]["Enums"]["app_role"][]
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_escalation_policies_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_escalation_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_escalation_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          lead_event_id: string | null
          note: string | null
          ticket_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          lead_event_id?: string | null
          note?: string | null
          ticket_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          lead_event_id?: string | null
          note?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_lead_event_id_fkey"
            columns: ["lead_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          archived: boolean
          archived_at: string | null
          archived_by_user_id: string | null
          assigned_at: string | null
          assigned_by_user_id: string | null
          assigned_to_user_id: string | null
          brand_id: string
          category_tag_id: string | null
          closed_at: string | null
          contact_id: string
          created_at: string
          created_by: Database["public"]["Enums"]["ticket_creator"]
          deal_id: string | null
          description: string | null
          escalated_at: string | null
          escalated_to_user_id: string | null
          escalation_level: number
          id: string
          opened_at: string
          priority: number
          resolved_at: string | null
          sla_breached_at: string | null
          source_context: string | null
          source_event_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          archived_by_user_id?: string | null
          assigned_at?: string | null
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          brand_id: string
          category_tag_id?: string | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["ticket_creator"]
          deal_id?: string | null
          description?: string | null
          escalated_at?: string | null
          escalated_to_user_id?: string | null
          escalation_level?: number
          id?: string
          opened_at?: string
          priority?: number
          resolved_at?: string | null
          sla_breached_at?: string | null
          source_context?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          archived_by_user_id?: string | null
          assigned_at?: string | null
          assigned_by_user_id?: string | null
          assigned_to_user_id?: string | null
          brand_id?: string
          category_tag_id?: string | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["ticket_creator"]
          deal_id?: string | null
          description?: string | null
          escalated_at?: string | null
          escalated_to_user_id?: string | null
          escalation_level?: number
          id?: string
          opened_at?: string
          priority?: number
          resolved_at?: string | null
          sla_breached_at?: string | null
          source_context?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_archived_by_user_id_fkey"
            columns: ["archived_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_tag_id_fkey"
            columns: ["category_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_escalated_to_user_id_fkey"
            columns: ["escalated_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      trace_events: {
        Row: {
          attributes: Json | null
          created_at: string
          duration_ms: number
          error_message: string | null
          http_status: number | null
          id: string
          operation_name: string
          parent_span_id: string | null
          service_name: string
          span_id: string
          started_at: string
          status_code: string
          trace_id: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          duration_ms: number
          error_message?: string | null
          http_status?: number | null
          id?: string
          operation_name: string
          parent_span_id?: string | null
          service_name: string
          span_id: string
          started_at: string
          status_code?: string
          trace_id: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          http_status?: number | null
          id?: string
          operation_name?: string
          parent_span_id?: string | null
          service_name?: string
          span_id?: string
          started_at?: string
          status_code?: string
          trace_id?: string
        }
        Relationships: []
      }
      user_hidden_columns: {
        Row: {
          brand_id: string
          column_key: string
          created_at: string
          id: string
          is_hidden: boolean
          table_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          column_key: string
          created_at?: string
          id?: string
          is_hidden: boolean
          table_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          column_key?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          table_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hidden_columns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hidden_columns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          brand_id: string
          id: string
          is_enabled: boolean
          module_key: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          id?: string
          is_enabled?: boolean
          module_key: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          id?: string
          is_enabled?: boolean
          module_key?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_access_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_page_permissions: {
        Row: {
          brand_id: string
          can_access: boolean
          created_at: string
          id: string
          page: Database["public"]["Enums"]["app_page"]
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          can_access: boolean
          created_at?: string
          id?: string
          page: Database["public"]["Enums"]["app_page"]
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          can_access?: boolean
          created_at?: string
          id?: string
          page?: Database["public"]["Enums"]["app_page"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_page_permissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_page_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          brand_id: string
          can_access_children: boolean
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          can_access_children?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          can_access_children?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          supabase_auth_id: string
          updated_at: string
          voispeed_ext: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          supabase_auth_id: string
          updated_at?: string
          voispeed_ext?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          supabase_auth_id?: string
          updated_at?: string
          voispeed_ext?: string | null
        }
        Relationships: []
      }
      voispeed_configs: {
        Row: {
          base_url: string
          brand_id: string
          created_at: string
          created_by: string | null
          domain: string | null
          enabled: boolean
          id: string
          token: string
          updated_at: string
        }
        Insert: {
          base_url: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          domain?: string | null
          enabled?: boolean
          id?: string
          token: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          domain?: string | null
          enabled?: boolean
          id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voispeed_configs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voispeed_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbound_events: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          status: string
          webhook_source_id: string | null
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source: string
          status?: string
          webhook_source_id?: string | null
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
          status?: string
          webhook_source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_inbound_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_inbound_events_webhook_source_id_fkey"
            columns: ["webhook_source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_inbound_events_webhook_source_id_fkey"
            columns: ["webhook_source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_request_dedup: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint: string
          id?: string
          source_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_request_dedup_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_request_dedup_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "webhook_sources_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_sources: {
        Row: {
          api_key_hash: string
          brand_id: string
          counts_as_new_lead: boolean
          created_at: string
          default_pipeline_stage_id: string | null
          description: string | null
          handler: string | null
          hmac_enabled: boolean
          hmac_secret: string | null
          hmac_secret_hash: string | null
          id: string
          is_active: boolean
          mapping: Json | null
          name: string
          payload_schema: Json | null
          rate_limit_per_min: number
          replay_window_seconds: number
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          brand_id: string
          counts_as_new_lead?: boolean
          created_at?: string
          default_pipeline_stage_id?: string | null
          description?: string | null
          handler?: string | null
          hmac_enabled?: boolean
          hmac_secret?: string | null
          hmac_secret_hash?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name: string
          payload_schema?: Json | null
          rate_limit_per_min?: number
          replay_window_seconds?: number
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          brand_id?: string
          counts_as_new_lead?: boolean
          created_at?: string
          default_pipeline_stage_id?: string | null
          description?: string | null
          handler?: string | null
          hmac_enabled?: boolean
          hmac_secret?: string | null
          hmac_secret_hash?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name?: string
          payload_schema?: Json | null
          rate_limit_per_min?: number
          replay_window_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_sources_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_sources_default_pipeline_stage_id_fkey"
            columns: ["default_pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      outbound_webhooks_safe: {
        Row: {
          brand_id: string | null
          created_at: string | null
          event_types:
            | Database["public"]["Enums"]["webhook_event_type"][]
            | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          event_types?:
            | Database["public"]["Enums"]["webhook_event_type"][]
            | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          event_types?:
            | Database["public"]["Enums"]["webhook_event_type"][]
            | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ai_override_rate_30d: {
        Row: {
          avg_confidence: number | null
          avg_confidence_when_overridden: number | null
          brand_id: string | null
          day: string | null
          overridden_decisions: number | null
          override_rate_pct: number | null
          total_decisions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ai_proposal_outcomes_30d: {
        Row: {
          brand_id: string | null
          cnt: number | null
          day: string | null
          decision:
            | Database["public"]["Enums"]["call_action_decision_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_action_decisions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_sources_safe: {
        Row: {
          brand_id: string | null
          counts_as_new_lead: boolean | null
          created_at: string | null
          default_pipeline_stage_id: string | null
          description: string | null
          hmac_enabled: boolean | null
          id: string | null
          is_active: boolean | null
          name: string | null
          payload_schema: Json | null
          rate_limit_per_min: number | null
          replay_window_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          counts_as_new_lead?: boolean | null
          created_at?: string | null
          default_pipeline_stage_id?: string | null
          description?: string | null
          hmac_enabled?: boolean | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          payload_schema?: Json | null
          rate_limit_per_min?: number | null
          replay_window_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          counts_as_new_lead?: boolean | null
          created_at?: string | null
          default_pipeline_stage_id?: string | null
          description?: string | null
          hmac_enabled?: boolean | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          payload_schema?: Json | null
          rate_limit_per_min?: number | null
          replay_window_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_sources_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_sources_default_pipeline_stage_id_fkey"
            columns: ["default_pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_ai_prompt: { Args: { p_prompt_id: string }; Returns: boolean }
      add_contact_phone: {
        Args: {
          p_contact_id: string
          p_is_primary?: boolean
          p_phone_raw: string
        }
        Returns: string
      }
      add_group_member: {
        Args: { p_new_user_id: string; p_role?: string; p_thread_id: string }
        Returns: undefined
      }
      apply_ai_deal_tags: {
        Args: { p_confidence?: number; p_deal_id: string; p_tag_ids: string[] }
        Returns: number
      }
      apply_ai_fallback: {
        Args: { p_lead_event_id: string }
        Returns: undefined
      }
      assert_can_backup_brand: {
        Args: { p_brand_id: string }
        Returns: boolean
      }
      assert_can_restore_brand: {
        Args: { p_brand_id: string }
        Returns: boolean
      }
      assign_appointment_sales: {
        Args: { p_appointment_id: string; p_sales_user_id: string }
        Returns: undefined
      }
      assign_ticket_round_robin: {
        Args: { p_brand_id: string; p_ticket_id: string }
        Returns: string
      }
      assign_unassigned_support_tickets: {
        Args: { p_brand_id: string }
        Returns: number
      }
      build_contact_search_text: {
        Args: { p_contact_id: string }
        Returns: string
      }
      build_contact_snapshot: { Args: { p_contact_id: string }; Returns: Json }
      build_deal_snapshot: { Args: { p_deal_id: string }; Returns: Json }
      build_entity_tags: {
        Args: {
          p_brand_id: string
          p_contact_id?: string
          p_deal_id?: string
          p_lead_event_id?: string
        }
        Returns: Json
      }
      build_webhook_payload_v1: {
        Args: {
          p_appointment_snapshot?: Json
          p_brand_id: string
          p_contact_id?: string
          p_deal_id?: string
          p_event_id: string
          p_event_snapshot?: Json
          p_event_type: string
          p_lead_event_id?: string
          p_new_data?: Json
          p_occurred_at: string
          p_old_data?: Json
          p_refs?: Json
          p_sale_snapshot?: Json
          p_stage_snapshot?: Json
        }
        Returns: Json
      }
      calculate_deal_scores: { Args: { p_brand_id?: string }; Returns: number }
      calculate_lead_score: {
        Args: { p_contact_id: string; p_trigger_event?: string }
        Returns: Json
      }
      calculate_slo_burn_rate: {
        Args: { p_slo_id: string }
        Returns: {
          burn_rate_1h: number
          burn_rate_24h: number
          burn_rate_6h: number
          current_sli: number
          error_budget_remaining: number
        }[]
      }
      can_manage_role: {
        Args: {
          manager_role: Database["public"]["Enums"]["app_role"]
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      can_manage_role_in_brand: {
        Args: {
          p_brand_id: string
          target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      can_view_audit: { Args: { _supabase_auth_id: string }; Returns: boolean }
      cap_to_provincia: { Args: { p_cap: string }; Returns: string }
      cap_to_regione: { Args: { p_cap: string }; Returns: string }
      capi_events_summary: {
        Args: { p_brand_ids: string[]; p_from?: string; p_to?: string }
        Returns: {
          avg_attempts: number
          failed_count: number
          lead_events: number
          pending_count: number
          processing_count: number
          purchase_events: number
          sent_count: number
          skipped_count: number
          total_events: number
        }[]
      }
      capture_capacity_snapshot: { Args: never; Returns: Json }
      check_all_brands_sla_breaches: { Args: never; Returns: Json }
      check_and_mark_sla_breaches: {
        Args: { p_brand_id: string }
        Returns: number
      }
      check_appointment_conflict: {
        Args: {
          p_assigned_sales_user_id: string
          p_brand_id: string
          p_duration_minutes: number
          p_exclude_appointment_id?: string
          p_scheduled_at: string
        }
        Returns: {
          contact_id: string
          duration_minutes: number
          id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      check_phone_duplicate: {
        Args: { p_brand_id: string; p_phone_normalized: string }
        Returns: {
          contact_id: string
          email: string
          first_name: string
          last_name: string
        }[]
      }
      check_report_rate_limit: { Args: { p_user_id: string }; Returns: boolean }
      claim_automation_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          brand_id: string
          contact_id: string | null
          created_at: string
          endpoint: string
          headers: Json
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          method: string
          payload: Json
          run_at: string
          sent_at: string | null
          source_event_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_capi_events: {
        Args: { p_limit: number; p_processing_by?: string }
        Returns: {
          action_source: string
          attempts: number
          brand_id: string
          consent_snapshot: boolean
          contact_id: string | null
          created_at: string | null
          custom_data: Json | null
          deal_id: string | null
          event_id: string
          event_name: string
          event_time: string
          id: string
          last_error: string | null
          lead_event_id: string | null
          max_attempts: number
          meta_app_id: string
          processing_at: string | null
          processing_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["meta_capi_status"]
          user_data: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "meta_capi_event_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_inbound_events: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          brand_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          status: string
          webhook_source_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_inbound_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pending_notification_webhooks: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          destination_id: string
          endpoint_url: string
          hmac_secret: string
          outbox_id: string
          payload: Json
          preset: string
          retry_max: number
        }[]
      }
      claim_pending_siem_exports: {
        Args: { _destination_id: string }
        Returns: {
          action: string
          actor_display_name: string
          actor_type: string
          actor_user_id: string
          brand_id: string
          changed_fields: string[]
          correlation_id: string
          entity_id: string
          entity_type: string
          event_id: string
          metadata: Json
          new_value: Json
          occurred_at: string
          old_value: Json
          source: string
        }[]
      }
      claim_webhook_deliveries: {
        Args: { p_batch_size?: number }
        Returns: {
          attempt_count: number
          brand_id: string
          created_at: string
          dead_at: string | null
          duration_ms: number | null
          event_id: string
          event_type: Database["public"]["Enums"]["webhook_event_type"]
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          response_body: string | null
          response_status: number | null
          status: Database["public"]["Enums"]["webhook_delivery_status"]
          updated_at: string
          webhook_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbound_webhook_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_traces: { Args: never; Returns: number }
      cleanup_outbound_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: number
      }
      cleanup_webhook_dedup: { Args: never; Returns: number }
      complete_ai_tag_job: {
        Args: { p_error?: string; p_job_id: string }
        Returns: undefined
      }
      compute_appointment_risk_score: {
        Args: { p_appointment_id: string }
        Returns: number
      }
      consume_rate_limit_token: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      correct_contact_phone: {
        Args: { p_contact_id: string; p_new_phone: string; p_old_phone: string }
        Returns: Json
      }
      count_new_leads_by_day: {
        Args: { p_brand_ids: string[]; p_from: string; p_to: string }
        Returns: {
          day: string
          new_leads: number
        }[]
      }
      count_new_leads_in_range: {
        Args: { p_brand_ids: string[]; p_from: string; p_to: string }
        Returns: number
      }
      create_appointment: {
        Args: {
          p_address?: string
          p_assigned_sales_user_id?: string
          p_brand_id: string
          p_cap?: string
          p_city?: string
          p_contact_id: string
          p_deal_id?: string
          p_duration_minutes?: number
          p_notes?: string
          p_scheduled_at?: string
        }
        Returns: string
      }
      create_brand_notifications: {
        Args: {
          p_body?: string
          p_brand_id: string
          p_entity_id?: string
          p_entity_type?: string
          p_exclude_user_id?: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: undefined
      }
      create_group_chat: {
        Args: { p_brand_id: string; p_member_ids: string[]; p_title: string }
        Returns: string
      }
      create_manual_lead_event: {
        Args: {
          p_ai_conversation_summary?: string
          p_booking_notes?: string
          p_brand_id: string
          p_contact_channel?: Database["public"]["Enums"]["contact_channel"]
          p_contact_id: string
          p_customer_sentiment?: Database["public"]["Enums"]["customer_sentiment"]
          p_decision_status?: Database["public"]["Enums"]["decision_status"]
          p_lead_source_channel?: Database["public"]["Enums"]["lead_source_channel"]
          p_logistics_notes?: string
          p_objection_type?: Database["public"]["Enums"]["objection_type"]
          p_pacemaker_status?: Database["public"]["Enums"]["pacemaker_status"]
          p_source_name?: string
        }
        Returns: string
      }
      create_marketing_lead: {
        Args: {
          p_brand_id: string
          p_contact_id: string
          p_marketing_campaign_id?: string
          p_notes?: string
          p_source_name?: string
        }
        Returns: string
      }
      create_outbound_webhook:
        | {
            Args: {
              p_brand_id: string
              p_event_types: string[]
              p_is_active?: boolean
              p_name: string
              p_secret: string
              p_url: string
            }
            Returns: {
              secret: string
              webhook_id: string
            }[]
          }
        | {
            Args: {
              p_brand_id: string
              p_custom_url_params?: Json
              p_event_types: string[]
              p_is_active?: boolean
              p_name: string
              p_payload_format?: string
              p_payload_mapping?: Json
              p_secret: string
              p_url: string
            }
            Returns: {
              secret: string
              webhook_id: string
            }[]
          }
        | {
            Args: {
              p_brand_id: string
              p_custom_url_params?: Json
              p_event_types: Database["public"]["Enums"]["webhook_event_type"][]
              p_is_active?: boolean
              p_name: string
              p_payload_format?: string
              p_payload_mapping?: Json
              p_secret: string
              p_url: string
            }
            Returns: {
              secret: string
              webhook_id: string
            }[]
          }
      create_pipeline_stage:
        | {
            Args: {
              p_brand_id: string
              p_color?: string
              p_description?: string
              p_name: string
            }
            Returns: string
          }
        | {
            Args: { p_brand_id?: string; p_color?: string; p_name: string }
            Returns: string
          }
      create_sales_order_from_deal: {
        Args: { p_deal_id: string }
        Returns: string
      }
      current_app_user_id: { Args: never; Returns: string }
      current_brand_role: {
        Args: { p_brand_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      deactivate_pipeline_stage: {
        Args: { p_fallback_stage_id: string; p_stage_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_notifications: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      delete_outbound_webhook: { Args: { p_id: string }; Returns: boolean }
      delete_pipeline_stage_permanently: {
        Args: { p_stage_id: string }
        Returns: Json
      }
      delete_read_notifications: {
        Args: { p_brand_id?: string }
        Returns: number
      }
      detect_anomalies: { Args: { p_lookback_hours?: number }; Returns: Json }
      detect_audit_anomalies: {
        Args: { p_brand_id: string; p_lookback_hours?: number }
        Returns: Json
      }
      dynamic_analytics_query: {
        Args: {
          p_brand_id?: string
          p_dataset: string
          p_date_from?: string
          p_date_to?: string
          p_filters?: Json
          p_group_by?: string
          p_limit?: number
          p_metric?: string
        }
        Returns: Json
      }
      e2e_revenue_snapshot: { Args: { p_phone: string }; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_payment_overdue_notifications: {
        Args: { p_brand_id?: string }
        Returns: {
          brands_processed: number
          notifications_created: number
        }[]
      }
      enqueue_webhook_delivery: {
        Args: {
          p_brand_id: string
          p_event_id: string
          p_event_type: Database["public"]["Enums"]["webhook_event_type"]
          p_payload: Json
        }
        Returns: number
      }
      escalate_all_brands_breached_tickets: { Args: never; Returns: Json }
      escalate_breached_tickets: { Args: { p_brand_id: string }; Returns: Json }
      find_meta_app_by_slug: {
        Args: { p_brand_slug: string }
        Returns: {
          access_token: string
          app_secret: string
          brand_id: string
          brand_slug: string
          id: string
          is_active: boolean
          page_id: string
          verify_token: string
        }[]
      }
      find_meta_lead_source: {
        Args: { p_form_id?: string; p_page_id: string }
        Returns: {
          access_token: string
          brand_id: string
          source_id: string
        }[]
      }
      find_or_create_contact: {
        Args: {
          p_address?: string
          p_assumed_country: boolean
          p_brand_id: string
          p_cap?: string
          p_city?: string
          p_country_code: string
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_lead_message?: string
          p_phone_normalized: string
          p_phone_raw: string
        }
        Returns: string
      }
      find_or_create_deal:
        | {
            Args: { p_brand_id: string; p_contact_id: string }
            Returns: string
          }
        | {
            Args: {
              p_brand_id: string
              p_contact_id: string
              p_stage_id?: string
            }
            Returns: string
          }
      find_or_create_ticket: {
        Args: {
          p_brand_id: string
          p_category_tag_id?: string
          p_contact_id: string
          p_deal_id: string
          p_description: string
          p_lead_event_id: string
          p_priority: number
          p_title: string
        }
        Returns: {
          is_new: boolean
          ticket_event_id: string
          ticket_id: string
        }[]
      }
      find_or_link_household_person: {
        Args: {
          p_brand_id: string
          p_contact_id: string
          p_first_name?: string
          p_has_device?: boolean
          p_last_name?: string
          p_pacemaker_status?: string
          p_phone_normalized: string
          p_phone_raw: string
          p_role: Database["public"]["Enums"]["household_person_role"]
        }
        Returns: string
      }
      generate_access_review: { Args: { p_period: string }; Returns: string }
      generate_compliance_report: {
        Args: {
          p_brand_id: string
          p_notes?: string
          p_period_end: string
          p_period_start: string
          p_report_type: string
        }
        Returns: Json
      }
      generate_order_number: { Args: { p_brand_id: string }; Returns: string }
      get_accessible_brand_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_ad_creative_stats: {
        Args: {
          p_brand_ids: string[]
          p_campaign_id?: string
          p_from_date: string
          p_platform?: string
          p_to_date: string
        }
        Returns: {
          avg_frequency: number
          brand_id: string
          cpc: number
          cpm: number
          ctr: number
          days_count: number
          external_ad_id: string
          external_ad_name: string
          external_campaign_id: string
          external_campaign_name: string
          platform: string
          thumbnail_url: string
          total_clicks: number
          total_impressions: number
          total_reach: number
          total_spend: number
        }[]
      }
      get_ad_demographics: {
        Args: {
          p_brand_ids: string[]
          p_campaign_id?: string
          p_from_date: string
          p_platform?: string
          p_to_date: string
        }
        Returns: {
          age_range: string
          cpc: number
          ctr: number
          gender: string
          total_clicks: number
          total_impressions: number
          total_reach: number
          total_spend: number
        }[]
      }
      get_ad_platform_stats: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_from: string
          p_platform?: Database["public"]["Enums"]["ad_platform"]
          p_to: string
        }
        Returns: {
          avg_frequency: number
          brand_id: string
          campaign_id: string
          campaign_name: string
          cpc: number
          cpm: number
          ctr: number
          days_count: number
          external_campaign_id: string
          external_campaign_name: string
          platform: Database["public"]["Enums"]["ad_platform"]
          total_clicks: number
          total_conversions: number
          total_impressions: number
          total_reach: number
          total_spend: number
        }[]
      }
      get_ad_platform_stats_summary: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_from: string
          p_platform?: string
          p_to: string
        }
        Returns: {
          avg_cpc: number
          avg_cpl: number
          avg_cpm: number
          avg_ctr: number
          avg_frequency: number
          total_clicks: number
          total_conversions: number
          total_impressions: number
          total_leads: number
          total_reach: number
          total_spend: number
        }[]
      }
      get_ad_platform_stats_trend: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_from: string
          p_platform?: string
          p_to: string
        }
        Returns: {
          stat_date: string
          total_clicks: number
          total_conversions: number
          total_impressions: number
          total_leads: number
          total_spend: number
        }[]
      }
      get_admin_finance_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_decisions_drilldown: {
        Args: {
          p_brand_id?: string
          p_days?: number
          p_initial_stage?: string
          p_limit?: number
          p_model_version?: string
          p_offset?: number
          p_only_overridden?: boolean
          p_overridden_by_user_id?: string
        }
        Returns: Json
      }
      get_ai_decisions_filter_options: {
        Args: { p_brand_id?: string; p_days?: number }
        Returns: Json
      }
      get_ai_metrics_errors: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_metrics_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_override_summary: {
        Args: { p_brand_id?: string; p_days?: number }
        Returns: Json
      }
      get_ai_quality_detailed: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_quality_metrics: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_appointment_campaign_attribution: {
        Args: { p_appointment_id: string }
        Returns: {
          appointment_id: string
          campaign_external_id: string
          campaign_id: string
          campaign_name: string
          channel_id: string
          contact_id: string
          group_id: string
          lead_event_at: string
          lead_event_id: string
          match_type: string
          matched_at: string
        }[]
      }
      get_appointments_by_campaign: {
        Args: { p_brand_id: string; p_from_date: string; p_to_date: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          cancelled_count: number
          channel_id: string
          completed_count: number
          external_id: string
          no_show_count: number
          scheduled_count: number
          total_appointments: number
          unique_contacts: number
        }[]
      }
      get_appointments_ops_kpi: {
        Args: { p_brand_id: string; p_date_from: string; p_date_to: string }
        Returns: Json
      }
      get_assignable_roles: {
        Args: { p_brand_id: string }
        Returns: {
          role_label: string
          role_value: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_attribution_summary: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: {
          exact_count: number
          group_count: number
          match_rate: number
          overall_cpl: number
          total_leads: number
          unmapped_count: number
        }[]
      }
      get_audit_access_log: {
        Args: {
          p_access_type?: string
          p_brand_id: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_user_id?: string
        }
        Returns: Json
      }
      get_audit_dashboard_stats: {
        Args: { p_brand_id: string; p_date_from?: string; p_date_to?: string }
        Returns: Json
      }
      get_audit_pii_policies_for_role: {
        Args: never
        Returns: {
          description: string
          field_pattern: string
          strategy: string
        }[]
      }
      get_backup_schedules: {
        Args: never
        Returns: {
          brand_id: string
          brand_name: string
          created_at: string
          day_of_week: number
          enabled: boolean
          frequency: string
          hour_utc: number
          id: string
          last_run_at: string
          last_run_status: string
          next_run_at: string
          retention_days: number
          scope: string
          updated_at: string
        }[]
      }
      get_board_slo_metrics: {
        Args: { p_brand_id?: string; p_month_start?: string }
        Returns: Json
      }
      get_brand_operators: {
        Args: { p_brand_id: string }
        Returns: {
          email: string
          full_name: string
          role: string
          supabase_auth_id: string
          user_id: string
        }[]
      }
      get_brands_with_hierarchy: {
        Args: { p_user_id: string }
        Returns: {
          child_count: number
          id: string
          is_parent: boolean
          name: string
          parent_brand_id: string
          parent_brand_name: string
          slug: string
        }[]
      }
      get_call_center_telephony_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_callcenter_kpis_by_operator: {
        Args: { p_brand_ids: string[]; p_from: string; p_to: string }
        Returns: Json
      }
      get_callcenter_kpis_overview: {
        Args: { p_brand_ids: string[]; p_from: string; p_to: string }
        Returns: Json
      }
      get_ceo_dashboard_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ceo_operational_kpis: {
        Args: {
          p_brand_id: string
          p_brand_ids?: string[]
          p_from?: string
          p_to?: string
        }
        Returns: Json
      }
      get_compliance_report: { Args: { p_report_id: string }; Returns: Json }
      get_contact_field_definitions: {
        Args: { p_brand_id: string }
        Returns: {
          brand_id: string
          description: string
          display_order: number
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          is_required: boolean
          key: string
          label: string
          options: Json
          scope: Database["public"]["Enums"]["custom_field_scope"]
        }[]
      }
      get_contacts_with_sales_totals: {
        Args: { p_brand_id: string }
        Returns: {
          contact_id: string
          sales_count: number
          sales_total: number
        }[]
      }
      get_cpl_analytics: {
        Args: {
          p_brand_id: string
          p_from?: string
          p_group_by?: string
          p_to?: string
        }
        Returns: {
          cpl: number
          entity_id: string
          entity_name: string
          leads_count: number
          match_type: string
          total_spend: number
        }[]
      }
      get_cron_secret: { Args: never; Returns: string }
      get_deal_velocity_metrics: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_funnel_breakdown: {
        Args: {
          p_brand_id: string
          p_from?: string
          p_role?: string
          p_to?: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_funnel_losses: {
        Args: {
          p_brand_id: string
          p_from?: string
          p_role?: string
          p_to?: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_funnel_metrics: {
        Args: {
          p_brand_id: string
          p_from?: string
          p_role?: string
          p_to?: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_lead_source_analytics: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_marketing_campaign_kpis: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_channel_id?: string
          p_from: string
          p_to: string
        }
        Returns: {
          cac: number
          campaign_id: string
          campaign_name: string
          channel_name: string
          cpl: number
          deals_count: number
          deals_won: number
          leads_count: number
          marketing_cost: number
          revenue: number
          roi: number
        }[]
      }
      get_marketing_channel_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          avg_roi: number
          campaigns_count: number
          channel_id: string
          channel_name: string
          channel_type: string
          deals_won: number
          leads_count: number
          marketing_cost: number
          revenue: number
        }[]
      }
      get_marketing_leads_by_campaign: {
        Args: { p_brand_ids: string[]; p_from_date: string; p_to_date: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          channel_name: string
          manual_leads: number
          meta_leads: number
          meta_matched: number
          meta_unmatched: number
          total_leads: number
          webhook_leads: number
        }[]
      }
      get_marketing_monthly_trend: {
        Args: { p_brand_id: string; p_months_back?: number }
        Returns: {
          cost: number
          deals_won: number
          leads_count: number
          month: string
          revenue: number
          roi: number
        }[]
      }
      get_marketing_summary_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          avg_cac: number
          avg_cpl: number
          overall_roi: number
          total_deals: number
          total_deals_won: number
          total_leads: number
          total_marketing_cost: number
          total_revenue: number
        }[]
      }
      get_module_adoption_stats: {
        Args: { p_brand_id: string; p_days?: number }
        Returns: Json
      }
      get_my_permissions: { Args: { p_brand_id: string }; Returns: Json }
      get_notification_preferences: {
        Args: { p_brand_id: string }
        Returns: {
          brand_id: string
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          user_id: string
        }[]
      }
      get_or_create_ai_config: {
        Args: { p_brand_id: string }
        Returns: {
          active_prompt_version: string | null
          brand_id: string
          confidence_threshold: number | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["ai_mode"]
          rules_json: Json
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ai_configs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_entity_thread: {
        Args: { p_brand_id: string; p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      get_or_create_executive_thread: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: string
      }
      get_overdue_installments: {
        Args: { p_brand_id: string; p_days_ahead?: number }
        Returns: {
          assigned_user_id: string
          brand_id: string
          contact_id: string
          contact_name: string
          days_overdue: number
          due_date: string
          installment_amount: number
          installment_index: number
          order_id: string
          order_number: string
          paid_amount: number
          payment_id: string
          remaining_amount: number
          status: string
          total_amount: number
        }[]
      }
      get_paginated_notifications: {
        Args: {
          p_brand_id?: string
          p_limit?: number
          p_offset?: number
          p_type_filter?: string
          p_unread_only?: boolean
        }
        Returns: Json
      }
      get_pending_ai_tag_jobs: {
        Args: { p_limit?: number }
        Returns: {
          brand_id: string
          deal_id: string
          job_id: string
          trigger_reason: string
        }[]
      }
      get_pending_alert_deliveries: {
        Args: { _limit?: number }
        Returns: {
          anomaly_id: string
          attempt_count: number
          brand_id: string
          channel_id: string
          channel_type: string
          delivery_id: string
          destination: string
          mask_pii: boolean
          webhook_secret: string
        }[]
      }
      get_pipeline_funnel_analytics: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_revenue_by_payment_method: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: {
          method: string
          order_count: number
          total_revenue: number
        }[]
      }
      get_revenue_forecast: {
        Args: { p_brand_id: string; p_period?: string }
        Returns: Json
      }
      get_role_level: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      get_sales_capacity: {
        Args: { p_brand_id: string; p_date_from: string; p_date_to: string }
        Returns: Json
      }
      get_sales_kpis: {
        Args: {
          p_brand_id: string
          p_from: string
          p_to: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_salesperson_kpis: {
        Args: { p_brand_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_tag_assignment_counts: {
        Args: { p_brand_id: string }
        Returns: {
          contact_count: number
          deal_count: number
          event_count: number
          tag_id: string
          total_count: number
        }[]
      }
      get_tag_tree: {
        Args: { p_brand_id: string }
        Returns: {
          color: string
          depth: number
          description: string
          id: string
          is_active: boolean
          name: string
          order_index: number
          parent_id: string
          path: string
          scope: Database["public"]["Enums"]["tag_scope"]
        }[]
      }
      get_thread_display_titles: {
        Args: { p_thread_ids: string[] }
        Returns: {
          display_title: string
          thread_id: string
        }[]
      }
      get_ticket_escalation_audit: {
        Args: {
          p_brand_id?: string
          p_from?: string
          p_level?: number
          p_limit?: number
          p_to?: string
        }
        Returns: {
          audit_id: string
          brand_id: string
          escalated_at: string
          escalated_to_name: string
          escalated_to_user_id: string
          escalation_level: number
          minutes_since_breach: number
          notification_id: string
          notification_read_at: string
          outcome: string
          previous_level: number
          sla_breached_at: string
          suggestion_acted_on_at: string
          suggestion_dismissed_at: string
          suggestion_id: string
          ticket_id: string
          ticket_priority: number
          ticket_status: string
          ticket_title: string
        }[]
      }
      get_ticket_escalation_policy: {
        Args: { p_brand_id: string }
        Returns: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          level_1_minutes: number
          level_1_roles: Database["public"]["Enums"]["app_role"][]
          level_2_minutes: number
          level_2_roles: Database["public"]["Enums"]["app_role"][]
          level_3_minutes: number
          level_3_roles: Database["public"]["Enums"]["app_role"][]
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ticket_escalation_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_ticket_queue_counts:
        | {
            Args: {
              p_brand_id?: string
              p_brand_ids?: string[]
              p_current_user_id?: string
              p_queue_tab?: string
              p_sla_thresholds?: string
              p_tag_ids?: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              p_brand_id: string
              p_current_user_id?: string
              p_queue_tab?: string
              p_sla_thresholds?: Json
              p_tag_ids?: string[]
            }
            Returns: Json
          }
      get_ticket_trend_dashboard: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_unified_customer_timeline: {
        Args: { p_contact_id: string; p_limit?: number }
        Returns: {
          action: string
          actor_display_name: string
          entity_id: string
          entity_type: string
          event_id: string
          metadata: Json
          occurred_at: string
          source: string
          summary: string
        }[]
      }
      get_unread_counts: {
        Args: never
        Returns: {
          thread_id: string
          unread_count: number
        }[]
      }
      get_unread_notification_count: {
        Args: { p_brand_id?: string }
        Returns: number
      }
      get_user_brand_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_id: { Args: { _auth_uid: string }; Returns: string }
      get_webhook_delivery: { Args: { p_delivery_id: string }; Returns: Json }
      get_webhook_delivery_health: {
        Args: { p_brand_id: string; p_from_hours?: number }
        Returns: {
          avg_latency_seconds: number
          consecutive_failures: number
          dead_letter_count: number
          destination_id: string
          destination_name: string
          failed_count: number
          is_active: boolean
          last_error: string
          last_success_at: string
          p95_latency_seconds: number
          pending_count: number
          preset: string
          sent_count: number
          success_rate: number
          total_attempts: number
        }[]
      }
      has_finance_access: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      has_marketing_access: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      has_marketing_write_access: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_for_brand: {
        Args: {
          _brand_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_meta_lead_event: {
        Args: {
          p_ad_id: string
          p_brand_id: string
          p_campaign_id: string
          p_form_id: string
          p_leadgen_id: string
          p_page_id: string
          p_raw_event: Json
          p_source_id: string
        }
        Returns: {
          event_id: string
          is_duplicate: boolean
        }[]
      }
      is_audit_admin: { Args: { _supabase_auth_id: string }; Returns: boolean }
      is_column_hidden_for_user: {
        Args: {
          p_brand_id: string
          p_column_key: string
          p_table_name: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_thread_member: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_thread_owner_or_moderator: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      issue_mcp_token: {
        Args: {
          p_brand_id?: string
          p_expires_at?: string
          p_kind?: string
          p_name: string
          p_scopes?: string[]
        }
        Returns: {
          prefix: string
          token: string
          token_id: string
        }[]
      }
      list_backup_archives: {
        Args: { p_brand_id: string; p_limit?: number }
        Returns: {
          brand_id: string
          created_at: string
          expires_at: string
          run_id: string
          scheduled: boolean
          scope: string
          size_bytes: number
          status: string
          storage_path: string
          storage_uploaded_at: string
          total_rows: number
        }[]
      }
      list_capi_events: {
        Args: {
          p_brand_ids: string[]
          p_event_name?: string
          p_from?: string
          p_limit?: number
          p_status?: string
          p_to?: string
        }
        Returns: {
          attempts: number
          brand_id: string
          consent_snapshot: boolean
          contact_id: string
          contact_name: string
          created_at: string
          deal_id: string
          event_id: string
          event_name: string
          event_time: string
          id: string
          last_error: string
          lead_event_id: string
          max_attempts: number
          sent_at: string
          status: string
        }[]
      }
      list_compliance_reports: {
        Args: { p_brand_id: string; p_limit?: number; p_report_type?: string }
        Returns: Json
      }
      list_contact_lead_events: {
        Args: { p_contact_id: string; p_include_archived?: boolean }
        Returns: Json
      }
      list_outbound_webhooks: {
        Args: { p_brand_id: string }
        Returns: {
          created_at: string
          custom_url_params: Json
          event_types: Database["public"]["Enums"]["webhook_event_type"][]
          id: string
          is_active: boolean
          name: string
          payload_format: string
          payload_mapping: Json
          updated_at: string
          url: string
        }[]
      }
      list_team_members: {
        Args: {
          p_active_only?: boolean
          p_brand_id: string
          p_role_filter?: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          can_edit: boolean
          created_at: string
          email: string
          full_name: string
          is_active: boolean
          membership_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_webhook_deliveries: {
        Args: {
          p_brand_id: string
          p_event_type?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_webhook_id?: string
        }
        Returns: Json
      }
      log_audit_access: {
        Args: {
          p_access_type: string
          p_brand_id: string
          p_filters?: Json
          p_reason?: string
          p_result_count?: number
          p_user_agent?: string
        }
        Returns: string
      }
      map_stage_to_contact_status: {
        Args: { p_stage_name: string }
        Returns: Database["public"]["Enums"]["contact_status"]
      }
      mark_all_notifications_read: {
        Args: { p_brand_id?: string }
        Returns: number
      }
      mark_notification_webhook_result: {
        Args: { p_error?: string; p_outbox_id: string; p_success: boolean }
        Returns: undefined
      }
      mark_notifications_read: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      mark_siem_export_result: {
        Args: {
          _destination_id: string
          _error_message?: string
          _events_count: number
          _http_status?: number
          _last_event_at: string
          _latency_ms?: number
          _success: boolean
        }
        Returns: undefined
      }
      mark_thread_read: { Args: { p_thread_id: string }; Returns: undefined }
      mcp_acknowledge_alert: { Args: { p_alert_id: string }; Returns: boolean }
      mcp_active_tokens: {
        Args: never
        Returns: {
          avg_latency_ms: number
          created_at: string
          errors_24h: number
          expires_at: string
          id: string
          kind: string
          last_used_at: string
          name: string
          rate_limit_per_min: number
          requests_24h: number
          scopes: string[]
          user_id: string
        }[]
      }
      mcp_check_rate_limit: {
        Args: { p_token_id: string }
        Returns: {
          allowed: boolean
          max_per_min: number
          used: number
        }[]
      }
      mcp_cleanup_resource_changes: { Args: never; Returns: number }
      mcp_evaluate_slo_alerts: {
        Args: never
        Returns: {
          alert_type: string
          inserted: boolean
        }[]
      }
      mcp_list_resources_for_scopes: {
        Args: { p_scopes: string[] }
        Returns: {
          data_classification: string
          description: string
          name: string
          required_scope: string
          schema_json: Json
          uri_template: string
        }[]
      }
      mcp_list_tools_for_scopes: {
        Args: { p_scopes: string[] }
        Returns: {
          category: Database["public"]["Enums"]["mcp_tool_category"]
          data_classification: string
          description: string
          input_schema_json: Json
          max_timeout_ms: number
          name: string
          rate_limit_per_min: number
          required_scope: string
          requires_approval: boolean
        }[]
      }
      mcp_poll_changes: {
        Args: { p_limit?: number; p_since?: string; p_token_id: string }
        Returns: {
          change_type: string
          occurred_at: string
          resource_type: string
          uri: string
        }[]
      }
      mcp_recent_alerts: {
        Args: { p_limit?: number }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          details: Json
          id: string
          metric_value: number | null
          severity: string
          threshold: number | null
          window_end: string
          window_start: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mcp_slo_alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mcp_server_kpi: { Args: { p_window_hours?: number }; Returns: Json }
      mcp_subscribe_resource: {
        Args: { p_token_id: string; p_uri: string }
        Returns: string
      }
      mcp_toggle_server_kill_switch: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      mcp_unsubscribe_resource: {
        Args: { p_token_id: string; p_uri: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_topic_text: { Args: { p_text: string }; Returns: string }
      notify_high_risk_appointments: { Args: never; Returns: Json }
      override_ai_decision:
        | {
            Args: {
              p_lead_event_id: string
              p_new_lead_type?: string
              p_new_priority?: number
              p_new_should_create_ticket?: boolean
              p_override_reason?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_lead_event_id: string
              p_new_lead_type?: string
              p_new_priority?: number
              p_new_should_create_ticket?: boolean
              p_override_category?: string
              p_override_reason?: string
            }
            Returns: Json
          }
      provincia_to_regione: { Args: { p_sigla: string }; Returns: string }
      reactivate_pipeline_stage: { Args: { p_stage_id: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      rebuild_contact_search_index: { Args: never; Returns: number }
      reclaim_stale_capi_events: { Args: never; Returns: number }
      record_appointment_outcome: {
        Args: {
          p_appointment_id: string
          p_metadata?: Json
          p_next_action?: string
          p_outcome_code: Database["public"]["Enums"]["appointment_outcome_code"]
          p_outcome_notes?: string
          p_reschedule_reason?: string
        }
        Returns: string
      }
      record_audit_anomaly: {
        Args: {
          _actor_user_id?: string
          _anomaly_type: string
          _brand_id: string
          _description?: string
          _details?: Json
          _severity: string
          _title: string
        }
        Returns: string
      }
      record_delivery_result: {
        Args: {
          p_delivery_id: string
          p_duration_ms?: number
          p_error?: string
          p_response_body?: string
          p_response_status?: number
          p_success: boolean
        }
        Returns: Json
      }
      record_slo_snapshot: { Args: never; Returns: number }
      refresh_anomaly_baselines: { Args: never; Returns: Json }
      remove_group_member: {
        Args: { p_target_user_id: string; p_thread_id: string }
        Returns: undefined
      }
      rename_group_thread: {
        Args: { p_new_title: string; p_thread_id: string }
        Returns: undefined
      }
      reorder_pipeline_stages: {
        Args: { p_stage_ids: string[] }
        Returns: undefined
      }
      replay_ingest_dlq: { Args: { p_request_id: string }; Returns: Json }
      replay_outbound_dlq: {
        Args: { p_delivery_id: string; p_override_url?: string }
        Returns: Json
      }
      replay_webhook_dead_letter: {
        Args: { p_outbox_id: string }
        Returns: boolean
      }
      resolve_lead_campaign_attribution: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_lead_event_id: string
          p_source_name?: string
          p_tags?: string[]
        }
        Returns: {
          campaign_id: string
          group_id: string
          match_type: string
        }[]
      }
      revoke_mcp_token: { Args: { p_token_id: string }; Returns: boolean }
      rotate_outbound_webhook_secret: {
        Args: { p_id: string; p_new_secret: string }
        Returns: string
      }
      run_audit_retention: {
        Args: { p_brand_id?: string; p_dry_run?: boolean }
        Returns: Json
      }
      search_appointments: {
        Args: {
          p_brand_id: string
          p_contact_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_sales_user_id?: string
          p_status?: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: Json
      }
      search_audit_events: {
        Args: {
          p_action?: string
          p_actor_user_id?: string
          p_brand_id: string
          p_date_from?: string
          p_date_to?: string
          p_entity_type?: string
          p_limit?: number
          p_offset?: number
          p_search: string
        }
        Returns: {
          action: string
          actor_display_name: string
          actor_type: string
          actor_user_id: string
          brand_id: string
          changed_fields: string[]
          correlation_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          new_value: Json
          occurred_at: string
          old_value: Json
          source: string
          total_count: number
        }[]
      }
      search_contacts: {
        Args: {
          p_brand_id?: string
          p_limit?: number
          p_match_all_tags?: boolean
          p_offset?: number
          p_query?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      search_deals: {
        Args: {
          p_brand_id: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_match_all_tags?: boolean
          p_offset?: number
          p_stage_ids?: string[]
          p_status?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      search_lead_events: {
        Args: {
          p_brand_id: string
          p_clinical_topic_ids?: string[]
          p_date_from?: string
          p_date_to?: string
          p_include_archived?: boolean
          p_limit?: number
          p_match_all_tags?: boolean
          p_match_all_topics?: boolean
          p_offset?: number
          p_priority_max?: number
          p_priority_min?: number
          p_source?: string
          p_source_name?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      search_tickets_v1: {
        Args: {
          p_assignment_type?: string
          p_brand_id: string
          p_current_user_id?: string
          p_limit?: number
          p_offset?: number
          p_queue_tab?: string
          p_search_query?: string
          p_sla_thresholds?: Json
          p_statuses?: string[]
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      search_tickets_v2:
        | {
            Args: {
              p_assignment_type?: string
              p_brand_id?: string
              p_brand_ids?: string[]
              p_current_user_id?: string
              p_cursor?: Json
              p_direction?: string
              p_limit?: number
              p_queue_tab?: string
              p_search_query?: string
              p_sla_thresholds?: string
              p_statuses?: string[]
              p_tag_ids?: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              p_assignment_type?: string
              p_brand_id: string
              p_current_user_id?: string
              p_cursor?: Json
              p_direction?: string
              p_limit?: number
              p_queue_tab?: string
              p_search_query?: string
              p_sla_thresholds?: Json
              p_statuses?: string[]
              p_tag_ids?: string[]
            }
            Returns: Json
          }
      send_chat_message: {
        Args: {
          p_attachments?: Json
          p_message_text: string
          p_thread_id: string
        }
        Returns: string
      }
      set_appointment_status: {
        Args: {
          p_appointment_id: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: undefined
      }
      set_audit_context: {
        Args: {
          p_actor_display_name?: string
          p_actor_type?: string
          p_actor_user_id?: string
          p_correlation_id?: string
          p_reason?: string
          p_source?: string
        }
        Returns: undefined
      }
      set_lead_event_archived: {
        Args: { p_archived: boolean; p_event_id: string }
        Returns: undefined
      }
      set_lead_event_clinical_topics: {
        Args: { p_event_id: string; p_topic_ids: string[] }
        Returns: undefined
      }
      severity_meets_threshold: {
        Args: { _severity: string; _threshold: string }
        Returns: boolean
      }
      simulate_ticket_escalation_policy: {
        Args: {
          p_brand_id: string
          p_from_days?: number
          p_level_1_minutes: number
          p_level_2_minutes: number
          p_level_3_minutes: number
        }
        Returns: Json
      }
      test_webhook: { Args: { p_webhook_id: string }; Returns: string }
      update_appointment: {
        Args: {
          p_address?: string
          p_appointment_id: string
          p_cap?: string
          p_city?: string
          p_duration_minutes?: number
          p_notes?: string
          p_scheduled_at?: string
        }
        Returns: undefined
      }
      update_capi_event_status: {
        Args: {
          p_error?: string
          p_event_id: string
          p_status: Database["public"]["Enums"]["meta_capi_status"]
        }
        Returns: undefined
      }
      update_contact_search_index: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      update_lead_event_qualification: {
        Args: {
          p_ai_conversation_summary?: string
          p_booking_notes?: string
          p_contact_channel?: Database["public"]["Enums"]["contact_channel"]
          p_customer_sentiment?: Database["public"]["Enums"]["customer_sentiment"]
          p_decision_status?: Database["public"]["Enums"]["decision_status"]
          p_event_id: string
          p_lead_source_channel?: Database["public"]["Enums"]["lead_source_channel"]
          p_logistics_notes?: string
          p_objection_type?: Database["public"]["Enums"]["objection_type"]
          p_pacemaker_status?: Database["public"]["Enums"]["pacemaker_status"]
        }
        Returns: undefined
      }
      update_meta_lead_event_status: {
        Args: {
          p_contact_id?: string
          p_error?: string
          p_event_id: string
          p_fetched_payload?: Json
          p_lead_event_id?: string
          p_status: Database["public"]["Enums"]["meta_lead_status"]
        }
        Returns: undefined
      }
      update_outbound_webhook:
        | {
            Args: {
              p_event_types?: string[]
              p_id: string
              p_is_active?: boolean
              p_name?: string
              p_url?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_custom_url_params?: Json
              p_event_types?: string[]
              p_id: string
              p_is_active?: boolean
              p_name?: string
              p_payload_format?: string
              p_payload_mapping?: Json
              p_url?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_custom_url_params?: Json
              p_event_types?: Database["public"]["Enums"]["webhook_event_type"][]
              p_id: string
              p_is_active?: boolean
              p_name?: string
              p_payload_format?: string
              p_payload_mapping?: Json
              p_url?: string
            }
            Returns: boolean
          }
      update_pipeline_stage: {
        Args: {
          p_color?: string
          p_description?: string
          p_name?: string
          p_stage_id: string
        }
        Returns: undefined
      }
      update_team_member: {
        Args: {
          p_is_active?: boolean
          p_membership_id: string
          p_new_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      upsert_audit_retention_policy: {
        Args: {
          p_archive_enabled: boolean
          p_brand_id: string
          p_retention_months: number
        }
        Returns: {
          archive_enabled: boolean
          brand_id: string
          created_at: string
          id: string
          last_archived_count: number | null
          last_purge_at: string | null
          last_purged_count: number | null
          retention_months: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "audit_retention_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_backup_schedule: {
        Args: {
          p_brand_id: string
          p_day_of_week: number
          p_enabled: boolean
          p_frequency: string
          p_hour_utc: number
          p_retention_days: number
          p_scope: string
        }
        Returns: string
      }
      upsert_clinical_topics_from_strings: {
        Args: {
          p_brand_id: string
          p_created_by?: Database["public"]["Enums"]["topic_created_by"]
          p_strings: string[]
        }
        Returns: string[]
      }
      upsert_contact_field_values: {
        Args: { p_brand_id: string; p_contact_id: string; p_values: Json }
        Returns: Json
      }
      upsert_contact_field_values_by_key: {
        Args: { p_brand_id: string; p_contact_id: string; p_field_values: Json }
        Returns: Json
      }
      upsert_notification_preference: {
        Args: {
          p_brand_id: string
          p_enabled: boolean
          p_notification_type: string
        }
        Returns: Json
      }
      user_belongs_to_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_brand: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_access_page: {
        Args: {
          p_brand_id: string
          p_page: Database["public"]["Enums"]["app_page"]
          p_user_id: string
        }
        Returns: boolean
      }
      validate_mcp_token: {
        Args: { p_raw_token: string }
        Returns: {
          brand_id: string
          kind: string
          scopes: string[]
          token_id: string
          user_id: string
        }[]
      }
      webhook_metrics_24h: { Args: { p_brand_id: string }; Returns: Json }
      webhook_timeseries_24h: {
        Args: { p_brand_id: string; p_bucket_minutes?: number }
        Returns: Json
      }
      webhook_top_errors_24h: {
        Args: { p_brand_id: string; p_limit?: number }
        Returns: Json
      }
      webhook_top_event_types_24h: {
        Args: { p_brand_id: string; p_limit?: number }
        Returns: Json
      }
      webhook_top_webhooks_24h: {
        Args: { p_brand_id: string; p_limit?: number }
        Returns: Json
      }
      write_audit_event: {
        Args: {
          p_action: string
          p_brand_id: string
          p_changed_fields?: string[]
          p_entity_id: string
          p_entity_type: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_new_value?: Json
          p_old_value?: Json
        }
        Returns: string
      }
    }
    Enums: {
      ad_platform: "meta" | "google"
      ad_platform_type: "meta" | "google" | "tiktok" | "linkedin" | "other"
      ai_mode: "off" | "suggest" | "auto_apply"
      app_page:
        | "dashboard"
        | "contacts"
        | "pipeline"
        | "appointments"
        | "tickets"
        | "sales"
        | "events"
        | "chat"
        | "notifications"
        | "marketing_dashboard"
        | "marketing_campaigns"
        | "marketing_costs"
        | "marketing_reports"
        | "company_overview"
        | "company_expenses"
        | "company_budget"
        | "company_reports"
        | "team"
        | "products"
        | "salesperson_kpi"
        | "ceo_dashboard"
        | "admin_analytics"
        | "admin_ai"
        | "admin_ai_metrics"
        | "admin_callcenter_kpi"
        | "admin_ticket_trend"
        | "admin_webhooks"
        | "admin_dlq"
        | "settings"
      app_role:
        | "admin"
        | "ceo"
        | "callcenter"
        | "sales"
        | "responsabile_venditori"
        | "responsabile_callcenter"
        | "operatore_callcenter"
        | "venditore"
        | "amministrazione"
      appointment_outcome_code:
        | "executed"
        | "no_show_client"
        | "no_show_operator"
        | "cancelled_client"
        | "cancelled_operator"
        | "rescheduled"
        | "unreachable"
        | "other"
      appointment_status:
        | "draft"
        | "scheduled"
        | "confirmed"
        | "cancelled"
        | "rescheduled"
        | "visited"
        | "completed"
        | "no_show"
      appointment_type: "primo_appuntamento" | "follow_up" | "visita_tecnica"
      assigned_by: "ai" | "user" | "rule"
      call_action_decision_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "edited_then_approved"
      call_action_execution_status:
        | "pending"
        | "running"
        | "success"
        | "failed"
        | "skipped"
      call_action_type:
        | "update_contact"
        | "update_kanban_stage"
        | "create_or_update_ticket"
        | "create_or_update_appointment"
        | "create_lead_event"
        | "update_deal"
        | "add_action_suggestion"
        | "update_call_log"
      chat_sender_type: "user" | "ai" | "system"
      chat_thread_type: "direct" | "group" | "entity" | "executive"
      commission_status: "pending" | "approved" | "paid"
      contact_channel: "chat" | "call"
      contact_status:
        | "new"
        | "active"
        | "qualified"
        | "unqualified"
        | "archived"
      custom_field_scope: "global" | "brand"
      custom_field_type:
        | "text"
        | "number"
        | "date"
        | "bool"
        | "select"
        | "multiselect"
        | "email"
        | "phone"
        | "url"
        | "textarea"
      customer_sentiment: "positivo" | "neutro" | "negativo"
      deal_status: "open" | "won" | "lost" | "closed" | "reopened_for_support"
      decision_status: "pronto" | "indeciso" | "non_interessato"
      dlq_reason:
        | "invalid_json"
        | "mapping_error"
        | "missing_required"
        | "signature_failed"
        | "rate_limited"
        | "ai_extraction_failed"
        | "contact_creation_failed"
        | "unknown_error"
      heat_class: "freddo" | "tiepido" | "caldo"
      household_person_role: "requester" | "beneficiary" | "other"
      ingest_status: "pending" | "success" | "rejected" | "failed"
      lead_source_channel: "tv" | "online" | "other"
      lead_source_type: "webhook" | "manual" | "import" | "api" | "meta"
      lead_type: "trial" | "info" | "support" | "generic"
      marketing_campaign_status: "planned" | "active" | "paused" | "closed"
      mcp_actor_type: "agent" | "user" | "system" | "cron"
      mcp_approval_decision: "approved" | "rejected" | "expired"
      mcp_execution_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "running"
        | "success"
        | "failed"
        | "failed_transient"
        | "cancelled"
        | "timeout"
      mcp_policy_action: "allow" | "deny" | "require_approval"
      mcp_server_status: "active" | "disabled" | "degraded" | "maintenance"
      mcp_tool_category: "read" | "write" | "sensitive_write"
      mcp_transport: "stdio" | "streamable_http" | "sse"
      meta_capi_status: "pending" | "processing" | "sent" | "failed" | "skipped"
      meta_lead_status:
        | "received"
        | "fetched"
        | "ingested"
        | "duplicate"
        | "error"
      module_status: "active" | "maintain" | "evaluate" | "frozen" | "sunset"
      notification_type:
        | "lead_event_created"
        | "pipeline_stage_changed"
        | "ticket_created"
        | "ticket_assigned"
        | "ticket_status_changed"
        | "appointment_created"
        | "appointment_updated"
        | "appointment_reminder"
        | "tag_updated"
        | "ai_decision_ready"
        | "chat_message"
        | "appointment_risk_alert"
        | "slo_alert"
        | "ticket_escalated"
        | "payment_overdue"
      objection_type: "prezzo" | "tempo" | "fiducia" | "altro"
      override_reason_category:
        | "wrong_priority"
        | "wrong_lead_type"
        | "wrong_ticket_decision"
        | "wrong_tags"
        | "wrong_stage"
        | "false_positive"
        | "false_negative"
        | "other"
      pacemaker_status: "assente" | "presente" | "non_chiaro"
      payment_method: "cash" | "card" | "bank_transfer" | "stripe" | "other"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      sales_order_status:
        | "draft"
        | "confirmed"
        | "invoiced"
        | "partially_paid"
        | "paid"
        | "cancelled"
        | "refunded"
      sales_time_off_type:
        | "vacation"
        | "sick"
        | "personal"
        | "training"
        | "other"
      table_view_scope: "single_brand" | "all_accessible"
      tag_scope:
        | "contact"
        | "event"
        | "deal"
        | "appointment"
        | "ticket"
        | "mixed"
      ticket_audit_action:
        | "created"
        | "status_change"
        | "assignment_change"
        | "priority_change"
        | "category_change"
        | "comment_added"
        | "sla_breach"
        | "sla_escalation"
      ticket_creator: "ai" | "user" | "rule"
      ticket_status: "open" | "in_progress" | "resolved" | "closed" | "reopened"
      topic_created_by: "ai" | "user"
      webhook_delivery_status:
        | "pending"
        | "sending"
        | "success"
        | "failed"
        | "dead"
      webhook_event_type:
        | "ticket.created"
        | "ticket.updated"
        | "ticket.assigned"
        | "ticket.status_changed"
        | "ticket.priority_changed"
        | "ticket.sla_breached"
        | "ticket.resolved"
        | "ticket.closed"
        | "contact.created"
        | "contact.updated"
        | "deal.created"
        | "deal.stage_changed"
        | "deal.closed"
        | "webhook.test"
        | "lead_event.created"
        | "pipeline.stage_changed"
        | "tags.updated"
        | "appointment.created"
        | "appointment.updated"
        | "sale.recorded"
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
      ad_platform: ["meta", "google"],
      ad_platform_type: ["meta", "google", "tiktok", "linkedin", "other"],
      ai_mode: ["off", "suggest", "auto_apply"],
      app_page: [
        "dashboard",
        "contacts",
        "pipeline",
        "appointments",
        "tickets",
        "sales",
        "events",
        "chat",
        "notifications",
        "marketing_dashboard",
        "marketing_campaigns",
        "marketing_costs",
        "marketing_reports",
        "company_overview",
        "company_expenses",
        "company_budget",
        "company_reports",
        "team",
        "products",
        "salesperson_kpi",
        "ceo_dashboard",
        "admin_analytics",
        "admin_ai",
        "admin_ai_metrics",
        "admin_callcenter_kpi",
        "admin_ticket_trend",
        "admin_webhooks",
        "admin_dlq",
        "settings",
      ],
      app_role: [
        "admin",
        "ceo",
        "callcenter",
        "sales",
        "responsabile_venditori",
        "responsabile_callcenter",
        "operatore_callcenter",
        "venditore",
        "amministrazione",
      ],
      appointment_outcome_code: [
        "executed",
        "no_show_client",
        "no_show_operator",
        "cancelled_client",
        "cancelled_operator",
        "rescheduled",
        "unreachable",
        "other",
      ],
      appointment_status: [
        "draft",
        "scheduled",
        "confirmed",
        "cancelled",
        "rescheduled",
        "visited",
        "completed",
        "no_show",
      ],
      appointment_type: ["primo_appuntamento", "follow_up", "visita_tecnica"],
      assigned_by: ["ai", "user", "rule"],
      call_action_decision_status: [
        "pending_approval",
        "approved",
        "rejected",
        "edited_then_approved",
      ],
      call_action_execution_status: [
        "pending",
        "running",
        "success",
        "failed",
        "skipped",
      ],
      call_action_type: [
        "update_contact",
        "update_kanban_stage",
        "create_or_update_ticket",
        "create_or_update_appointment",
        "create_lead_event",
        "update_deal",
        "add_action_suggestion",
        "update_call_log",
      ],
      chat_sender_type: ["user", "ai", "system"],
      chat_thread_type: ["direct", "group", "entity", "executive"],
      commission_status: ["pending", "approved", "paid"],
      contact_channel: ["chat", "call"],
      contact_status: ["new", "active", "qualified", "unqualified", "archived"],
      custom_field_scope: ["global", "brand"],
      custom_field_type: [
        "text",
        "number",
        "date",
        "bool",
        "select",
        "multiselect",
        "email",
        "phone",
        "url",
        "textarea",
      ],
      customer_sentiment: ["positivo", "neutro", "negativo"],
      deal_status: ["open", "won", "lost", "closed", "reopened_for_support"],
      decision_status: ["pronto", "indeciso", "non_interessato"],
      dlq_reason: [
        "invalid_json",
        "mapping_error",
        "missing_required",
        "signature_failed",
        "rate_limited",
        "ai_extraction_failed",
        "contact_creation_failed",
        "unknown_error",
      ],
      heat_class: ["freddo", "tiepido", "caldo"],
      household_person_role: ["requester", "beneficiary", "other"],
      ingest_status: ["pending", "success", "rejected", "failed"],
      lead_source_channel: ["tv", "online", "other"],
      lead_source_type: ["webhook", "manual", "import", "api", "meta"],
      lead_type: ["trial", "info", "support", "generic"],
      marketing_campaign_status: ["planned", "active", "paused", "closed"],
      mcp_actor_type: ["agent", "user", "system", "cron"],
      mcp_approval_decision: ["approved", "rejected", "expired"],
      mcp_execution_status: [
        "pending_approval",
        "approved",
        "rejected",
        "running",
        "success",
        "failed",
        "failed_transient",
        "cancelled",
        "timeout",
      ],
      mcp_policy_action: ["allow", "deny", "require_approval"],
      mcp_server_status: ["active", "disabled", "degraded", "maintenance"],
      mcp_tool_category: ["read", "write", "sensitive_write"],
      mcp_transport: ["stdio", "streamable_http", "sse"],
      meta_capi_status: ["pending", "processing", "sent", "failed", "skipped"],
      meta_lead_status: [
        "received",
        "fetched",
        "ingested",
        "duplicate",
        "error",
      ],
      module_status: ["active", "maintain", "evaluate", "frozen", "sunset"],
      notification_type: [
        "lead_event_created",
        "pipeline_stage_changed",
        "ticket_created",
        "ticket_assigned",
        "ticket_status_changed",
        "appointment_created",
        "appointment_updated",
        "appointment_reminder",
        "tag_updated",
        "ai_decision_ready",
        "chat_message",
        "appointment_risk_alert",
        "slo_alert",
        "ticket_escalated",
        "payment_overdue",
      ],
      objection_type: ["prezzo", "tempo", "fiducia", "altro"],
      override_reason_category: [
        "wrong_priority",
        "wrong_lead_type",
        "wrong_ticket_decision",
        "wrong_tags",
        "wrong_stage",
        "false_positive",
        "false_negative",
        "other",
      ],
      pacemaker_status: ["assente", "presente", "non_chiaro"],
      payment_method: ["cash", "card", "bank_transfer", "stripe", "other"],
      payment_status: ["pending", "completed", "failed", "refunded"],
      sales_order_status: [
        "draft",
        "confirmed",
        "invoiced",
        "partially_paid",
        "paid",
        "cancelled",
        "refunded",
      ],
      sales_time_off_type: [
        "vacation",
        "sick",
        "personal",
        "training",
        "other",
      ],
      table_view_scope: ["single_brand", "all_accessible"],
      tag_scope: ["contact", "event", "deal", "appointment", "ticket", "mixed"],
      ticket_audit_action: [
        "created",
        "status_change",
        "assignment_change",
        "priority_change",
        "category_change",
        "comment_added",
        "sla_breach",
        "sla_escalation",
      ],
      ticket_creator: ["ai", "user", "rule"],
      ticket_status: ["open", "in_progress", "resolved", "closed", "reopened"],
      topic_created_by: ["ai", "user"],
      webhook_delivery_status: [
        "pending",
        "sending",
        "success",
        "failed",
        "dead",
      ],
      webhook_event_type: [
        "ticket.created",
        "ticket.updated",
        "ticket.assigned",
        "ticket.status_changed",
        "ticket.priority_changed",
        "ticket.sla_breached",
        "ticket.resolved",
        "ticket.closed",
        "contact.created",
        "contact.updated",
        "deal.created",
        "deal.stage_changed",
        "deal.closed",
        "webhook.test",
        "lead_event.created",
        "pipeline.stage_changed",
        "tags.updated",
        "appointment.created",
        "appointment.updated",
        "sale.recorded",
      ],
    },
  },
} as const
