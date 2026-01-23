// CRM Enterprise Multi-Brand - TypeScript Types

export type AppRole = 'admin' | 'ceo' | 'callcenter' | 'sales';

export type ContactStatus = 'active' | 'archived_optout';

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
