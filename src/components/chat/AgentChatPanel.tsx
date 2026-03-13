import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Bot, Send, Loader2, User, Sparkles, BarChart3, TrendingUp, Ticket, Users,
  Target, ArrowUpDown, Kanban, AlertCircle, Clock, ChevronDown, ChevronUp,
  Database, CheckCircle2, Plus, UserPlus, Briefcase, CalendarPlus, TicketPlus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import { useAIAgentChat, useExecutiveThread, useCreateNewExecutiveThread, AGENT_QUICK_ACTIONS } from "@/hooks/useAIAgent";
import { useChatMessages, useChatRealtime } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

// ─── Types ───

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  latencyMs?: number;
  hadFallback?: boolean;
  deliveryStatus?: string;
}

// ─── Constants ───

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, TrendingUp, Kanban, Ticket, Users, ArrowUpDown, Target, Bot,
};

const TOOL_LABELS: Record<string, string> = {
  dynamic_analytics_query: "📊 Query Analitica",
  search_contacts: "🔍 Ricerca Contatti",
  get_contact_timeline: "📋 Timeline Contatto",
  get_pipeline_status: "💼 Pipeline",
  get_operator_performance: "👥 Performance Team",
  get_dashboard_kpis: "📈 KPI Dashboard",
  get_ticket_overview: "🎫 Ticket Overview",
  get_appointment_summary: "📅 Appuntamenti",
  get_lead_analytics: "🎯 Lead Analytics",
  get_trend_comparison: "📉 Confronto Trend",
  get_ai_decisions_summary: "🤖 AI Performance",
  get_ad_performance: "📣 Performance ADV",
  get_raw_table_data: "🗃️ Dati Tabella",
};

const OPERATIONAL_ACTIONS = [
  { id: "new-contact", label: "Contatto", icon: UserPlus, route: "/contacts?create=true" },
  { id: "new-deal", label: "Deal", icon: Briefcase, route: "/pipeline" },
  { id: "new-ticket", label: "Ticket", icon: TicketPlus, route: "/tickets?create=true" },
  { id: "new-appointment", label: "Appuntamento", icon: CalendarPlus, route: "/calendar?create=true" },
] as const;

// ─── Main Component ───

