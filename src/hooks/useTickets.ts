import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed" | "reopened";

export interface Ticket {
  id: string;
  brand_id: string;
  contact_id: string;
  deal_id: string | null;
  status: TicketStatus;
  priority: number;
  title: string;
  description: string | null;
  category_tag_id: string | null;
  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  assigned_at: string | null;
  created_by: "ai" | "user" | "rule";
  source_event_id: string | null;
  opened_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketWithRelations extends Ticket {
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  tags: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  users: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  lead_event_id: string | null;
  note: string | null;
  created_at: string;
  lead_events: {
    id: string;
    raw_payload: Record<string, unknown>;
    source_name: string | null;
    occurred_at: string;
  } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  users: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export function useTickets(status?: TicketStatus) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["tickets", currentBrand?.id, status],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      let query = supabase
        .from("tickets")
        .select(`
          *,
          contacts:contact_id (id, first_name, last_name, email),
          tags:category_tag_id (id, name, color),
          users:assigned_to_user_id (id, full_name, email)
        `)
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as TicketWithRelations[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useTicket(ticketId: string | null) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      if (!ticketId || !currentBrand?.id) return null;

      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          contacts:contact_id (id, first_name, last_name, email),
          tags:category_tag_id (id, name, color),
          users:assigned_to_user_id (id, full_name, email)
        `)
        .eq("id", ticketId)
        .eq("brand_id", currentBrand.id)
        .single();

      if (error) throw error;
      return data as unknown as TicketWithRelations;
    },
    enabled: !!ticketId && !!currentBrand?.id,
  });
}

export function useTicketEvents(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-events", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from("ticket_events")
        .select(`
          *,
          lead_events:lead_event_id (id, raw_payload, source_name, occurred_at)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as TicketEvent[];
    },
    enabled: !!ticketId,
  });
}

export function useTicketComments(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-comments", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from("ticket_comments")
        .select(`
          *,
          users:author_user_id (id, full_name, email)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as TicketComment[];
    },
    enabled: !!ticketId,
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => {
      const updates: Record<string, unknown> = { status };

      if (status === "resolved") {
        updates.resolved_at = new Date().toISOString();
      } else if (status === "closed") {
        updates.closed_at = new Date().toISOString();
      } else if (status === "reopened") {
        updates.resolved_at = null;
        updates.closed_at = null;
      }

      const { error } = await supabase
        .from("tickets")
        .update(updates)
        .eq("id", ticketId)
        .eq("brand_id", currentBrand?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });
}

export function useAddTicketComment() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user id from users table
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", user.id)
        .single();

      if (!userData) throw new Error("User not found");

      const { error } = await supabase
        .from("ticket_comments")
        .insert({
          brand_id: currentBrand?.id,
          ticket_id: ticketId,
          author_user_id: userData.id,
          body,
        });

      if (error) throw error;
    },
    onSuccess: (_, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
    },
  });
}

export function useAssignTicket() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ ticketId, userId }: { ticketId: string; userId: string | null }) => {
      const updates: Record<string, unknown> = { 
        assigned_to_user_id: userId,
        assigned_at: userId ? new Date().toISOString() : null,
      };

      // Get current user to set assigned_by_user_id
      if (userId) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: currentUserData } = await supabase
            .from("users")
            .select("id")
            .eq("supabase_auth_id", authUser.id)
            .single();
          
          if (currentUserData) {
            updates.assigned_by_user_id = currentUserData.id;
          }
        }
      } else {
        updates.assigned_by_user_id = null;
      }

      const { error } = await supabase
        .from("tickets")
        .update(updates)
        .eq("id", ticketId)
        .eq("brand_id", currentBrand?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });
}
