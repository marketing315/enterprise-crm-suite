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
      brands: {
        Row: {
          auto_assign_enabled: boolean
          created_at: string
          id: string
          name: string
          sla_thresholds_minutes: Json
          slug: string
          updated_at: string
        }
        Insert: {
          auto_assign_enabled?: boolean
          created_at?: string
          id?: string
          name: string
          sla_thresholds_minutes?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          auto_assign_enabled?: boolean
          created_at?: string
          id?: string
          name?: string
          sla_thresholds_minutes?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
      contacts: {
        Row: {
          brand_id: string
          cap: string | null
          city: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          status: Database["public"]["Enums"]["contact_status"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          cap?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cap?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
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
      deals: {
        Row: {
          brand_id: string
          closed_at: string | null
          contact_id: string
          created_at: string
          current_stage_id: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
          value: number | null
        }
        Insert: {
          brand_id: string
          closed_at?: string | null
          contact_id: string
          created_at?: string
          current_stage_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          brand_id?: string
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          current_stage_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          value?: number | null
        }
        Relationships: [
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
        ]
      }
      incoming_requests: {
        Row: {
          brand_id: string
          created_at: string
          error_message: string | null
          headers: Json | null
          id: string
          ip_address: string | null
          lead_event_id: string | null
          processed: boolean
          raw_body: Json
          source_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          error_message?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          lead_event_id?: string | null
          processed?: boolean
          raw_body: Json
          source_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          error_message?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          lead_event_id?: string | null
          processed?: boolean
          raw_body?: Json
          source_id?: string | null
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
        ]
      }
      lead_events: {
        Row: {
          ai_confidence: number | null
          ai_model_version: string | null
          ai_priority: number | null
          ai_processed: boolean
          ai_processed_at: string | null
          ai_prompt_version: string | null
          ai_rationale: string | null
          archived: boolean
          brand_id: string
          contact_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          lead_type: Database["public"]["Enums"]["lead_type"] | null
          occurred_at: string
          raw_payload: Json
          received_at: string
          should_create_ticket: boolean | null
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_processed?: boolean
          ai_processed_at?: string | null
          ai_prompt_version?: string | null
          ai_rationale?: string | null
          archived?: boolean
          brand_id: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          occurred_at?: string
          raw_payload?: Json
          received_at?: string
          should_create_ticket?: boolean | null
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_processed?: boolean
          ai_processed_at?: string | null
          ai_prompt_version?: string | null
          ai_rationale?: string | null
          archived?: boolean
          brand_id?: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          lead_type?: Database["public"]["Enums"]["lead_type"] | null
          occurred_at?: string
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
        ]
      }
      outbound_webhook_deliveries: {
        Row: {
          attempt_count: number
          brand_id: string
          created_at: string
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
        ]
      }
      outbound_webhooks: {
        Row: {
          brand_id: string
          created_at: string
          event_types: Database["public"]["Enums"]["webhook_event_type"][]
          id: string
          is_active: boolean
          name: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          event_types?: Database["public"]["Enums"]["webhook_event_type"][]
          id?: string
          is_active?: boolean
          name: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          event_types?: Database["public"]["Enums"]["webhook_event_type"][]
          id?: string
          is_active?: boolean
          name?: string
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
      pipeline_stages: {
        Row: {
          brand_id: string
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
          brand_id: string
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
          brand_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      sheets_export_logs: {
        Row: {
          brand_id: string
          created_at: string
          error: string | null
          id: string
          lead_event_id: string
          status: string
          tab_name: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          error?: string | null
          id?: string
          lead_event_id: string
          status: string
          tab_name?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          error?: string | null
          id?: string
          lead_event_id?: string
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
            isOneToOne: false
            referencedRelation: "lead_events"
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
          id: string
          opened_at: string
          priority: number
          resolved_at: string | null
          sla_breached_at: string | null
          source_event_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at: string
        }
        Insert: {
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
          id?: string
          opened_at?: string
          priority?: number
          resolved_at?: string | null
          sla_breached_at?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at?: string
        }
        Update: {
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
          id?: string
          opened_at?: string
          priority?: number
          resolved_at?: string | null
          sla_breached_at?: string | null
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "tickets_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
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
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          supabase_auth_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          supabase_auth_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_sources: {
        Row: {
          api_key_hash: string
          brand_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          mapping: Json | null
          name: string
          rate_limit_per_min: number
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          brand_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name: string
          rate_limit_per_min?: number
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          brand_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name?: string
          rate_limit_per_min?: number
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_ai_fallback: {
        Args: { p_lead_event_id: string }
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
      check_all_brands_sla_breaches: { Args: never; Returns: Json }
      check_and_mark_sla_breaches: {
        Args: { p_brand_id: string }
        Returns: number
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
      claim_webhook_deliveries: {
        Args: { p_batch_size?: number }
        Returns: {
          attempt_count: number
          brand_id: string
          created_at: string
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
      cleanup_outbound_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: number
      }
      consume_rate_limit_token: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      create_outbound_webhook: {
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
      delete_outbound_webhook: { Args: { p_id: string }; Returns: boolean }
      enqueue_webhook_delivery: {
        Args: {
          p_brand_id: string
          p_event_id: string
          p_event_type: Database["public"]["Enums"]["webhook_event_type"]
          p_payload: Json
        }
        Returns: number
      }
      find_or_create_contact: {
        Args: {
          p_assumed_country: boolean
          p_brand_id: string
          p_cap?: string
          p_city?: string
          p_country_code: string
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_phone_normalized: string
          p_phone_raw: string
        }
        Returns: string
      }
      find_or_create_deal: {
        Args: { p_brand_id: string; p_contact_id: string }
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
      get_ai_metrics_errors: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_metrics_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
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
      get_callcenter_kpis_by_operator: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_callcenter_kpis_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
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
      get_ticket_queue_counts: {
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
      get_user_brand_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_id: { Args: { _auth_uid: string }; Returns: string }
      get_webhook_delivery: { Args: { p_delivery_id: string }; Returns: Json }
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
      list_outbound_webhooks: {
        Args: { p_brand_id: string }
        Returns: {
          created_at: string
          event_types: Database["public"]["Enums"]["webhook_event_type"][]
          id: string
          is_active: boolean
          name: string
          updated_at: string
          url: string
        }[]
      }
      list_webhook_deliveries: {
        Args: {
          p_brand_id: string
          p_event_type?: string
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["webhook_delivery_status"]
          p_webhook_id?: string
        }
        Returns: Json
      }
      record_delivery_result:
        | {
            Args: {
              p_delivery_id: string
              p_error?: string
              p_response_body?: string
              p_response_status?: number
              p_success: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_delivery_id: string
              p_duration_ms?: number
              p_error?: string
              p_response_body?: string
              p_response_status?: number
              p_success: boolean
            }
            Returns: undefined
          }
      rotate_outbound_webhook_secret: {
        Args: { p_id: string; p_new_secret: string }
        Returns: string
      }
      search_contacts: {
        Args: {
          p_brand_id: string
          p_limit?: number
          p_offset?: number
          p_query: string
          p_status?: Database["public"]["Enums"]["contact_status"]
        }
        Returns: {
          cap: string
          city: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          match_type: string
          notes: string
          primary_phone: string
          status: Database["public"]["Enums"]["contact_status"]
          updated_at: string
        }[]
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
      search_tickets_v2: {
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
      test_webhook: { Args: { p_webhook_id: string }; Returns: string }
      update_outbound_webhook: {
        Args: {
          p_event_types?: string[]
          p_id: string
          p_is_active?: boolean
          p_name?: string
          p_url?: string
        }
        Returns: boolean
      }
      user_belongs_to_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
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
    }
    Enums: {
      app_role: "admin" | "ceo" | "callcenter" | "sales"
      assigned_by: "ai" | "user" | "rule"
      contact_status:
        | "new"
        | "active"
        | "qualified"
        | "unqualified"
        | "archived"
      deal_status: "open" | "won" | "lost" | "closed" | "reopened_for_support"
      lead_source_type: "webhook" | "manual" | "import" | "api"
      lead_type: "trial" | "info" | "support" | "generic"
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
      ticket_creator: "ai" | "user" | "rule"
      ticket_status: "open" | "in_progress" | "resolved" | "closed" | "reopened"
      webhook_delivery_status: "pending" | "sending" | "success" | "failed"
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
      app_role: ["admin", "ceo", "callcenter", "sales"],
      assigned_by: ["ai", "user", "rule"],
      contact_status: ["new", "active", "qualified", "unqualified", "archived"],
      deal_status: ["open", "won", "lost", "closed", "reopened_for_support"],
      lead_source_type: ["webhook", "manual", "import", "api"],
      lead_type: ["trial", "info", "support", "generic"],
      tag_scope: ["contact", "event", "deal", "appointment", "ticket", "mixed"],
      ticket_audit_action: [
        "created",
        "status_change",
        "assignment_change",
        "priority_change",
        "category_change",
        "comment_added",
        "sla_breach",
      ],
      ticket_creator: ["ai", "user", "rule"],
      ticket_status: ["open", "in_progress", "resolved", "closed", "reopened"],
      webhook_delivery_status: ["pending", "sending", "success", "failed"],
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
      ],
    },
  },
} as const
