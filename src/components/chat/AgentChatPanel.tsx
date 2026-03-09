import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
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
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Database,
  CheckCircle2,
  Plus,
  UserPlus,
  Briefcase,
  CalendarPlus,
  TicketPlus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import { useAIAgentChat, useExecutiveThread, useCreateNewExecutiveThread, AGENT_QUICK_ACTIONS } from "@/hooks/useAIAgent";
import { useChatMessages, useChatRealtime } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, TrendingUp, Kanban, Ticket, Users, ArrowUpDown, Target, Bot,
};

// Tool name → human-readable label
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

  // Derive messages from DB + optimistic (pending) messages
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

  // Merge: DB messages are source of truth; optimistic messages that aren't yet in DB are appended
  // Match optimistic messages to DB messages by content+role (since IDs differ)
  const pendingOptimistic = optimisticMessages.filter((opt) => {
    return !dbMessages.some(
      (db) => db.role === opt.role && db.content === opt.content
    );
  });
  const messages = [...dbMessages, ...pendingOptimistic];

  // Auto-scroll to bottom on new messages AND on initial load
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Also scroll when thread first loads
  useEffect(() => {
    if (persistedMessages && persistedMessages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [threadId, persistedMessages?.length]);

  // Clean up optimistic messages that are now in DB
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
      // Add assistant response as optimistic until DB syncs
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

  const handleQuickAction = (prompt: string) => handleSend(prompt);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };

  if (threadLoading) {
    return (
      <Card className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              Agente AI Executive
              <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary">Premium</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Query dinamiche • Analisi geo • Multi-step reasoning
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => createNewThread.mutate()}
            disabled={createNewThread.isPending || messages.length === 0}
            title="Nuova conversazione"
          >
            {createNewThread.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Nuova chat</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-4 min-h-0">
          {messages.length === 0 ? (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="font-medium text-lg">Ciao! Sono il tuo assistente executive premium.</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Puoi chiedermi <strong>qualsiasi</strong> cosa sui dati del CRM — anche domande nuove!
                </p>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Query dinamiche</span>
                  <span className="flex items-center gap-1"><Target className="h-3 w-3" /> Analisi geo</span>
                  <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Multi-step</span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Azioni rapide</p>
                <div className="grid grid-cols-2 gap-2">
                  {AGENT_QUICK_ACTIONS.map((action) => {
                    const Icon = iconMap[action.icon] || Bot;
                    return (
                      <Button key={action.id} variant="outline" size="sm" className="justify-start h-auto py-2 px-3"
                        onClick={() => handleQuickAction(action.prompt)} disabled={agentChat.isPending}>
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
                    <AvatarFallback className="bg-primary/10"><Bot className="h-4 w-4 text-primary" /></AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Sto analizzando i dati...</span>
                  </div>
                </div>
               )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <QuickActionsBar
          messages={messages}
          input={input}
          setInput={setInput}
          isPending={agentChat.isPending}
          onSend={handleSend}
          onQuickAction={handleQuickAction}
          onKeyDown={handleKeyDown}
        />
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [toolsOpen, setToolsOpen] = useState(false);
  const hasDynamicQuery = message.toolsUsed?.includes("dynamic_analytics_query");

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isUser ? "" : "bg-primary/10"}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn("max-w-[80%] space-y-1", isUser && "items-end")}>
        <div className={cn(
          "rounded-lg p-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          message.hadFallback && !isUser && "border border-destructive/30 bg-destructive/5"
        )}>
          {message.hadFallback && !isUser && (
            <div className="flex items-center gap-1.5 mb-2 text-destructive text-xs">
              <AlertCircle className="h-3 w-3" /><span>Risposta incompleta</span>
            </div>
          )}
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown components={{
                table: ({ children }) => (<div className="overflow-x-auto my-2"><table className="min-w-full text-sm">{children}</table></div>),
                th: ({ children }) => (<th className="border border-border px-2 py-1 bg-muted/50 text-left font-medium">{children}</th>),
                td: ({ children }) => (<td className="border border-border px-2 py-1">{children}</td>),
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
              }}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {/* Meta row */}
        <div className={cn("flex items-center gap-2 flex-wrap", isUser && "flex-row-reverse")}>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(message.timestamp, { addSuffix: true, locale: it })}
          </span>
          {!isUser && !message.hadFallback && message.toolsUsed && message.toolsUsed.length > 0 && (
            <span className="text-xs text-primary flex items-center gap-0.5">
              <CheckCircle2 className="h-3 w-3" /> Completa
            </span>
          )}
          {message.latencyMs && !isUser && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />{(message.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                  {hasDynamicQuery ? "📊" : "🔧"} {message.toolsUsed.length} {message.toolsUsed.length > 1 ? "queries" : "query"}
                  {toolsOpen ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex gap-1 flex-wrap mt-1">
                  {message.toolsUsed.map((tool, i) => (
                    <Badge key={`${tool}-${i}`} variant="outline" className="text-[10px] py-0">
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

const OPERATIONAL_ACTIONS = [
  { id: "new-contact", label: "Contatto", icon: UserPlus, route: "/contacts?create=true" },
  { id: "new-deal", label: "Deal", icon: Briefcase, route: "/pipeline" },
  { id: "new-ticket", label: "Ticket", icon: TicketPlus, route: "/tickets?create=true" },
  { id: "new-appointment", label: "Appuntamento", icon: CalendarPlus, route: "/calendar?create=true" },
] as const;

function QuickActionsBar({
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
    <div className="border-t">
      {/* Operational + AI quick actions row */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2 overflow-x-auto scrollbar-thin">
        <TooltipProvider delayDuration={300}>
          {/* Operational shortcuts */}
          {OPERATIONAL_ACTIONS.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 gap-1.5 text-xs border-dashed"
                  onClick={() => navigate(action.route)}
                >
                  <action.icon className="h-3.5 w-3.5" />
                  <Plus className="h-2.5 w-2.5 -ml-1" />
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Crea {action.label.toLowerCase()}
              </TooltipContent>
            </Tooltip>
          ))}

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* AI prompt shortcuts */}
          {(messages.length > 0 ? AGENT_QUICK_ACTIONS.slice(0, 4) : []).map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 text-xs text-muted-foreground hover:text-foreground"
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
        </TooltipProvider>
      </div>

      {/* Input row */}
      <div className="px-4 pb-4 pt-2 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Chiedi qualcosa... (es: Quanti lead dalla Lombardia negli ultimi 3 giorni?)"
          className="min-h-[44px] max-h-[120px] resize-none"
          disabled={isPending}
        />
        <Button
          size="icon"
          onClick={() => onSend(input)}
          disabled={!input.trim() || isPending}
          className="shrink-0"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
