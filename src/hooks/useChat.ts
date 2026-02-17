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
  type: "direct" | "group" | "entity";
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
  role: "member" | "admin";
  joined_at: string;
  left_at: string | null;
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
          
          // Invalidate to refresh
          queryClient.invalidateQueries({ queryKey: ["chat-messages", threadId] });
          
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
        .order("updated_at", { ascending: false });

      if (isAllBrandsSelected && allBrandIds.length > 0) {
        query = query.in("brand_id", allBrandIds);
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
