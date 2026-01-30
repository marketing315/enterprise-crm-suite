import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssignedBy } from "@/types/database";

interface TagBadgeProps {
  name: string;
  color?: string;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
  assignedBy?: AssignedBy;
  confidence?: number | null;
}

export function TagBadge({ 
  name, 
  color = "#6366f1", 
  onRemove, 
  size = "md",
  className,
  assignedBy,
  confidence,
}: TagBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };

  const isAI = assignedBy === "ai";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium transition-colors",
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
      title={isAI && confidence ? `Suggerito da AI (${Math.round(confidence * 100)}% confidence)` : undefined}
    >
      {isAI && (
        <Sparkles className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate max-w-[120px]">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}