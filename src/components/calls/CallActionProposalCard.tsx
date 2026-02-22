import { useState } from "react";
import {
  CheckCircle2, XCircle, Edit3, Sparkles, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Phone, User, ArrowRight, Ticket, Calendar,
  FileText, Target, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CallActionProposal,
  useDecideProposal,
  CallActionType,
} from "@/hooks/useCallActionProposals";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";

interface CallActionProposalCardProps {
  proposal: CallActionProposal;
}

const ACTION_ICONS: Record<CallActionType, React.ReactNode> = {
  update_contact: <User className="h-4 w-4" />,
  update_kanban_stage: <ArrowRight className="h-4 w-4" />,
  create_or_update_ticket: <Ticket className="h-4 w-4" />,
  create_or_update_appointment: <Calendar className="h-4 w-4" />,
  create_lead_event: <FileText className="h-4 w-4" />,
  update_deal: <Target className="h-4 w-4" />,
  add_action_suggestion: <Zap className="h-4 w-4" />,
  update_call_log: <Phone className="h-4 w-4" />,
};

const ACTION_LABELS: Record<CallActionType, string> = {
  update_contact: "Contatto",
  update_kanban_stage: "Pipeline",
  create_or_update_ticket: "Ticket",
  create_or_update_appointment: "Appuntamento",
  create_lead_event: "Evento Lead",
  update_deal: "Deal",
  add_action_suggestion: "Suggerimento",
  update_call_log: "Log Chiamata",
};

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const variant = pct >= 80 ? "default" : pct >= 50 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0">
      {pct}%
    </Badge>
  );
}

function DiffView({ current, proposed }: { current: Record<string, unknown>; proposed: Record<string, unknown> }) {
  const keys = Object.keys(proposed);
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">Nessuna modifica</p>;

  return (
    <div className="space-y-1">
      {keys.map((key) => {
        const oldVal = current[key];
        const newVal = proposed[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-mono text-muted-foreground min-w-[100px]">{key}:</span>
            {changed ? (
              <div className="flex flex-col">
                {oldVal != null && (
                  <span className="line-through text-destructive/70">{String(oldVal)}</span>
                )}
                <span className="text-primary font-medium">{String(newVal)}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">{String(newVal)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CallActionProposalCard({ proposal }: CallActionProposalCardProps) {
  const { currentBrand } = useBrand();
  const decideProposal = useDecideProposal();
  const [showDetails, setShowDetails] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState(JSON.stringify(proposal.proposed_changes, null, 2));
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isPending = proposal.decision_status === "pending_approval";
  const isDecided = !isPending;
  const isProcessing = decideProposal.isPending;

  const handleApprove = () => {
    if (!currentBrand) return;
    decideProposal.mutate({
      proposalId: proposal.id,
      brandId: currentBrand.id,
      decision: "approved",
    });
  };

  const handleReject = () => {
    if (!currentBrand) return;
    decideProposal.mutate({
      proposalId: proposal.id,
      brandId: currentBrand.id,
      decision: "rejected",
      rejectionReason: rejectReason || undefined,
    });
    setShowRejectInput(false);
  };

  const handleEditApprove = () => {
    if (!currentBrand) return;
    try {
      const parsed = JSON.parse(editedJson);
      decideProposal.mutate({
        proposalId: proposal.id,
        brandId: currentBrand.id,
        decision: "edited_then_approved",
        editedChanges: parsed,
      });
      setEditMode(false);
    } catch {
      // invalid json, user will see syntax error
    }
  };

  const statusBadge = () => {
    switch (proposal.decision_status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-700 text-[10px]">Approvata</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-[10px]">Rifiutata</Badge>;
      case "edited_then_approved":
        return <Badge className="bg-blue-500/20 text-blue-700 text-[10px]">Modificata</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">In attesa</Badge>;
    }
  };

  return (
    <Card className={cn(
      "transition-all",
      isPending && "border-primary/30 shadow-sm",
      proposal.decision_status === "approved" && "border-green-500/30 bg-green-50/30 dark:bg-green-950/10",
      proposal.decision_status === "rejected" && "border-destructive/30 bg-destructive/5 opacity-60",
    )}>
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {ACTION_ICONS[proposal.action_type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{proposal.action_label}</span>
                <Badge variant="secondary" className="text-[10px] px-1">
                  {ACTION_LABELS[proposal.action_type]}
                </Badge>
                <ConfidenceBadge confidence={proposal.ai_confidence} />
                {statusBadge()}
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-3">
            {/* Rationale */}
            {proposal.ai_rationale && (
              <p className="text-xs text-muted-foreground italic">
                <Sparkles className="h-3 w-3 inline mr-1" />
                {proposal.ai_rationale}
              </p>
            )}

            {/* Transcript excerpt */}
            {proposal.transcript_excerpt && (
              <div className="bg-muted/50 rounded p-2">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Estratto trascrizione:</p>
                <p className="text-xs italic">"{proposal.transcript_excerpt}"</p>
              </div>
            )}

            {/* Diff view */}
            {!editMode && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Modifiche proposte:</p>
                <DiffView
                  current={proposal.current_snapshot || {}}
                  proposed={proposal.proposed_changes}
                />
              </div>
            )}

            {/* Edit mode */}
            {editMode && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Modifica JSON:</p>
                <Textarea
                  value={editedJson}
                  onChange={(e) => setEditedJson(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                />
              </div>
            )}

            {/* Reject reason input */}
            {showRejectInput && (
              <div>
                <Textarea
                  placeholder="Motivo del rifiuto (opzionale)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>
            )}

            {/* Action buttons */}
            {isPending && (
              <div className="flex items-center gap-2 pt-1">
                {!editMode && !showRejectInput && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleApprove}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approva
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => setEditMode(true)}
                      disabled={isProcessing}
                    >
                      <Edit3 className="h-3 w-3" />
                      Modifica
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs gap-1"
                      onClick={() => setShowRejectInput(true)}
                      disabled={isProcessing}
                    >
                      <XCircle className="h-3 w-3" />
                      Rifiuta
                    </Button>
                  </>
                )}

                {editMode && (
                  <>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={handleEditApprove} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Salva & Approva
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditMode(false)}>
                      Annulla
                    </Button>
                  </>
                )}

                {showRejectInput && (
                  <>
                    <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleReject} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      Conferma Rifiuto
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowRejectInput(false)}>
                      Annulla
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
