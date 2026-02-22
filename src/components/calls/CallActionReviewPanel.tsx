import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CallActionProposalCard } from "./CallActionProposalCard";
import {
  useCallActionProposals,
  useGenerateCallProposals,
  useDecideProposal,
} from "@/hooks/useCallActionProposals";
import { useBrand } from "@/contexts/BrandContext";

interface CallActionReviewPanelProps {
  callLogId: string;
  className?: string;
}

export function CallActionReviewPanel({ callLogId, className }: CallActionReviewPanelProps) {
  const { currentBrand } = useBrand();
  const { data: proposals = [], isLoading } = useCallActionProposals(callLogId);
  const generateProposals = useGenerateCallProposals();
  const decideProposal = useDecideProposal();

  const pendingCount = proposals.filter(p => p.decision_status === "pending_approval").length;
  const approvedCount = proposals.filter(p =>
    p.decision_status === "approved" || p.decision_status === "edited_then_approved"
  ).length;
  const rejectedCount = proposals.filter(p => p.decision_status === "rejected").length;

  const handleGenerate = () => {
    if (!currentBrand) return;
    generateProposals.mutate({ callLogId, brandId: currentBrand.id });
  };

  const handleBulkApprove = () => {
    if (!currentBrand) return;
    const pending = proposals.filter(p => p.decision_status === "pending_approval");
    pending.forEach(p => {
      decideProposal.mutate({
        proposalId: p.id,
        brandId: currentBrand.id,
        decision: "approved",
      });
    });
  };

  return (
    <Card className={className}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Proposte AI Post-Chiamata
          </CardTitle>
          <div className="flex items-center gap-2">
            {proposals.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                {pendingCount > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1">{pendingCount} in attesa</Badge>
                )}
                {approvedCount > 0 && (
                  <Badge className="bg-green-500/20 text-green-700 text-[10px] px-1">{approvedCount} ✓</Badge>
                )}
                {rejectedCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1">{rejectedCount} ✗</Badge>
                )}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleGenerate}
              disabled={generateProposals.isPending}
            >
              {generateProposals.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : proposals.length > 0 ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {proposals.length > 0 ? "Rigenera" : "Analizza"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-6">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Clicca "Analizza" per generare proposte AI dalla trascrizione.
            </p>
          </div>
        ) : (
          <>
            {/* Bulk actions */}
            {pendingCount > 1 && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleBulkApprove}
                  disabled={decideProposal.isPending}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Approva tutte ({pendingCount})
                </Button>
              </div>
            )}

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {proposals.map((proposal) => (
                  <CallActionProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
