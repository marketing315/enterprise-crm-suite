import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { useBrand } from "@/contexts/BrandContext";
import type { TagScope, AssignedBy } from "@/types/database";

// Untyped client for new tables not yet in generated types
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

export interface Tag {
  id: string;
  brand_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  scope: TagScope;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TagTreeItem extends Tag {
  depth: number;
  path: string;
  children?: TagTreeItem[];
}

export interface TagAssignment {
  id: string;
  brand_id: string;
  tag_id: string;
  contact_id: string | null;
  lead_event_id: string | null;
  deal_id: string | null;
  appointment_id: string | null;
  ticket_id: string | null;
  assigned_by: AssignedBy;
  assigned_at: string;
  assigned_by_user_id: string | null;
  confidence: number | null;
  tag?: Tag;
}

export interface TagWithCount extends Tag {
  contact_count: number;
  event_count: number;
  deal_count: number;
  total_count: number;
}

// Fetch all tags for current brand (flat list)
export function useTags(scope?: TagScope) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["tags", currentBrand?.id, scope],
    queryFn: async (): Promise<Tag[]> => {
      if (!currentBrand) return [];

      let query = untypedClient
        .from("tags")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (scope) {
        query = query.or(`scope.eq.${scope},scope.eq.mixed`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Tag[];
    },
    enabled: !!currentBrand,
  });
}

// Fetch tag tree (hierarchical)
export function useTagTree() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["tag-tree", currentBrand?.id],
    queryFn: async (): Promise<TagTreeItem[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.rpc("get_tag_tree", {
        p_brand_id: currentBrand.id,
      });

      if (error) throw error;
      
      // Convert flat tree to nested structure
      const items = (data || []) as Array<{
        id: string;
        parent_id: string | null;
        name: string;
        description: string | null;
        color: string;
        scope: TagScope;
        is_active: boolean;
        order_index: number;
        depth: number;
        path: string;
      }>;

      return buildTagTree(items);
    },
    enabled: !!currentBrand,
  });
}

// Build nested tree from flat array
function buildTagTree(items: Array<{
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  scope: TagScope;
  is_active: boolean;
  order_index: number;
  depth: number;
  path: string;
}>): TagTreeItem[] {
  const map = new Map<string, TagTreeItem>();
  const roots: TagTreeItem[] = [];

  // First pass: create all items
  for (const item of items) {
    map.set(item.id, {
      ...item,
      brand_id: "",
      created_at: "",
      updated_at: "",
      children: [],
    });
  }

  // Second pass: build tree
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children?.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// Fetch tags assigned to a specific entity
export function useEntityTags(entityType: "contact" | "event" | "deal" | "appointment" | "ticket", entityId: string | null) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["entity-tags", entityType, entityId, currentBrand?.id],
    queryFn: async (): Promise<TagAssignment[]> => {
      if (!currentBrand || !entityId) return [];

      const columnMap = {
        contact: "contact_id",
        event: "lead_event_id",
        deal: "deal_id",
        appointment: "appointment_id",
        ticket: "ticket_id",
      };

      const { data, error } = await untypedClient
        .from("tag_assignments")
        .select(`
          *,
          tag:tags(*)
        `)
        .eq("brand_id", currentBrand.id)
        .eq(columnMap[entityType], entityId);

      if (error) throw error;
      return (data || []) as TagAssignment[];
    },
    enabled: !!currentBrand && !!entityId,
  });
}

// Create tag
export function useCreateTag() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      parent_id?: string | null;
      description?: string;
      color?: string;
      scope?: TagScope;
    }) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { data, error } = await untypedClient
        .from("tags")
        .insert({
          brand_id: currentBrand.id,
          name: params.name,
          parent_id: params.parent_id || null,
          description: params.description || null,
          color: params.color || "#6366f1",
          scope: params.scope || "mixed",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["tag-tree"] });
    },
  });
}

// Update tag
export function useUpdateTag() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<{
        name: string;
        parent_id: string | null;
        description: string;
        color: string;
        scope: TagScope;
        is_active: boolean;
        order_index: number;
      }>;
    }) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { error } = await untypedClient
        .from("tags")
        .update(params.updates)
        .eq("id", params.id)
        .eq("brand_id", currentBrand.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["tag-tree"] });
    },
  });
}

// Delete tag
export function useDeleteTag() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (tagId: string) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { error } = await untypedClient
        .from("tags")
        .delete()
        .eq("id", tagId)
        .eq("brand_id", currentBrand.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["tag-tree"] });
    },
  });
}

// Assign tag to entity
export function useAssignTag() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: {
      tagId: string;
      entityType: "contact" | "event" | "deal" | "appointment" | "ticket";
      entityId: string;
      assignedBy?: AssignedBy;
      confidence?: number;
    }) => {
      if (!currentBrand) throw new Error("No brand selected");

      const assignmentData: {
        brand_id: string;
        tag_id: string;
        assigned_by: string;
        confidence?: number;
        contact_id?: string;
        lead_event_id?: string;
        deal_id?: string;
        appointment_id?: string;
        ticket_id?: string;
      } = {
        brand_id: currentBrand.id,
        tag_id: params.tagId,
        assigned_by: params.assignedBy || "user",
        confidence: params.confidence,
      };

      // Set the appropriate entity ID
      switch (params.entityType) {
        case "contact":
          assignmentData.contact_id = params.entityId;
          break;
        case "event":
          assignmentData.lead_event_id = params.entityId;
          break;
        case "deal":
          assignmentData.deal_id = params.entityId;
          break;
        case "appointment":
          assignmentData.appointment_id = params.entityId;
          break;
        case "ticket":
          assignmentData.ticket_id = params.entityId;
          break;
      }

      const { data, error } = await untypedClient
        .from("tag_assignments")
        .insert(assignmentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ 
        queryKey: ["entity-tags", vars.entityType, vars.entityId] 
      });
    },
  });
}

// Remove tag from entity
export function useRemoveTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      assignmentId: string;
      entityType: "contact" | "event" | "deal" | "appointment" | "ticket";
      entityId: string;
    }) => {
      const { error } = await untypedClient
        .from("tag_assignments")
        .delete()
        .eq("id", params.assignmentId);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ 
        queryKey: ["entity-tags", vars.entityType, vars.entityId] 
      });
    },
  });
}
