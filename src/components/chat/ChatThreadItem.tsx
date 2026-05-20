import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Archive, ArchiveRestore, MoreVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChatThreadIcon } from "./ChatThreadIcon";
import type { ChatThread } from "@/hooks/useChat";
import { onActivateKey } from "@/lib/a11y";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  contact: "Contatto",
  deal: "Deal",
  ticket: "Ticket",
  appointment: "Appuntamento",
};

function getThreadDefaultTitle(thread: ChatThread): string {
  if (thread.type === "executive") return "Agente AI Executive";
  if (thread.type === "group") return "Gruppo";
  if (thread.type === "entity" && thread.entity_type) {
    return ENTITY_TYPE_LABELS[thread.entity_type] || thread.entity_type;
  }
  return "Conversazione";
}

function getThreadSubtitle(thread: ChatThread): string {
  if (thread.type === "executive") return "AI Premium";
  if (thread.entity_type) return ENTITY_TYPE_LABELS[thread.entity_type] || thread.entity_type;
  if (thread.type === "group") return "Gruppo";
  return "Chat";
}

interface ChatThreadItemProps {
  thread: ChatThread;
  isSelected: boolean;
  unreadCount: number;
  displayTitle?: string;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
  isArchived?: boolean;
}

export function ChatThreadItem({
  thread,
  isSelected,
  unreadCount,
  displayTitle,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  isArchived = false,
}: ChatThreadItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "w-full px-3 py-2.5 flex gap-3 cursor-pointer group relative transition-all duration-150",
        "hover:bg-accent/50 active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "bg-accent border-l-2 border-l-primary",
        !isSelected && "border-l-2 border-l-transparent"
      )}
      onClick={onClick}
      onKeyDown={onActivateKey(() => onClick?.())}
    >
      <ChatThreadIcon type={thread.type} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            "text-sm truncate leading-tight",
            unreadCount > 0 && "font-semibold text-foreground",
            !unreadCount && "text-foreground/80"
          )}>
            {displayTitle || thread.title || getThreadDefaultTitle(thread)}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium px-1.5 animate-in zoom-in-50 duration-200">
                {unreadCount}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Altre azioni conversazione"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {isArchived && onUnarchive ? (
                  <DropdownMenuItem onClick={onUnarchive}>
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Ripristina
                  </DropdownMenuItem>
                ) : onArchive ? (
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archivia
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-muted-foreground">
            {getThreadSubtitle(thread)}
          </span>
          <span className="text-[10px] text-muted-foreground/40">·</span>
          <span className="text-[10px] text-muted-foreground/60">
            {formatDistanceToNow(new Date(thread.updated_at), { addSuffix: true, locale: it })}
          </span>
        </div>
      </div>
    </div>
  );
}
