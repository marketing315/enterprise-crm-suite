import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/useChat";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function ChatMessageBubble({ message, isOwn }: ChatMessageBubbleProps) {
  const isAI = message.sender_type === "ai";

  return (
    <div className={cn(
      "flex gap-2.5 group animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      isOwn ? "flex-row-reverse" : "flex-row"
    )}>
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          "text-[10px]",
          isAI && "bg-primary/10 text-primary",
          isOwn && "bg-primary text-primary-foreground"
        )}>
          {isAI ? <Bot className="h-3.5 w-3.5" /> : isOwn ? "Tu" : "U"}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-3.5 py-2.5 transition-colors",
        isOwn && "bg-primary text-primary-foreground rounded-br-md",
        !isOwn && !isAI && "bg-muted rounded-bl-md",
        isAI && "bg-secondary/80 border border-border/50 rounded-bl-md"
      )}>
        {isAI ? (
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1.5 [&_p:last-child]:mb-0">
            <ReactMarkdown>{message.message_text}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.message_text}</p>
        )}
        <p className={cn(
          "text-[10px] mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
          isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
        )}>
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: it })}
        </p>
      </div>
    </div>
  );
}
