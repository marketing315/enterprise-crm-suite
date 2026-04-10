import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  create: { label: "Creato", variant: "default" },
  update: { label: "Modificato", variant: "secondary" },
  delete: { label: "Eliminato", variant: "destructive" },
  status_change: { label: "Cambio stato", variant: "outline" },
  stage_change: { label: "Cambio fase", variant: "outline" },
  assign: { label: "Assegnato", variant: "secondary" },
  unassign: { label: "Rimosso assegnazione", variant: "secondary" },
  tag_added: { label: "Tag aggiunto", variant: "secondary" },
  tag_removed: { label: "Tag rimosso", variant: "secondary" },
  bulk_update: { label: "Aggiornamento massivo", variant: "secondary" },
  permission_change: { label: "Permessi modificati", variant: "outline" },
  settings_change: { label: "Impostazioni cambiate", variant: "outline" },
  system_action: { label: "Azione sistema", variant: "outline" },
};

export function AuditActionTag({ action }: { action: string }) {
  const config = actionLabels[action] || { label: action, variant: "outline" as const };
  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}