export function AgentChatPanel() {
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentChat = useAIAgentChat();
  const createNewThread = useCreateNewExecutiveThread();

  const { data: threadId, isLoading: threadLoading } = useExecutiveThread();
  const { data: persistedMessages } = useChatMessages(threadId || null);
  const { subscribeToMessages } = useChatRealtime(threadId || null);

  useEffect(() => {
    if (!threadId) return;
    const unsub = subscribeToMessages();
    return unsub;
  }, [threadId]);

  // Derive messages from DB + optimistic
  const dbMessages: Message[] = (persistedMessages || []).map((m) => ({
    id: m.id,
    role: m.sender_type === "user" ? "user" as const : "assistant" as const,
    content: m.message_text,
    timestamp: new Date(m.created_at),
    toolsUsed: (m.ai_context as any)?.tools_used || undefined,
    latencyMs: (m.ai_context as any)?.latency_ms || undefined,
    hadFallback: (m.ai_context as any)?.had_fallback || false,
    deliveryStatus: (m as any).delivery_status || "sent",
  }));

  const pendingOptimistic = optimisticMessages.filter((opt) =>
    !dbMessages.some((db) => db.role === opt.role && db.content === opt.content)
  );
  const messages = [...dbMessages, ...pendingOptimistic];

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (persistedMessages && persistedMessages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [threadId, persistedMessages?.length]);

  // Clean up optimistic
  useEffect(() => {
    if (pendingOptimistic.length < optimisticMessages.length) {
      setOptimisticMessages(pendingOptimistic);
    }
  }, [pendingOptimistic.length, optimisticMessages.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || agentChat.isPending) return;

    const userMessage: Message = {
      id: `optimistic-${crypto.randomUUID()}`, role: "user", content: text.trim(), timestamp: new Date(),
    };
    setOptimisticMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await agentChat.mutateAsync({ message: text.trim(), threadId });
      const assistantMessage: Message = {
        id: `optimistic-${crypto.randomUUID()}`, role: "assistant", content: response.message, timestamp: new Date(),
        toolsUsed: response.tools_used, latencyMs: response.latency_ms, hadFallback: response.had_fallback,
      };
      setOptimisticMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("[AgentChatPanel] Send error:", err);
      setOptimisticMessages((prev) => [...prev, {
        id: `optimistic-error-${crypto.randomUUID()}`, role: "assistant",
        content: "Mi dispiace, si è verificato un errore nell'elaborazione. Riprova tra qualche istante.",
        timestamp: new Date(), hadFallback: true, deliveryStatus: "failed",
      }]);
    }
  }, [agentChat, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };

  if (threadLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full rounded-xl border border-border/50 bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Caricamento agente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden rounded-xl border border-border/50 bg-background">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Agente AI Executive</h2>
            <Badge variant="outline" className="text-[9px] font-normal border-primary/20 text-primary px-1.5 py-0">
              Premium
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Query dinamiche · Analisi geo · Multi-step reasoning
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs rounded-lg"
          onClick={() => createNewThread.mutate()}
          disabled={createNewThread.isPending || messages.length === 0}
          title="Nuova conversazione"
        >
          {createNewThread.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Nuova</span>
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5">
          {messages.length === 0 ? (
            <WelcomeState onQuickAction={(p) => handleSend(p)} isPending={agentChat.isPending} />
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <AgentMessageBubble key={message.id} message={message} />
              ))}
              {agentChat.isPending && <ThinkingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <InputBar
        messages={messages}
        input={input}
        setInput={setInput}
        isPending={agentChat.isPending}
        onSend={handleSend}
        onQuickAction={(p) => handleSend(p)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

// ─── Welcome State ───

function WelcomeState({ onQuickAction, isPending }: { onQuickAction: (p: string) => void; isPending: boolean }) {
  return (
    <div className="space-y-8 py-4">
      {/* Hero */}
      <div className="text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/10">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">Il tuo assistente executive</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          Analizza i dati del CRM con domande in linguaggio naturale. Supporta query complesse, analisi geografiche e confronti temporali.
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          {[
            { icon: Database, label: "12 dataset" },
            { icon: Target, label: "Analisi geo" },
            { icon: Sparkles, label: "Multi-step" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1">
              <Icon className="h-3 w-3" /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">Inizia con</p>
        <div className="grid grid-cols-2 gap-2">
          {AGENT_QUICK_ACTIONS.map((action) => {
            const Icon = iconMap[action.icon] || Bot;
            return (
              <button
                key={action.id}
                className={cn(
                  "flex items-center gap-2.5 text-left rounded-xl border border-border/50 px-3.5 py-3",
                  "bg-card hover:bg-accent/50 hover:border-border transition-all duration-150",
                  "disabled:opacity-50"
                )}
                onClick={() => onQuickAction(action.prompt)}
                disabled={isPending}
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Thinking Indicator ───

function ThinkingIndicator() {
  return (
    <div className="flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="bg-primary/10">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2.5">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <span className="text-xs text-muted-foreground">Analisi in corso...</span>
      </div>
    </div>
  );
}

// ─── Agent Message Bubble ───

function AgentMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [toolsOpen, setToolsOpen] = useState(false);
  const hasDynamicQuery = message.toolsUsed?.includes("dynamic_analytics_query");

  return (
    <div className={cn(
      "flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      isUser && "flex-row-reverse"
    )}>
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          "text-[10px]",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
        )}>
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn("max-w-[82%] space-y-1", isUser && "items-end")}>
        <div className={cn(
          "rounded-2xl px-4 py-3",
          isUser ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted/60 rounded-bl-md",
          message.hadFallback && !isUser && "border border-destructive/20 bg-destructive/5"
        )}>
          {message.hadFallback && !isUser && (
            <div className="flex items-center gap-1.5 mb-2 text-destructive text-xs">
              <AlertCircle className="h-3 w-3" /><span>Risposta incompleta</span>
            </div>
          )}
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_table]:text-xs">
              <ReactMarkdown components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-lg border border-border/50">
                    <table className="min-w-full text-sm">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border-b border-border px-3 py-1.5 bg-muted/30 text-left text-xs font-medium text-muted-foreground">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-border/30 px-3 py-1.5 text-xs">{children}</td>
                ),
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
              }}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className={cn("flex items-center gap-2 flex-wrap px-1", isUser && "flex-row-reverse")}>
          <span className="text-[10px] text-muted-foreground/60">
            {formatDistanceToNow(message.timestamp, { addSuffix: true, locale: it })}
          </span>
          {!isUser && !message.hadFallback && message.toolsUsed && message.toolsUsed.length > 0 && (
            <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> Completa
            </span>
          )}
          {message.latencyMs && !isUser && (
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{(message.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-4 px-1.5 text-[10px] text-muted-foreground/60 hover:text-foreground">
                  {hasDynamicQuery ? "📊" : "🔧"} {message.toolsUsed.length} {message.toolsUsed.length > 1 ? "queries" : "query"}
                  {toolsOpen ? <ChevronUp className="h-2.5 w-2.5 ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 ml-0.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex gap-1 flex-wrap mt-1">
                  {message.toolsUsed.map((tool, i) => (
                    <Badge key={`${tool}-${i}`} variant="outline" className="text-[9px] py-0 bg-muted/30 border-border/50">
                      {TOOL_LABELS[tool] || tool.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Input Bar ───

function InputBar({
  messages,
  input,
  setInput,
  isPending,
  onSend,
  onQuickAction,
  onKeyDown,
}: {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  isPending: boolean;
  onSend: (text: string) => void;
  onQuickAction: (prompt: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="border-t border-border/50">
      {/* Actions row */}
      <div className="px-5 pt-3 pb-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
        <TooltipProvider delayDuration={300}>
          {OPERATIONAL_ACTIONS.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-7 gap-1 text-[11px] rounded-lg border-dashed"
                  onClick={() => navigate(action.route)}
                >
                  <action.icon className="h-3 w-3" />
                  <Plus className="h-2 w-2 -ml-0.5" />
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Crea {action.label.toLowerCase()}
              </TooltipContent>
            </Tooltip>
          ))}

          {messages.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4 mx-1" />
              {AGENT_QUICK_ACTIONS.slice(0, 4).map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 text-[11px] text-muted-foreground hover:text-foreground rounded-lg"
                      onClick={() => onQuickAction(action.prompt)}
                      disabled={isPending}
                    >
                      {action.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    {action.prompt}
                  </TooltipContent>
                </Tooltip>
              ))}
            </>
          )}
        </TooltipProvider>
      </div>

      {/* Input */}
      <div className="px-5 pb-4 pt-2 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Chiedi qualcosa... (es: Quanti lead dalla Lombardia negli ultimi 3 giorni?)"
          className="min-h-[44px] max-h-[120px] resize-none bg-muted/30 border-border/50 focus-visible:ring-1 rounded-xl"
          disabled={isPending}
        />
        <Button
          size="icon"
          onClick={() => onSend(input)}
          disabled={!input.trim() || isPending}
          className="shrink-0 rounded-xl h-11 w-11"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
