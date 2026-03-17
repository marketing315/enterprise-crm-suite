import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessageWithSender } from "@/hooks/useChat";

interface ChatMessageBubbleProps {
  message: ChatMessageWithSender;
  isOwn: boolean;
  showSenderName?: boolean;
}

export function ChatMessageBubble({ message, isOwn, showSenderName = false }: ChatMessageBubbleProps) {
  const isAI = message.sender_type === "ai";
  const isSystem = message.sender_type === "system";
  const senderName = message.sender?.full_name || "Utente";
  const senderInitial = senderName.charAt(0).toUpperCase();

  // System messages: compact centered style
  if (isSystem) {
    return (
      <div className="flex justify-center py-1 animate-in fade-in-0 duration-200">
        <span className="text-[11px] text-muted-foreground bg-muted/50 rounded-full px-3 py-1 max-w-[80%] text-center">
          {message.message_text}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex gap-2.5 group animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      isOwn ? "flex-row-reverse" : "flex-row"
    )}>
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          "text-[10px] font-medium",
          isAI && "bg-primary/10 text-primary",
          isOwn && "bg-primary text-primary-foreground",
          !isAI && !isOwn && "bg-accent text-accent-foreground"
        )}>
          {isAI ? <Bot className="h-3.5 w-3.5" /> : isOwn ? <User className="h-3.5 w-3.5" /> : senderInitial}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        "max-w-[75%] space-y-0.5",
        isOwn && "items-end"
      )}>
        {/* Sender name for group chats */}
        {showSenderName && !isOwn && (
          <p className={cn(
            "text-[11px] font-medium px-1",
            isAI ? "text-primary" : "text-muted-foreground"
          )}>
            {isAI ? "AI Assistant" : senderName}
          </p>
        )}

        <div className={cn(
          "rounded-2xl px-3.5 py-2.5 transition-colors",
          isOwn && "bg-primary text-primary-foreground rounded-br-md",
          !isOwn && !isAI && "bg-muted rounded-bl-md",
          isAI && "bg-secondary/80 border border-border/50 rounded-bl-md"
        )}>
          {isAI ? (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1.5 [&_p:last-child]:mb-0">
              <ReactMarkdown components={{
                p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => (
                  <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                ),
              }}>{message.message_text}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.message_text}</p>
          )}
        </div>

        {/* Timestamp */}
        <p className={cn(
          "text-[10px] px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          isOwn ? "text-right text-muted-foreground/60" : "text-muted-foreground/60"
        )}>
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: it })}
        </p>
      </div>
    </div>
  );
}
