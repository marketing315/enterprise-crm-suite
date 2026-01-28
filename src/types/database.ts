// CRM Enterprise Multi-Brand - TypeScript Types

export type AppRole = 'admin' | 'ceo' | 'callcenter' | 'sales';

export type ContactStatus = 'new' | 'active' | 'qualified' | 'unqualified' | 'archived';

export type LeadSourceType = 'webhook' | 'manual' | 'import' | 'api';

export type DealStatus = 'open' | 'won' | 'lost' | 'closed' | 'reopened_for_support';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'rescheduled' | 'visited' | 'no_show';

export type SaleOutcome = 'sold' | 'not_sold';

export type TagScope = 'contact' | 'event' | 'deal' | 'appointment' | 'ticket' | 'mixed';

export type AssignedBy = 'ai' | 'user' | 'rule';

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'dead';

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

// Core entities
export interface Brand {
  id: string;
  name: string;
  slug: string;
  auto_assign_enabled: boolean;
  sla_thresholds_minutes: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  supabase_auth_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  brand_id: string;
  role: AppRole;
  created_at: string;
}

export interface UserWithRoles extends User {
  user_roles: UserRole[];
}

// Contacts
export interface Contact {
  id: string;
  brand_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  cap: string | null;
  status: ContactStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactPhone {
  id: string;
  brand_id: string;
  contact_id: string;
  phone_raw: string;
  phone_normalized: string;
  country_code: string;
  assumed_country: boolean;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LeadEvent {
  id: string;
  brand_id: string;
  contact_id: string | null;
  deal_id: string | null;
  source: LeadSourceType;
  source_name: string | null;
  raw_payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
  ai_priority: number | null;
  ai_model_version: string | null;
  ai_prompt_version: string | null;
  archived: boolean;
  created_at: string;
}

export interface WebhookSource {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  api_key_hash: string;
  mapping: Record<string, string>;
  rate_limit_per_min: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Extended types with relations
export interface ContactWithPhones extends Contact {
  contact_phones: ContactPhone[];
}

export interface ContactWithEvents extends ContactWithPhones {
  lead_events: LeadEvent[];
}

// Deals
export interface Deal {
  id: string;
  brand_id: string;
  contact_id: string;
  current_stage_id: string | null;
  status: DealStatus;
  value: number | null;
  notes: string | null;
  assigned_user_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface PipelineStage {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  order_index: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DealStageHistory {
  id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

// Deal with contact info for Kanban
export interface DealWithContact extends Deal {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

// Appointments
export interface Appointment {
  id: string;
  brand_id: string;
  contact_id: string;
  deal_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  address: string | null;
  city: string | null;
  cap: string | null;
  notes: string | null;
  status: AppointmentStatus;
  assigned_sales_user_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentWithRelations extends Appointment {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    primary_phone: string | null;
  };
  sales_user: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}
