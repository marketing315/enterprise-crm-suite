import { User, Bot, Zap, Key } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditActorBadgeProps {
  actorType: string;
  displayName: string | null;
}

const actorConfig: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  user: { icon: User, label: "Utente", className: "text-foreground" },
  system: { icon: Bot, label: "Sistema", className: "text-muted-foreground" },
  automation: { icon: Zap, label: "Automazione", className: "text-amber-600" },
  api_key: { icon: Key, label: "API", className: "text-blue-600" },
};

export function AuditActorBadge({ actorType, displayName }: AuditActorBadgeProps) {
  const config = actorConfig[actorType] || actorConfig.system;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1.5 text-sm", config.className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[180px]">
        {displayName || config.label}
      </span>
    </div>
  );
}
