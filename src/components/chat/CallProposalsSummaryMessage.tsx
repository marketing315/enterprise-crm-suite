import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronDown, ChevronUp, Sparkles, CheckCircle2, XCircle, Edit3,
  Phone, User, ArrowRight, Ticket, Calendar, FileText, Target, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CallActionType } from "@/hooks/useCallActionProposals";

interface ProposalSummary {
  action_type: CallActionType;
  action_label: string;
  decision_status: string;
  ai_confidence: number | null;
}

interface CallProposalsSummaryMessageProps {
  message: {
    id: string;
    message_text: string;
    created_at: string;
    ai_context?: {
      message_type: string;
      call_log_id?: string;
      proposals_count?: number;
      approved_count?: number;
      rejected_count?: number;
      proposals?: ProposalSummary[];
    } | null;
  };
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  update_contact: <User className="h-3 w-3" />,
  update_kanban_stage: <ArrowRight className="h-3 w-3" />,
  create_or_update_ticket: <Ticket className="h-3 w-3" />,
  create_or_update_appointment: <Calendar className="h-3 w-3" />,
  create_lead_event: <FileText className="h-3 w-3" />,
  update_deal: <Target className="h-3 w-3" />,
  add_action_suggestion: <Zap className="h-3 w-3" />,
  update_call_log: <Phone className="h-3 w-3" />,
};

export function CallProposalsSummaryMessage({ message }: CallProposalsSummaryMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const ctx = message.ai_context;
  const proposals = ctx?.proposals || [];

  return (
    <div className="flex gap-2 bg-primary/5 -mx-2 px-2 py-1.5 rounded border border-primary/20">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          <Sparkles className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
            AI Post-Call
          </span>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(message.created_at), "HH:mm", { locale: it })}
          </span>
        </div>

        {/* Compact summary line */}
        <div className="flex items-center gap-2 text-xs">
          <span>{message.message_text}</span>
          {ctx && (
            <div className="flex items-center gap-1">
              {(ctx.approved_count ?? 0) > 0 && (
                <Badge className="bg-green-500/20 text-green-700 text-[10px] px-1">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  {ctx.approved_count}
                </Badge>
              )}
              {(ctx.rejected_count ?? 0) > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1">
                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                  {ctx.rejected_count}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Expandable details */}
        {proposals.length > 0 && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1 mt-1 gap-1 text-muted-foreground">
                {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                {expanded ? "Nascondi dettagli" : `${proposals.length} azioni`}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 space-y-1">
                {proposals.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-muted-foreground">{ACTION_ICONS[p.action_type] || <Sparkles className="h-3 w-3" />}</span>
                    <span className="truncate">{p.action_label}</span>
                    {p.decision_status === "approved" || p.decision_status === "edited_then_approved" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                    ) : p.decision_status === "rejected" ? (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    ) : (
                      <Badge variant="outline" className="text-[8px] px-1">attesa</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
