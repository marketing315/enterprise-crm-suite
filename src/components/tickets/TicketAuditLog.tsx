import { format } from "date-fns";
import { it } from "date-fns/locale";
import { 
  History, 
  UserCheck, 
  ArrowRightLeft, 
  Flag, 
  Tag, 
  MessageSquare,
  Plus,
  Bot,
  User
} from "lucide-react";
import { useTicketAuditLogs, type TicketAuditLog as TicketAuditLogType, type TicketAuditAction } from "@/hooks/useTicketAuditLogs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface TicketAuditLogProps {
  ticketId: string | null;
}

const actionConfig: Record<TicketAuditAction, {
  icon: React.ComponentType<{ className?: string }>; 
  label: string; 
  color: string;
}> = {
  created: { icon: Plus, label: "Creato", color: "bg-green-500" },
  status_change: { icon: ArrowRightLeft, label: "Cambio Stato", color: "bg-blue-500" },
  assignment_change: { icon: UserCheck, label: "Assegnazione", color: "bg-purple-500" },
  priority_change: { icon: Flag, label: "Priorità", color: "bg-orange-500" },
  category_change: { icon: Tag, label: "Categoria", color: "bg-teal-500" },
  comment_added: { icon: MessageSquare, label: "Commento", color: "bg-gray-500" },
};

const statusLabels: Record<string, string> = {
  open: "Aperto",
  in_progress: "In Lavorazione",
  resolved: "Risolto",
  closed: "Chiuso",
  reopened: "Riaperto",
};

const priorityLabels: Record<number, string> = {
  1: "Alta",
  2: "Media-Alta",
  3: "Media",
  4: "Bassa",
  5: "Minima",
};

function formatAuditDetails(log: TicketAuditLogType): string {
  const { action_type, old_value, new_value, metadata } = log;

  switch (action_type) {
    case "created": {
      const createdBy = metadata?.created_by as string | undefined;
      if (createdBy === "ai") return "Ticket creato automaticamente dall'AI";
      if (createdBy === "rule") return "Ticket creato da regola automatica";
      return "Ticket creato manualmente";
    }
    case "status_change": {
      const oldStatus = old_value?.status as string;
      const newStatus = new_value?.status as string;
      return `${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`;
    }
    case "assignment_change": {
      const isAuto = metadata?.is_auto as boolean | undefined;
      if (isAuto) return "Assegnato automaticamente (Round Robin)";
      if (!new_value?.assigned_to_user_id) return "Rimosso assegnatario";
      return "Riassegnato manualmente";
    }
    case "priority_change": {
      const oldPriority = old_value?.priority as number;
      const newPriority = new_value?.priority as number;
      return `Priorità ${priorityLabels[oldPriority] || oldPriority} → ${priorityLabels[newPriority] || newPriority}`;
    }
    case "category_change": {
      if (!new_value?.category_tag_id) return "Categoria rimossa";
      if (!old_value?.category_tag_id) return "Categoria assegnata";
      return "Categoria modificata";
    }
    case "comment_added":
      return "Nuovo commento interno";
    default:
      return "";
  }
}

function AuditLogItem({ log }: { log: TicketAuditLogType }) {
  const config = actionConfig[log.action_type];
  const Icon = config.icon;
  const isAuto = log.action_type === "assignment_change" && log.metadata?.is_auto;
  const isAiCreated = log.action_type === "created" && log.metadata?.created_by === "ai";

  return (
    <div className="flex gap-3 py-3 border-b last:border-b-0">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.color} flex items-center justify-center`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {config.label}
          </Badge>
          {(isAuto || isAiCreated) && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Bot className="h-3 w-3" />
              Auto
            </Badge>
          )}
        </div>
        <p className="text-sm text-foreground mt-1">
          {formatAuditDetails(log)}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {log.users ? (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {log.users.full_name || log.users.email}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              Sistema
            </span>
          )}
          <span>•</span>
          <span>
            {format(new Date(log.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TicketAuditLog({ ticketId }: TicketAuditLogProps) {
  const { data: auditLogs, isLoading } = useTicketAuditLogs(ticketId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          Nessun evento registrato
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-0">
        {auditLogs.map((log) => (
          <AuditLogItem key={log.id} log={log} />
        ))}
      </div>
    </ScrollArea>
  );
}
