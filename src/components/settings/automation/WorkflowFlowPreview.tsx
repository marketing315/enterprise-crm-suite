import { ACTION_TYPES, type Action } from "@/hooks/useAutomationRules";
import { WorkflowNodeIcon } from "./WorkflowNodeIcon";
import { cn } from "@/lib/utils";
import { ArrowDown, Zap } from "lucide-react";

interface WorkflowFlowPreviewProps {
  actions: Action[];
  triggerLabel?: string;
  compact?: boolean;
}

export function WorkflowFlowPreview({ actions, triggerLabel, compact = false }: WorkflowFlowPreviewProps) {
  if (!actions || actions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Zap className="h-3 w-3" />
        <span>Nessuna azione configurata</span>
      </div>
    );
  }

  const getLabel = (type: string) => {
    return ACTION_TYPES.find((t) => t.value === type)?.label || type;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {triggerLabel && (
          <>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
              <Zap className="h-2.5 w-2.5" />
              Trigger
            </div>
            <ArrowDown className="h-3 w-3 text-muted-foreground/50 rotate-[-90deg]" />
          </>
        )}
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 text-[10px] font-medium">
              <WorkflowNodeIcon type={action.type} size="sm" className="h-4 w-4" />
              <span className="max-w-[80px] truncate">{getLabel(action.type)}</span>
            </div>
            {i < actions.length - 1 && (
              <ArrowDown className="h-3 w-3 text-muted-foreground/40 rotate-[-90deg]" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0">
      {/* Trigger node */}
      {triggerLabel && (
        <>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15">
            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium">{triggerLabel}</span>
          </div>
          <Connector />
        </>
      )}

      {/* Action nodes */}
      {actions.map((action, i) => (
        <div key={i} className="flex flex-col items-start">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-card border border-border/60">
            <WorkflowNodeIcon type={action.type} size="sm" />
            <div className="flex flex-col">
              <span className="text-xs font-medium leading-tight">{getLabel(action.type)}</span>
              {action.type === "if_else" && (
                <span className="text-[10px] text-muted-foreground">
                  Then: {action.then_actions?.length || 0} · Else: {action.else_actions?.length || 0}
                </span>
              )}
              {action.type === "delay" && (
                <span className="text-[10px] text-muted-foreground">
                  {action.delay_value} {action.delay_unit === "seconds" ? "sec" : action.delay_unit === "minutes" ? "min" : "ore"}
                </span>
              )}
              {action.type === "loop" && (
                <span className="text-[10px] text-muted-foreground">
                  {action.loop_actions?.length || 0} azioni · {action.items_path || "..."}
                </span>
              )}
              {action.type === "http_request" && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {action.method || "POST"} {action.url ? new URL(action.url).hostname : "..."}
                </span>
              )}
            </div>
          </div>
          {i < actions.length - 1 && <Connector />}
        </div>
      ))}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center ml-4 h-4">
      <div className="w-px h-full bg-border" />
      <ArrowDown className="h-2.5 w-2.5 text-muted-foreground/40 absolute ml-[-4px]" />
    </div>
  );
}
