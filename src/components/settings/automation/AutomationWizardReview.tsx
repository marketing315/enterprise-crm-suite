import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Webhook, Clock, Check, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_TYPES,
  CONDITION_OPERATORS,
  PAYLOAD_FIELDS,
  type Action,
  type ConditionItem,
  type TriggerType,
} from "@/hooks/useAutomationRules";
import { WorkflowNodeIcon } from "./WorkflowNodeIcon";

interface Props {
  name: string;
  description: string;
  triggerType: TriggerType;
  triggerEventType: string;
  cronExpression: string;
  conditions: ConditionItem[];
  actions: Action[];
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  stopOnFailure: boolean;
  setStopOnFailure: (v: boolean) => void;
  priority: number;
  setPriority: (v: number) => void;
}

export function AutomationWizardReview({
  name, description, triggerType, triggerEventType, cronExpression,
  conditions, actions, isActive, setIsActive, stopOnFailure, setStopOnFailure,
  priority, setPriority,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Name & Description summary */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{name || "Senza nome"}</h3>
          <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
            {isActive ? "Attiva" : "Inattiva"}
          </Badge>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      {/* Trigger */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trigger</p>
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            triggerType === "webhook_event" ? "bg-blue-50 dark:bg-blue-950/40" : "bg-orange-50 dark:bg-orange-950/40"
          )}>
            {triggerType === "webhook_event"
              ? <Webhook className="h-5 w-5 text-blue-600" />
              : <Clock className="h-5 w-5 text-orange-600" />
            }
          </div>
          <div>
            <p className="text-sm font-medium">
              {triggerType === "webhook_event" ? "Evento Webhook" : "Schedulato (Cron)"}
            </p>
            <p className="text-xs text-muted-foreground">
              {triggerType === "webhook_event" ? triggerEventType : cronExpression}
            </p>
          </div>
        </div>
      </div>

      {/* Conditions */}
      {conditions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Filtri ({conditions.length})
          </p>
          <div className="rounded-xl border bg-card p-3 space-y-1.5">
            {conditions.map((c, i) => {
              const field = PAYLOAD_FIELDS.find((f) => f.path === c.path);
              const op = CONDITION_OPERATORS.find((o) => o.value === c.op);
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] font-normal">{field?.label || c.path}</Badge>
                  <span className="text-primary font-medium">{op?.label || c.op}</span>
                  {c.value !== undefined && !["exists", "not_exists"].includes(c.op) && (
                    <span className="text-muted-foreground">"{String(c.value)}"</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Workflow flow */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workflow ({actions.length} {actions.length === 1 ? "nodo" : "nodi"})
        </p>
        <div className="rounded-xl border bg-card p-3 space-y-0">
          {actions.map((action, i) => {
            const info = ACTION_TYPES.find((t) => t.value === action.type);
            return (
              <div key={i}>
                {i > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40 rotate-90" />
                  </div>
                )}
                <div className="flex items-center gap-2.5 py-1.5">
                  <WorkflowNodeIcon type={action.type} size="sm" />
                  <span className="text-xs font-medium">{info?.label || action.type}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Settings */}
      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Impostazioni</p>
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
            <div>
              <p className="text-sm font-medium">Stato</p>
              <p className="text-xs text-muted-foreground">Attiva o disattiva il workflow</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
            <div>
              <p className="text-sm font-medium">Ferma su errore</p>
              <p className="text-xs text-muted-foreground">Interrompi se un nodo fallisce</p>
            </div>
            <Switch checked={stopOnFailure} onCheckedChange={setStopOnFailure} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
            <div>
              <p className="text-sm font-medium">Priorità</p>
              <p className="text-xs text-muted-foreground">Ordine di esecuzione (più basso = prima)</p>
            </div>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
              min={1}
              max={1000}
              className="w-20 h-8 text-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
