import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  Bot,
  MessageSquare,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Segmented,
  EmptyState,
  ErrorState,
  PullToRefresh,
  MobileListSkeleton,
  type ChipOption,
} from "@/components/mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { AgentChatPanel } from "@/components/chat/AgentChatPanel";
import {
  useChatThreads,
  useChatMessages,
  useSendChatMessage,
  useChatRealtime,
  useUnreadCounts,
  useMarkThreadRead,
  useThreadDisplayTitles,
  type ChatThread,
} from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type TabKey = "threads" | "agent";

function initials(label: string): string {
  return label
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function MobileChatView() {
  const { user } = useAuth();
  const { hasBrandSelected } = useBrand();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const threadIdFromUrl = searchParams.get("thread");
  const [tab, setTab] = useState<TabKey>(
    (searchParams.get("tab") as TabKey) || "threads",
  );
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const { data: threads = [], isLoading, isError, error, refetch } =
    useChatThreads();
  const { data: unreadCounts = [] } = useUnreadCounts();
  const threadIds = useMemo(() => threads.map((t) => t.id), [threads]);
  const { data: titleMap = new Map() } = useThreadDisplayTitles(threadIds);

  const selectedThreadId = threadIdFromUrl;
  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    selectedThreadId || "",
  );
  const sendMessage = useSendChatMessage();
  const { subscribeToMessages } = useChatRealtime(selectedThreadId);
  const markRead = useMarkThreadRead();

  // Realtime subscription on selected thread
  useEffect(() => {
    if (!selectedThreadId) return;
    const unsub = subscribeToMessages();
    return () => unsub();
  }, [selectedThreadId, subscribeToMessages]);

  // Mark thread as read on open
  useEffect(() => {
    if (selectedThreadId) markRead.mutate(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  // Auto-scroll on new messages
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedThreadId]);

  const openThread = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("thread", id);
    next.set("tab", "threads");
    setSearchParams(next, { replace: false });
  };

  const closeThread = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("thread");
    setSearchParams(next, { replace: false });
  };

  const onTabChange = (v: TabKey) => {
    setTab(v);
    const next = new URLSearchParams(searchParams);
    if (v === "agent") {
      next.set("tab", "agent");
      next.delete("thread");
    } else {
      next.delete("tab");
    }
    setSearchParams(next, { replace: true });
  };

  const totalUnread = unreadCounts.reduce((s, u) => s + u.unread_count, 0);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const title = titleMap.get(t.id) || t.title || "";
      return title.toLowerCase().includes(q);
    });
  }, [threads, titleMap, search]);

  const unreadFor = (id: string) =>
    unreadCounts.find((u) => u.thread_id === id)?.unread_count ?? 0;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text || !selectedThreadId) return;
    setMessageInput("");
    try {
      await sendMessage.mutateAsync({
        threadId: selectedThreadId,
        messageText: text,
      });
    } catch {
      toast.error("Errore nell'invio del messaggio");
      setMessageInput(text);
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    await queryClient.invalidateQueries({ queryKey: ["chat-unread-counts"] });
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <EmptyState
          icon={MessageSquare}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla sidebar per accedere alla chat."
        />
      </div>
    );
  }

  // ─── Thread full-screen view ───
  if (tab === "threads" && selectedThread) {
    const title =
      titleMap.get(selectedThread.id) ||
      selectedThread.title ||
      "Conversazione";
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Thread header */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/40 bg-background/90 px-2 py-2 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="press-scale h-10 w-10 shrink-0"
            onClick={closeThread}
            aria-label="Torna alle conversazioni"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-muted text-xs font-medium">
              {selectedThread.type === "executive" ? (
                <Bot className="h-4 w-4" />
              ) : (
                initials(title)
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {title}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedThread.type === "group"
                ? "Gruppo"
                : selectedThread.type === "entity"
                  ? "Conversazione collegata"
                  : selectedThread.type === "executive"
                    ? "Agente AI"
                    : "Diretta"}
            </p>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {messagesLoading ? (
            <MobileListSkeleton count={4} />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="Nessun messaggio"
              description="Scrivi il primo messaggio qui sotto."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m, idx) => {
                const prev = messages[idx - 1];
                const showSenderName =
                  selectedThread.type === "group" &&
                  m.sender_type === "user" &&
                  (!prev || prev.sender_user_id !== m.sender_user_id);
                return (
                  <li key={m.id}>
                    <ChatMessageBubble
                      message={m}
                      isOwn={m.sender_user_id === user?.id}
                      showSenderName={showSenderName}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Composer (sticky above safe-area + tab bar) */}
        <form
          onSubmit={handleSend}
          className="sticky bottom-0 z-20 border-t border-border/40 bg-background/95 px-3 pb-safe pt-2 backdrop-blur-xl"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Scrivi un messaggio…"
              rows={1}
              className="max-h-32 min-h-[44px] resize-none rounded-2xl bg-muted/60 px-4 py-2.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(e as unknown as React.FormEvent);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="press-scale h-11 w-11 shrink-0 rounded-full"
              disabled={!messageInput.trim() || sendMessage.isPending}
              aria-label="Invia messaggio"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ─── Agent tab (full-screen panel) ───
  if (tab === "agent") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
              <p className="truncate text-xs text-muted-foreground">
                Parla con l'Agente AI
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Segmented<TabKey>
              options={tabOptions(totalUnread)}
              value={tab}
              onChange={onTabChange}
              ariaLabel="Modalità chat"
              asTabs
            />
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <AgentChatPanel />
        </div>
      </div>
    );
  }

  // ─── Threads list view ───
  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-3 pb-24">
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
              <p className="truncate text-xs text-muted-foreground">
                {isLoading ? (
                  "Caricamento…"
                ) : (
                  <>
                    <span className="tabular-nums">{threads.length}</span>{" "}
                    {threads.length === 1 ? "conversazione" : "conversazioni"}
                    {totalUnread > 0 && (
                      <>
                        {" · "}
                        <span className="font-medium text-foreground">
                          {totalUnread} da leggere
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <Segmented<TabKey>
              options={tabOptions(totalUnread)}
              value={tab}
              onChange={onTabChange}
              ariaLabel="Modalità chat"
              asTabs
            />
          </div>

          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca conversazione…"
              className="h-10 rounded-full bg-muted/60 pl-9 pr-9 text-sm"
              aria-label="Cerca conversazione"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="press-scale absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground"
                aria-label="Pulisci ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {isError ? (
          <div className="px-4">
            <ErrorState
              title="Errore caricamento conversazioni"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => {
                void refetch();
              }}
            />
          </div>
        ) : isLoading ? (
          <div className="px-4">
            <MobileListSkeleton count={6} />
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={MessageSquare}
              title={search ? "Nessun risultato" : "Nessuna conversazione"}
              description={
                search
                  ? "Prova un altro termine di ricerca."
                  : "Le conversazioni con il team appariranno qui."
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col px-2" aria-label="Conversazioni">
            {filteredThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                title={titleMap.get(t.id) || t.title || "Conversazione"}
                unread={unreadFor(t.id)}
                onOpen={() => openThread(t.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </PullToRefresh>
  );
}

function tabOptions(totalUnread: number): ChipOption<TabKey>[] {
  return [
    {
      value: "threads",
      label: "Conversazioni",
      count: totalUnread > 0 ? totalUnread : undefined,
    },
    { value: "agent", label: "Agente AI" },
  ];
}

interface ThreadRowProps {
  thread: ChatThread;
  title: string;
  unread: number;
  onOpen: () => void;
}

function ThreadRow({ thread, title, unread, onOpen }: ThreadRowProps) {
  const isAI = thread.type === "executive";
  const isGroup = thread.type === "group";
  const updatedRel = formatDistanceToNow(new Date(thread.updated_at), {
    addSuffix: true,
    locale: it,
  });
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "press-scale flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={`Apri conversazione ${title}`}
      >
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarFallback
            className={cn(
              "text-xs font-medium",
              isAI ? "bg-primary/15 text-primary" : "bg-muted",
            )}
          >
            {isAI ? <Bot className="h-5 w-5" /> : initials(title)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{title}</span>
            {isGroup && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Gruppo
              </Badge>
            )}
            {isAI && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                AI
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="tabular-nums">{updatedRel}</span>
          </p>
        </div>
        {unread > 0 && (
          <span
            className="ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium tabular-nums text-primary-foreground"
            aria-label={`${unread} non letti`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </li>
  );
}

export default MobileChatView;
