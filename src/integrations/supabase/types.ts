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
      ai_configs: {
        Row: {
          active_prompt_version: string | null
          brand_id: string
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
          notes: string | null
          parent_appointment_id: string | null
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
          notes?: string | null
          parent_appointment_id?: string | null
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
          notes?: string | null
          parent_appointment_id?: string | null
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
          parent_brand_id: string | null
          sla_thresholds_minutes: Json
          slug: string
          updated_at: string
        }
        Insert: {
          auto_assign_enabled?: boolean
          created_at?: string
          id?: string
          name: string
          parent_brand_id?: string | null
          sla_thresholds_minutes?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          auto_assign_enabled?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_brand_id?: string | null
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
          edited_at: string | null
          id: string
          message_text: string
          sender_type: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id: string | null
          thread_id: string
        }
        Insert: {
          ai_context?: Json | null
          attachments?: Json | null
          brand_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_text: string
          sender_type?: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id?: string | null
          thread_id: string
        }
        Update: {
          ai_context?: Json | null
          attachments?: Json | null
          brand_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_text?: string
          sender_type?: Database["public"]["Enums"]["chat_sender_type"]
          sender_user_id?: string | null
          thread_id?: string
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
        ]
      }
      contacts: {
        Row: {
          address: string | null
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
          address?: string | null
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
          address?: string | null
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
          stage_locked_by_user: boolean
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
          stage_locked_by_user?: boolean
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
          stage_locked_by_user?: boolean
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
          brand_id: string | null
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
        ]
      }
      meta_apps: {
        Row: {
          access_token: string
          app_secret: string
          brand_id: string
          brand_slug: string
          created_at: string
          id: string
          is_active: boolean
          page_id: string | null
          updated_at: string
          verify_token: string
        }
        Insert: {
          access_token: string
          app_secret: string
          brand_id: string
          brand_slug: string
          created_at?: string
          id?: string
          is_active?: boolean
          page_id?: string | null
          updated_at?: string
          verify_token: string
        }
        Update: {
          access_token?: string
          app_secret?: string
          brand_id?: string
          brand_slug?: string
          created_at?: string
          id?: string
          is_active?: boolean
          page_id?: string | null
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
            isOneToOne: true
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
          can_access_children: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          can_access_children?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          can_access_children?: boolean
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
          hmac_enabled: boolean
          hmac_secret: string | null
          hmac_secret_hash: string | null
          id: string
          is_active: boolean
          mapping: Json | null
          name: string
          rate_limit_per_min: number
          replay_window_seconds: number
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          brand_id: string
          created_at?: string
          description?: string | null
          hmac_enabled?: boolean
          hmac_secret?: string | null
          hmac_secret_hash?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name: string
          rate_limit_per_min?: number
          replay_window_seconds?: number
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          brand_id?: string
          created_at?: string
          description?: string | null
          hmac_enabled?: boolean
          hmac_secret?: string | null
          hmac_secret_hash?: string | null
          id?: string
          is_active?: boolean
          mapping?: Json | null
          name?: string
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
      apply_ai_deal_tags: {
        Args: { p_confidence?: number; p_deal_id: string; p_tag_ids: string[] }
        Returns: number
      }
      apply_ai_fallback: {
        Args: { p_lead_event_id: string }
        Returns: undefined
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
      cleanup_outbound_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: number
      }
      complete_ai_tag_job: {
        Args: { p_error?: string; p_job_id: string }
        Returns: undefined
      }
      consume_rate_limit_token: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      correct_contact_phone: {
        Args: { p_contact_id: string; p_new_phone: string; p_old_phone: string }
        Returns: Json
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
      create_pipeline_stage: {
        Args: {
          p_brand_id: string
          p_color?: string
          p_description?: string
          p_name: string
        }
        Returns: string
      }
      deactivate_pipeline_stage: {
        Args: { p_fallback_stage_id: string; p_stage_id: string }
        Returns: Json
      }
      delete_notifications: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      delete_outbound_webhook: { Args: { p_id: string }; Returns: boolean }
      delete_read_notifications: {
        Args: { p_brand_id?: string }
        Returns: number
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
      get_accessible_brand_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_ai_metrics_errors: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_metrics_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_ai_quality_metrics: {
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
      get_callcenter_kpis_by_operator: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_callcenter_kpis_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
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
      get_unread_notification_count: {
        Args: { p_brand_id?: string }
        Returns: number
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
      is_thread_member: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      list_contact_lead_events: {
        Args: { p_contact_id: string; p_include_archived?: boolean }
        Returns: Json
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
      mark_all_notifications_read: {
        Args: { p_brand_id?: string }
        Returns: number
      }
      mark_notifications_read: {
        Args: { p_notification_ids: string[] }
        Returns: number
      }
      normalize_topic_text: { Args: { p_text: string }; Returns: string }
      override_ai_decision: {
        Args: {
          p_lead_event_id: string
          p_new_lead_type?: string
          p_new_priority?: number
          p_new_should_create_ticket?: boolean
          p_override_reason?: string
        }
        Returns: Json
      }
      rebuild_contact_search_index: { Args: never; Returns: number }
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
      reorder_pipeline_stages: {
        Args: { p_stage_ids: string[] }
        Returns: undefined
      }
      replay_ingest_dlq: { Args: { p_request_id: string }; Returns: Json }
      replay_outbound_dlq: {
        Args: { p_delivery_id: string; p_override_url?: string }
        Returns: Json
      }
      rotate_outbound_webhook_secret: {
        Args: { p_id: string; p_new_secret: string }
        Returns: string
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
      set_lead_event_archived: {
        Args: { p_archived: boolean; p_event_id: string }
        Returns: undefined
      }
      set_lead_event_clinical_topics: {
        Args: { p_event_id: string; p_topic_ids: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
      update_pipeline_stage: {
        Args: {
          p_color?: string
          p_description?: string
          p_name?: string
          p_stage_id: string
        }
        Returns: undefined
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
      ai_mode: "off" | "suggest" | "auto_apply"
      app_role: "admin" | "ceo" | "callcenter" | "sales"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "cancelled"
        | "rescheduled"
        | "visited"
        | "no_show"
      appointment_type: "primo_appuntamento" | "follow_up" | "visita_tecnica"
      assigned_by: "ai" | "user" | "rule"
      chat_sender_type: "user" | "ai" | "system"
      chat_thread_type: "direct" | "group" | "entity"
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
      ingest_status: "pending" | "success" | "rejected" | "failed"
      lead_source_channel: "tv" | "online" | "other"
      lead_source_type: "webhook" | "manual" | "import" | "api"
      lead_type: "trial" | "info" | "support" | "generic"
      meta_lead_status:
        | "received"
        | "fetched"
        | "ingested"
        | "duplicate"
        | "error"
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
      objection_type: "prezzo" | "tempo" | "fiducia" | "altro"
      pacemaker_status: "assente" | "presente" | "non_chiaro"
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
      ai_mode: ["off", "suggest", "auto_apply"],
      app_role: ["admin", "ceo", "callcenter", "sales"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "cancelled",
        "rescheduled",
        "visited",
        "no_show",
      ],
      appointment_type: ["primo_appuntamento", "follow_up", "visita_tecnica"],
      assigned_by: ["ai", "user", "rule"],
      chat_sender_type: ["user", "ai", "system"],
      chat_thread_type: ["direct", "group", "entity"],
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
      ingest_status: ["pending", "success", "rejected", "failed"],
      lead_source_channel: ["tv", "online", "other"],
      lead_source_type: ["webhook", "manual", "import", "api"],
      lead_type: ["trial", "info", "support", "generic"],
      meta_lead_status: [
        "received",
        "fetched",
        "ingested",
        "duplicate",
        "error",
      ],
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
      ],
      objection_type: ["prezzo", "tempo", "fiducia", "altro"],
      pacemaker_status: ["assente", "presente", "non_chiaro"],
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
