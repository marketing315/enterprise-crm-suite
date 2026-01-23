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
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
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
          ai_model_version: string | null
          ai_priority: number | null
          ai_prompt_version: string | null
          archived: boolean
          brand_id: string
          contact_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          occurred_at: string
          raw_payload: Json
          received_at: string
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name: string | null
        }
        Insert: {
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_prompt_version?: string | null
          archived?: boolean
          brand_id: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          occurred_at?: string
          raw_payload?: Json
          received_at?: string
          source: Database["public"]["Enums"]["lead_source_type"]
          source_name?: string | null
        }
        Update: {
          ai_model_version?: string | null
          ai_priority?: number | null
          ai_prompt_version?: string | null
          archived?: boolean
          brand_id?: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          occurred_at?: string
          raw_payload?: Json
          received_at?: string
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
      check_phone_duplicate: {
        Args: { p_brand_id: string; p_phone_normalized: string }
        Returns: {
          contact_id: string
          email: string
          first_name: string
          last_name: string
        }[]
      }
      consume_rate_limit_token: {
        Args: { p_source_id: string }
        Returns: boolean
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
      get_user_brand_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_id: { Args: { _auth_uid: string }; Returns: string }
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
      user_belongs_to_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "ceo" | "callcenter" | "sales"
      contact_status:
        | "new"
        | "active"
        | "qualified"
        | "unqualified"
        | "archived"
      deal_status: "open" | "won" | "lost" | "closed" | "reopened_for_support"
      lead_source_type: "webhook" | "manual" | "import" | "api"
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
      contact_status: ["new", "active", "qualified", "unqualified", "archived"],
      deal_status: ["open", "won", "lost", "closed", "reopened_for_support"],
      lead_source_type: ["webhook", "manual", "import", "api"],
    },
  },
} as const
