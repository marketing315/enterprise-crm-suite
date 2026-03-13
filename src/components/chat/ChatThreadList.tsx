import { useState } from "react";
import { Archive, Bot, Loader2, MessageSquare, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChatThreadItem } from "./ChatThreadItem";
import { ChatEmptyState } from "./ChatEmptyState";
import type { ChatThread, UnreadCount } from "@/hooks/useChat";

interface ChatThreadListProps {
  threads: ChatThread[];
  archivedThreads: ChatThread[];
  threadsLoading: boolean;
  archivedLoading: boolean;
  selectedThreadId: string | null;
  unreadCounts: UnreadCount[];
  titleMap: Map<string, string>;
  onSelectThread: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateGroup: () => void;
  onNewAIChat: () => void;
  isCreatingAI?: boolean;
}

export function ChatThreadList({
  threads,
  archivedThreads,
  threadsLoading,
  archivedLoading,
  selectedThreadId,
  unreadCounts,
  titleMap,
  onSelectThread,
  onArchive,
  onUnarchive,
  onDelete,
  onCreateGroup,
  onNewAIChat,
  isCreatingAI,
}: ChatThreadListProps) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const unreadMap = new Map(unreadCounts.map((u) => [u.thread_id, u.unread_count]));

  const filterThreads = (list: ChatThread[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t) => {
      const title = titleMap.get(t.id) || t.title || "";
      return title.toLowerCase().includes(q);
    });
  };

  const filteredActive = filterThreads(threads);
  const filteredArchived = filterThreads(archivedThreads);

  return (
    <div className="w-80 shrink-0 flex flex-col border-r border-border/50 bg-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold tracking-tight">Messaggi</h2>
          <div className="flex gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              onClick={onNewAIChat}
              disabled={isCreatingAI}
              title="Nuova chat AI"
            >
              {isCreatingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              onClick={onCreateGroup}
              title="Nuovo gruppo"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca conversazioni..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
          <button
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all duration-150 flex items-center justify-center gap-1",
              tab === "active"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("active")}
          >
            <MessageSquare className="h-3 w-3" />
            Attive
          </button>
          <button
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all duration-150 flex items-center justify-center gap-1",
              tab === "archived"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("archived")}
          >
            <Archive className="h-3 w-3" />
            Archiviate
            {archivedThreads.length > 0 && (
              <Badge variant="secondary" className="h-4 min-w-[16px] px-1 text-[9px] ml-0.5">
                {archivedThreads.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Thread List */}
      <ScrollArea className="flex-1">
        {tab === "active" ? (
          threadsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredActive.length === 0 ? (
            <ChatEmptyState type="no-threads" onCreateGroup={onCreateGroup} onNewAI={onNewAIChat} />
          ) : (
            <div className="py-1">
              {filteredActive.map((thread) => (
                <ChatThreadItem
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === selectedThreadId}
                  unreadCount={unreadMap.get(thread.id) || 0}
                  displayTitle={titleMap.get(thread.id)}
                  onClick={() => onSelectThread(thread.id)}
                  onArchive={() => onArchive(thread.id)}
                  onDelete={() => onDelete(thread.id)}
                />
              ))}
            </div>
          )
        ) : (
          archivedLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredArchived.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <Archive className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? "Nessun risultato" : "Nessuna conversazione archiviata"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filteredArchived.map((thread) => (
                <ChatThreadItem
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === selectedThreadId}
                  unreadCount={0}
                  displayTitle={titleMap.get(thread.id)}
                  onClick={() => onSelectThread(thread.id)}
                  onUnarchive={() => onUnarchive(thread.id)}
                  onDelete={() => onDelete(thread.id)}
                  isArchived
                />
              ))}
            </div>
          )
        )}
      </ScrollArea>
    </div>
  );
}
