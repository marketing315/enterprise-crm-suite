import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";

// Types
export interface ChatThread {
  id: string;
  brand_id: string;
  type: "direct" | "group" | "entity" | "executive";
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  brand_id: string;
  sender_user_id: string | null;
  sender_type: "user" | "ai" | "system";
  message_text: string;
  attachments: unknown[];
  ai_context: unknown | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ChatMessageWithSender extends ChatMessage {
  sender?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface ChatThreadMember {
  id: string;
  thread_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member";
  joined_at: string;
  left_at: string | null;
  user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface UnreadCount {
  thread_id: string;
  unread_count: number;
}

// Get or create entity thread
export function useGetOrCreateEntityThread() {
  const { getWriteBrandId } = useWriteBrandId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
    }: {
      entityType: string;
      entityId: string;
    }) => {
      const brandId = getWriteBrandId();
      const { data, error } = await supabase.rpc("get_or_create_entity_thread", {
        p_brand_id: brandId,
        p_entity_type: entityType,
        p_entity_id: entityId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (error: Error) => {
      console.error("Error getting/creating entity thread:", error);
      toast.error("Errore nell'aprire la discussione");
    },
  });
}

// Fetch thread messages
export function useChatMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: async (): Promise<ChatMessageWithSender[]> => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select(`
          *,
          sender:users!chat_messages_sender_user_id_fkey(id, full_name, avatar_url)
        `)
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ChatMessageWithSender[];
    },
    enabled: !!threadId,
  });
}

// Send message
export function useSendChatMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      messageText,
      attachments = [],
    }: {
      threadId: string;
      messageText: string;
      attachments?: Array<Record<string, string | number | boolean | null>>;
    }) => {
      const { data, error } = await supabase.rpc("send_chat_message", {
        p_thread_id: threadId,
        p_message_text: messageText,
        p_attachments: JSON.stringify(attachments),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", variables.threadId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
    },
    onError: (error: Error) => {
      console.error("Error sending message:", error);
      toast.error("Errore nell'invio del messaggio");
    },
  });
}

