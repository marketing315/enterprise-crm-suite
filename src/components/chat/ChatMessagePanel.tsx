import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatThreadIcon } from "./ChatThreadIcon";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatEmptyState } from "./ChatEmptyState";
import type { ChatThread, ChatMessage } from "@/hooks/useChat";

interface ChatMessagePanelProps {
  thread: ChatThread | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  userId: string | null;
  messageInput: string;
  setMessageInput: (v: string) => void;
  askAI: boolean;
  setAskAI: (v: boolean) => void;
  isExecutiveThread: boolean;
  isPending: boolean;
  isDraftMode: boolean;
  onSend: (e: React.FormEvent) => void;
  onGroupSettings?: () => void;
}

export function ChatMessagePanel({
  thread,
  messages,
  messagesLoading,
  userId,
  messageInput,
  setMessageInput,
  askAI,
  setAskAI,
  isExecutiveThread,
  isPending,
  isDraftMode,
  onSend,
  onGroupSettings,
}: ChatMessagePanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasThread = !!thread || isDraftMode;

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, [messages, thread?.id]);

  if (!hasThread) {
    return <ChatEmptyState type="no-selection" />;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-3 bg-card/50 backdrop-blur-sm">
        <ChatThreadIcon type={thread?.type || (isDraftMode ? "executive" : "direct")} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">
            {isDraftMode && !thread ? "Nuova Chat AI" : (thread?.title || "Conversazione")}
          </h3>
          {thread?.entity_type && (
            <Badge variant="outline" className="text-[10px] mt-0.5 font-normal">
              {thread.entity_type}
            </Badge>
          )}
        </div>
        {thread?.type === "group" && onGroupSettings && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg"
            onClick={onGroupSettings}
            title="Impostazioni gruppo"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5">
          {messagesLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <ChatEmptyState type="no-messages" />
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.sender_user_id === userId}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <form onSubmit={onSend} className="px-5 py-3 border-t border-border/50 bg-card/50 backdrop-blur-sm space-y-2.5">
        {(thread?.type === "entity" || isExecutiveThread) && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="ai-mode"
                checked={askAI || isExecutiveThread}
                onCheckedChange={setAskAI}
                disabled={isExecutiveThread}
                className="scale-90"
              />
              <Label htmlFor="ai-mode" className="text-xs flex items-center gap-1.5 cursor-pointer">
                <Sparkles className={cn("h-3.5 w-3.5", (askAI || isExecutiveThread) && "text-primary")} />
                {isExecutiveThread ? "Agente AI Executive" : "Chiedi all'AI"}
              </Label>
            </div>
            {(askAI || isExecutiveThread) && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {isExecutiveThread ? "Sempre attivo" : "AI attiva"}
              </Badge>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={askAI ? "Chiedi all'assistente AI..." : "Scrivi un messaggio..."}
            disabled={isPending}
            className="bg-muted/30 border-border/50 focus-visible:ring-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!messageInput.trim() || isPending}
            className={cn(
              "shrink-0 rounded-lg transition-all",
              askAI && "bg-primary shadow-sm"
            )}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : askAI ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
