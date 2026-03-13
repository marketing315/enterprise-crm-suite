import { Bot, MessageSquare, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatThreadIconProps {
  type: string;
  size?: "sm" | "md";
}

export function ChatThreadIcon({ type, size = "md" }: ChatThreadIconProps) {
  const sizeClass = size === "sm" ? "h-7 w-7 p-1" : "h-9 w-9 p-2";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  
  const base = cn(sizeClass, "rounded-full shrink-0 flex items-center justify-center transition-colors");

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
        <div className={cn(base, "bg-primary/10 text-primary")}>
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