// Subscribe to realtime messages
export function useChatRealtime(threadId: string | null, onNewMessage?: (message: ChatMessage) => void) {
  const queryClient = useQueryClient();

  const subscribeToMessages = () => {
    if (!threadId) return () => {};

    const channel = supabase
      .channel(`chat-messages-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const message = payload.new as ChatMessage;
          queryClient.invalidateQueries({ queryKey: ["chat-messages", threadId] });
          queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
          if (onNewMessage) {
            onNewMessage(message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  return { subscribeToMessages };
}

// Fetch user's threads
export function useChatThreads() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["chat-threads", currentBrand?.id, isAllBrandsSelected],
    queryFn: async (): Promise<ChatThread[]> => {
      let query = supabase
        .from("chat_threads")
        .select("*")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

      if (isAllBrandsSelected && allBrandIds.length > 0) {
        const idsWithSystem = [...allBrandIds, currentBrand?.id].filter(Boolean) as string[];
        query = query.in("brand_id", idsWithSystem);
      } else if (currentBrand) {
        query = query.eq("brand_id", currentBrand.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ChatThread[];
    },
    enabled: (!!currentBrand || (isAllBrandsSelected && allBrandIds.length > 0)),
  });
}

// Create group chat thread
export function useCreateGroupChat() {
  const { getWriteBrandId } = useWriteBrandId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      memberIds,
    }: {
      title: string;
      memberIds: string[];
    }) => {
      const brandId = getWriteBrandId();
      const { data, error } = await untypedClient.rpc("create_group_chat", {
        p_brand_id: brandId,
        p_title: title,
        p_member_ids: memberIds,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      toast.success("Gruppo creato con successo");
    },
    onError: (error: Error) => {
      console.error("Error creating group chat:", error);
      toast.error("Errore nella creazione del gruppo");
    },
  });
}

// Send message to AI assistant
export function useSendAIMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      message,
      entityType,
      entityId,
      brandId,
    }: {
      threadId: string;
      message: string;
      entityType?: string;
      entityId?: string;
      brandId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { threadId, message, entityType, entityId, brandId },
      });
      if (error) throw error;
      return data as { message: string; messageId: string };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", variables.threadId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (error: Error) => {
      console.error("Error sending AI message:", error);
      toast.error("Errore nella risposta AI");
    },
  });
}

// ─── Group management hooks ───

// Fetch thread members
export function useThreadMembers(threadId: string | null) {
  return useQuery({
    queryKey: ["thread-members", threadId],
    queryFn: async (): Promise<ChatThreadMember[]> => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from("chat_thread_members")
        .select(`
          *,
          user:users!chat_thread_members_user_id_fkey(id, full_name, avatar_url)
        `)
        .eq("thread_id", threadId)
        .is("left_at", null)
        .order("role", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ChatThreadMember[];
    },
    enabled: !!threadId,
  });
}

// Rename group
export function useRenameGroupThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, newTitle }: { threadId: string; newTitle: string }) => {
      const { error } = await untypedClient.rpc("rename_group_thread", {
        p_thread_id: threadId,
        p_new_title: newTitle,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      toast.success("Nome gruppo aggiornato");
    },
    onError: (error: Error) => {
      console.error("Error renaming group:", error);
      toast.error("Errore nel rinominare il gruppo");
    },
  });
}

// Add member
export function useAddGroupMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      newUserId,
      role = "member",
    }: {
      threadId: string;
      newUserId: string;
      role?: string;
    }) => {
      const { error } = await untypedClient.rpc("add_group_member", {
        p_thread_id: threadId,
        p_new_user_id: newUserId,
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["thread-members", vars.threadId] });
      toast.success("Membro aggiunto");
    },
    onError: (error: Error) => {
      console.error("Error adding member:", error);
      toast.error("Errore nell'aggiungere il membro");
    },
  });
}

// Remove member
export function useRemoveGroupMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      targetUserId,
    }: {
      threadId: string;
      targetUserId: string;
    }) => {
      const { error } = await untypedClient.rpc("remove_group_member", {
        p_thread_id: threadId,
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["thread-members", vars.threadId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      toast.success("Membro rimosso");
    },
    onError: (error: Error) => {
      console.error("Error removing member:", error);
      toast.error("Errore nella rimozione del membro");
    },
  });
}

// ─── Unread counts ───

export function useUnreadCounts() {
  return useQuery({
    queryKey: ["unread-counts"],
    queryFn: async (): Promise<UnreadCount[]> => {
      const { data, error } = await untypedClient.rpc("get_unread_counts");
      if (error) throw error;
      return (data || []) as UnreadCount[];
    },
    refetchInterval: 30_000,
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await untypedClient.rpc("mark_thread_read", {
        p_thread_id: threadId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
    },
  });
}

// ─── Thread display titles ───

export function useThreadDisplayTitles(threadIds: string[]) {
  return useQuery({
    queryKey: ["thread-display-titles", threadIds],
    queryFn: async (): Promise<Map<string, string>> => {
      if (threadIds.length === 0) return new Map();
      const { data, error } = await untypedClient.rpc("get_thread_display_titles", {
        p_thread_ids: threadIds,
      });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of (data || []) as Array<{ thread_id: string; display_title: string }>) {
        map.set(row.thread_id, row.display_title);
      }
      return map;
    },
    enabled: threadIds.length > 0,
    staleTime: 10_000,
  });
}

// Fetch archived threads
export function useArchivedThreads() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["chat-threads-archived", currentBrand?.id, isAllBrandsSelected],
    queryFn: async (): Promise<ChatThread[]> => {
      let query = supabase
        .from("chat_threads")
        .select("*")
        .not("archived_at", "is", null)
        .order("updated_at", { ascending: false });

      if (isAllBrandsSelected && allBrandIds.length > 0) {
        const idsWithSystem = [...allBrandIds, currentBrand?.id].filter(Boolean) as string[];
        query = query.in("brand_id", idsWithSystem);
      } else if (currentBrand) {
        query = query.eq("brand_id", currentBrand.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ChatThread[];
    },
    enabled: (!!currentBrand || (isAllBrandsSelected && allBrandIds.length > 0)),
  });
}

// Archive a thread (soft-hide) — optimistic
export function useArchiveThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await (supabase as any)
        .from("chat_threads")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", threadId);
      if (error) throw error;
    },
    onMutate: async (threadId: string) => {
      await queryClient.cancelQueries({ queryKey: ["chat-threads"] });
      const prev = queryClient.getQueryData<ChatThread[]>(["chat-threads"]);
      if (prev) {
        queryClient.setQueryData<ChatThread[]>(
          ["chat-threads"],
          (old) => (old || []).filter((t) => t.id !== threadId)
        );
      }
      return { prev };
    },
    onError: (_err, _threadId, context) => {
      if (context?.prev) queryClient.setQueryData(["chat-threads"], context.prev);
      toast.error("Errore nell'archiviazione");
    },
    onSuccess: () => {
      toast.success("Conversazione archiviata");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads-archived"] });
      queryClient.invalidateQueries({ queryKey: ["executive-thread"] });
    },
  });
}

// Unarchive a thread — optimistic
export function useUnarchiveThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await (supabase as any)
        .from("chat_threads")
        .update({ archived_at: null })
        .eq("id", threadId);
      if (error) throw error;
    },
    onMutate: async (threadId: string) => {
      await queryClient.cancelQueries({ queryKey: ["chat-threads-archived"] });
      const prev = queryClient.getQueryData<ChatThread[]>(["chat-threads-archived"]);
      if (prev) {
        queryClient.setQueryData<ChatThread[]>(
          ["chat-threads-archived"],
          (old) => (old || []).filter((t) => t.id !== threadId)
        );
      }
      return { prev };
    },
    onError: (_err, _threadId, context) => {
      if (context?.prev) queryClient.setQueryData(["chat-threads-archived"], context.prev);
      toast.error("Errore nel ripristino");
    },
    onSuccess: () => {
      toast.success("Conversazione ripristinata");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads-archived"] });
      queryClient.invalidateQueries({ queryKey: ["executive-thread"] });
    },
  });
}

// Delete a thread and its messages permanently — optimistic
export function useDeleteThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      await supabase.from("chat_messages").delete().eq("thread_id", threadId);
      await (supabase as any).from("chat_message_reads").delete().eq("message_id", threadId);
      await (supabase as any).from("chat_thread_members").delete().eq("thread_id", threadId);
      await (supabase as any).from("ai_chat_runs").delete().eq("thread_id", threadId);
      const { error } = await supabase.from("chat_threads").delete().eq("id", threadId);
      if (error) throw error;
    },
    onMutate: async (threadId: string) => {
      await queryClient.cancelQueries({ queryKey: ["chat-threads"] });
      await queryClient.cancelQueries({ queryKey: ["chat-threads-archived"] });
      const prevThreads = queryClient.getQueryData<ChatThread[]>(["chat-threads"]);
      const prevArchived = queryClient.getQueryData<ChatThread[]>(["chat-threads-archived"]);
      if (prevThreads) {
        queryClient.setQueryData<ChatThread[]>(["chat-threads"], (old) => (old || []).filter((t) => t.id !== threadId));
      }
      if (prevArchived) {
        queryClient.setQueryData<ChatThread[]>(["chat-threads-archived"], (old) => (old || []).filter((t) => t.id !== threadId));
      }
      return { prevThreads, prevArchived };
    },
    onError: (err: Error, _threadId, context) => {
      if (context?.prevThreads) queryClient.setQueryData(["chat-threads"], context.prevThreads);
      if (context?.prevArchived) queryClient.setQueryData(["chat-threads-archived"], context.prevArchived);
      console.error("Delete thread error:", err);
      toast.error("Errore nell'eliminazione");
    },
    onSuccess: () => {
      toast.success("Conversazione eliminata");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads-archived"] });
      queryClient.invalidateQueries({ queryKey: ["executive-thread"] });
    },
  });
}
