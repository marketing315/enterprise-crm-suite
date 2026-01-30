import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Send,
  Plus,
  Users,
  User,
  Bot,
  Loader2,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  useChatThreads,
  useChatMessages,
  useSendChatMessage,
  useSendAIMessage,
  ChatThread,
  ChatMessage,
} from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AgentChatPanel } from "@/components/chat/AgentChatPanel";

export default function Chat() {
  const { user } = useAuth();
  const { currentBrand } = useBrand();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [askAI, setAskAI] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads" | "agent">("agent");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading: threadsLoading } = useChatThreads();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    selectedThreadId || ""
  );
  const sendMessage = useSendChatMessage();
  const sendAIMessage = useSendAIMessage();

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedThreadId || !currentBrand) return;

    const text = messageInput.trim();
    setMessageInput("");

    if (askAI) {
      // First send user message to thread
      await sendMessage.mutateAsync({
        threadId: selectedThreadId,
        messageText: text,
      });

      // Then get AI response
      try {
        await sendAIMessage.mutateAsync({
          threadId: selectedThreadId,
          message: text,
          entityType: selectedThread?.entity_type || undefined,
          entityId: selectedThread?.entity_id || undefined,
          brandId: currentBrand.id,
        });
      } catch (error) {
        toast.error("Errore nella risposta AI");
      }
    } else {
      await sendMessage.mutateAsync({
        threadId: selectedThreadId,
        messageText: text,
      });
    }
  };

  const isPending = sendMessage.isPending || sendAIMessage.isPending;

  return (
    <div className="h-full flex flex-col">
      {/* Tab Selector */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "threads" | "agent")} className="flex-1 flex flex-col min-h-0">
        <div className="pb-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="agent" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agente AI Executive
            </TabsTrigger>
            <TabsTrigger value="threads" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversazioni
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Agent Tab */}
        <TabsContent value="agent" className="flex-1 min-h-0 mt-0">
          <AgentChatPanel />
        </TabsContent>

        {/* Threads Tab */}
        <TabsContent value="threads" className="flex-1 min-h-0 mt-0">
          <div className="h-full flex gap-4">
            {/* Thread List */}
            <Card className="w-80 shrink-0 flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chat
                  </CardTitle>
                  <Button size="icon" variant="ghost">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {threadsLoading ? (
                    <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <span className="text-sm text-muted-foreground">
                        Nessuna conversazione
                      </span>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {threads.map((thread) => (
                        <ThreadItem
                          key={thread.id}
                          thread={thread}
                          isSelected={thread.id === selectedThreadId}
                          onClick={() => setSelectedThreadId(thread.id)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Message Panel */}
            <Card className="flex-1 flex flex-col">
              {selectedThreadId ? (
                <>
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center gap-3">
                      <ThreadIcon type={selectedThread?.type || "direct"} />
                      <div>
                        <CardTitle className="text-base">
                          {selectedThread?.title || "Conversazione"}
                        </CardTitle>
                        {selectedThread?.entity_type && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {selectedThread.entity_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 p-4">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                          <span className="text-sm text-muted-foreground">
                            Inizia la conversazione
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {messages.map((message) => (
                            <MessageBubble
                              key={message.id}
                              message={message}
                              isOwn={message.sender_user_id === user?.id}
                            />
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </ScrollArea>
                    <Separator />
                    <form onSubmit={handleSendMessage} className="p-4 space-y-3">
                      {/* AI Toggle for entity threads */}
                      {selectedThread?.type === "entity" && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              id="ai-mode"
                              checked={askAI}
                              onCheckedChange={setAskAI}
                            />
                            <Label
                              htmlFor="ai-mode"
                              className="text-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Sparkles className={cn("h-4 w-4", askAI && "text-primary")} />
                              Chiedi all'AI
                            </Label>
                          </div>
                          {askAI && (
                            <Badge variant="secondary" className="text-xs">
                              L'AI analizzerà il contesto
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
                        />
                        <Button
                          type="submit"
                          size="icon"
                          disabled={!messageInput.trim() || isPending}
                          className={askAI ? "bg-primary" : ""}
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
                  </CardContent>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground">
                    Seleziona una conversazione
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Scegli una chat dalla lista o creane una nuova
                  </p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ThreadItem({
  thread,
  isSelected,
  onClick,
}: {
  thread: ChatThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 text-left hover:bg-muted/50 transition-colors flex gap-3",
        isSelected && "bg-muted"
      )}
    >
      <ThreadIcon type={thread.type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {thread.title || "Conversazione"}
        </p>
        {thread.entity_type && (
          <p className="text-xs text-muted-foreground">
            {thread.entity_type}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(thread.updated_at), {
            addSuffix: true,
            locale: it,
          })}
        </p>
      </div>
    </button>
  );
}

function ThreadIcon({ type }: { type: string }) {
  const iconClass = "h-8 w-8 p-1.5 rounded-full bg-muted";
  
  switch (type) {
    case "group":
      return <Users className={iconClass} />;
    case "entity":
      return <MessageSquare className={iconClass} />;
    default:
      return <User className={iconClass} />;
  }
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: ChatMessage;
  isOwn: boolean;
}) {
  const isAI = message.sender_type === "ai";

  return (
    <div
      className={cn(
        "flex gap-2",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback>
          {isAI ? (
            <Bot className="h-4 w-4" />
          ) : isOwn ? (
            "Tu"
          ) : (
            "U"
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[70%] rounded-lg p-3",
          isOwn
            ? "bg-primary text-primary-foreground"
            : isAI
            ? "bg-secondary border"
            : "bg-muted"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.message_text}</p>
        <p
          className={cn(
            "text-xs mt-1",
            isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {formatDistanceToNow(new Date(message.created_at), {
            addSuffix: true,
            locale: it,
          })}
        </p>
      </div>
    </div>
  );
}
