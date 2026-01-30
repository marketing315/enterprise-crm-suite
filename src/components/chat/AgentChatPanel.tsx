import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  Loader2,
  User,
  Sparkles,
  BarChart3,
  TrendingUp,
  Ticket,
  Users,
  Target,
  ArrowUpDown,
  Kanban,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import { useAIAgentChat, AGENT_QUICK_ACTIONS } from "@/hooks/useAIAgent";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3,
  TrendingUp,
  Kanban,
  Ticket,
  Users,
  ArrowUpDown,
  Target,
  Bot,
};

export function AgentChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const agentChat = useAIAgentChat();

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || agentChat.isPending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Build conversation history for context
    const conversationHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await agentChat.mutateAsync({
        message: text.trim(),
        conversationHistory,
      });

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        toolsUsed: response.tools_used,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleQuickAction = (prompt: string) => {
    handleSend(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  return (
    <Card className="flex-1 flex flex-col h-full">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Agente AI Executive
              <Sparkles className="h-4 w-4 text-primary" />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Accesso completo ai dati della piattaforma
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-6">
              {/* Welcome message */}
              <div className="text-center py-8">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-medium text-lg">Ciao! Sono il tuo assistente executive.</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Ho accesso completo ai dati del CRM. Chiedimi qualsiasi cosa!
                </p>
              </div>

              {/* Quick actions grid */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Azioni rapide
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {AGENT_QUICK_ACTIONS.map((action) => {
                    const Icon = iconMap[action.icon] || Bot;
                    return (
                      <Button
                        key={action.id}
                        variant="outline"
                        size="sm"
                        className="justify-start h-auto py-2 px-3"
                        onClick={() => handleQuickAction(action.prompt)}
                        disabled={agentChat.isPending}
                      >
                        <Icon className="h-4 w-4 mr-2 shrink-0" />
                        <span className="truncate">{action.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {agentChat.isPending && (
                <div className="flex gap-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Sto analizzando i dati...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="p-4 border-t space-y-3">
          {/* Quick actions row when there are messages */}
          {messages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {AGENT_QUICK_ACTIONS.slice(0, 4).map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={agentChat.isPending}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Chiedi qualcosa... (es: Come sta andando oggi?)"
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={agentChat.isPending}
            />
            <Button
              size="icon"
              onClick={() => handleSend(input)}
              disabled={!input.trim() || agentChat.isPending}
              className="shrink-0"
            >
              {agentChat.isPending ? (
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isUser ? "" : "bg-primary/10"}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn("max-w-[80%] space-y-1", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-lg p-3",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full text-sm">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border px-2 py-1 bg-muted/50 text-left font-medium">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-2 py-1">{children}</td>
                  ),
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(message.timestamp, { addSuffix: true, locale: it })}
          </span>
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <div className="flex gap-1">
              {message.toolsUsed.map((tool) => (
                <Badge key={tool} variant="outline" className="text-[10px] py-0">
                  {tool.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
