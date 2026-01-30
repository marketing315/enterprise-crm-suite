import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquare, Send, Sparkles, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useChatMessages,
  useSendChatMessage,
  useChatRealtime,
  useGetOrCreateEntityThread,
  useSendAIMessage,
} from "@/hooks/useChat";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";

interface EntityChatBoxProps {
  entityType: "contact" | "deal" | "ticket" | "appointment";
  entityId: string;
  className?: string;
}

export function EntityChatBox({ entityType, entityId, className }: EntityChatBoxProps) {
  const { currentBrand } = useBrand();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [askAI, setAskAI] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getOrCreateThread = useGetOrCreateEntityThread();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(threadId);
  const sendMessage = useSendChatMessage();
  const sendAIMessage = useSendAIMessage();
  const { subscribeToMessages } = useChatRealtime(threadId);

  // Get or create thread on mount
  useEffect(() => {
    if (entityType && entityId && currentBrand) {
      getOrCreateThread.mutate(
        { entityType, entityId },
        {
          onSuccess: (id) => setThreadId(id),
        }
      );
    }
  }, [entityType, entityId, currentBrand?.id]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (threadId) {
      const unsubscribe = subscribeToMessages();
      return unsubscribe;
    }
  }, [threadId, subscribeToMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !threadId || !currentBrand) return;

    const messageText = newMessage.trim();
    setNewMessage("");

    // First send the user message
    await sendMessage.mutateAsync({
      threadId,
      messageText,
    });

    // If AI mode is on, also trigger AI response
    if (askAI) {
      await sendAIMessage.mutateAsync({
        threadId,
        message: messageText,
        entityType,
        entityId,
        brandId: currentBrand.id,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getEntityLabel = () => {
    switch (entityType) {
      case "contact":
        return "Contatto";
      case "deal":
        return "Deal";
      case "ticket":
        return "Ticket";
      case "appointment":
        return "Appuntamento";
      default:
        return "Entità";
    }
  };

  const isSending = sendMessage.isPending || sendAIMessage.isPending;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Discussione {getEntityLabel()}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="ask-ai"
              checked={askAI}
              onCheckedChange={setAskAI}
              className="scale-75"
            />
            <Label
              htmlFor="ask-ai"
              className={cn(
                "text-xs cursor-pointer flex items-center gap-1",
                askAI ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Sparkles className="h-3 w-3" />
              AI
            </Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-3 py-2 max-h-[200px]">
            {messagesLoading || getOrCreateThread.isPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nessun messaggio. Inizia la discussione!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.sender_type === "ai" && "bg-primary/5 -mx-2 px-2 py-1 rounded"
                  )}
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px]">
                      {msg.sender_type === "ai" ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">
                        {msg.sender_type === "ai"
                          ? "AI Assistant"
                          : msg.sender?.full_name || "Utente"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(msg.created_at), "HH:mm", { locale: it })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                      {msg.message_text}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Textarea
              placeholder={askAI ? "Chiedi all'AI..." : "Scrivi un messaggio..."}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[80px] text-sm resize-none"
              disabled={isSending || !threadId}
            />
            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isSending || !threadId}
              className="shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
