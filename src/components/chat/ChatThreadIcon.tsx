import { Bot, MessageSquare, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatThreadIconProps {
  type: string;
  size?: "sm" | "md";
}

export function ChatThreadIcon({ type, size = "md" }: ChatThreadIconProps) {
  const sizeClass = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const base = cn(sizeClass, "rounded-xl shrink-0 flex items-center justify-center transition-colors");

  switch (type) {
    case "group":
      return (
        <div className={cn(base, "bg-accent text-accent-foreground")}>
          <Users className={iconSize} />
        </div>
      );
    case "entity":
      return (
        <div className={cn(base, "bg-muted text-muted-foreground")}>
          <MessageSquare className={iconSize} />
        </div>
      );
    case "executive":
      return (
        <div className={cn(base, "bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10")}>
          <Bot className={iconSize} />
        </div>
      );
    default:
      return (
        <div className={cn(base, "bg-muted text-muted-foreground")}>
          <User className={iconSize} />
        </div>
      );
  }
}
