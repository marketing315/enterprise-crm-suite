import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, XCircle,
  FileSearch, Siren, Target, Info, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useSecurityReviews,
  useSecurityFindings,
  useIncidentDrills,
  type SecurityReview,
  type SecurityFinding,
  type IncidentDrill,
} from "@/hooks/useSecurityGovernance";

// ============= Helpers =============

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    planned: { variant: "outline", label: "Pianificata" },
    in_progress: { variant: "secondary", label: "In Corso" },
    completed: { variant: "default", label: "Completata" },
    signed_off: { variant: "default", label: "Firmata" },
    open: { variant: "destructive", label: "Aperto" },
    remediated: { variant: "default", label: "Risolto" },
    accepted_risk: { variant: "secondary", label: "Rischio Accettato" },
  };
  const m = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  };
  return (
    <Badge variant="outline" className={colors[severity] ?? ""}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d), "dd MMM yyyy", { locale: it });
}

// ============= Summary Cards =============

function GovernanceSummary({
  reviews,
  findings,
  drills,
}: {
  reviews: SecurityReview[];
  findings: SecurityFinding[];
  drills: IncidentDrill[];
}) {
  const openFindings = findings.filter(f => f.status === "open" || f.status === "in_progress");
  const criticalOpen = openFindings.filter(f => f.severity === "critical").length;
  const highOpen = openFindings.filter(f => f.severity === "high").length;
  const nextReview = reviews.find(r => r.status === "planned");
  const nextDrill = drills.find(d => d.status === "planned");
  const lastCompleted = reviews.find(r => r.status === "completed" || r.status === "signed_off");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{reviews.length}</p>
              <p className="text-xs text-muted-foreground">Review totali</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${criticalOpen > 0 ? "bg-red-500/10" : highOpen > 0 ? "bg-orange-500/10" : "bg-emerald-500/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${criticalOpen > 0 ? "text-red-600" : highOpen > 0 ? "text-orange-600" : "text-emerald-600"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{openFindings.length}</p>
              <p className="text-xs text-muted-foreground">
                Finding aperti {criticalOpen > 0 && <span className="text-red-600">({criticalOpen} critical)</span>}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/50">
              <Siren className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{drills.filter(d => d.status === "completed").length}</p>
              <p className="text-xs text-muted-foreground">Drill completati</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <Calendar className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {nextReview ? nextReview.quarter : nextDrill ? nextDrill.quarter : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Prossima scadenza</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= Reviews Tab =============

function ReviewsTab({ reviews }: { reviews: SecurityReview[] }) {
  if (reviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna review registrata. Crea la prima review dal playbook.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map(r => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">{r.quarter}</CardTitle>
                {statusBadge(r.status)}
                <Badge variant="outline" className="text-xs">{r.review_type}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm">
              <TooltipProvider>
                <div className="flex items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <span className="font-semibold text-red-600">{r.critical_findings}</span>
                      <span className="text-xs text-muted-foreground">Critical</span>
                    </TooltipTrigger>
                    <TooltipContent>Finding critici</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <span className="font-semibold text-orange-600">{r.high_findings}</span>
                      <span className="text-xs text-muted-foreground">High</span>
                    </TooltipTrigger>
                    <TooltipContent>Finding ad alto impatto</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <span className="font-semibold text-amber-600">{r.medium_findings}</span>
                      <span className="text-xs text-muted-foreground">Medium</span>
                    </TooltipTrigger>
                    <TooltipContent>Finding a medio impatto</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <span className="font-semibold text-blue-600">{r.low_findings}</span>
                      <span className="text-xs text-muted-foreground">Low</span>
                    </TooltipTrigger>
                    <TooltipContent>Finding a basso impatto</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              {r.signed_off_at && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Firmata il {fmtDate(r.signed_off_at)}
                </div>
              )}
            </div>
            {r.summary && (
              <p className="mt-2 text-sm text-muted-foreground">{r.summary}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============= Findings Tab =============

function FindingsTab({ findings }: { findings: SecurityFinding[] }) {
  if (findings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nessun finding registrato.</p>
        </CardContent>
      </Card>
    );
  }

  const grouped = {
    open: findings.filter(f => f.status === "open" || f.status === "in_progress"),
    resolved: findings.filter(f => f.status === "remediated" || f.status === "accepted_risk"),
  };

  return (
    <div className="space-y-6">
      {grouped.open.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            Aperti ({grouped.open.length})
          </h2>
          <div className="space-y-2">
            {grouped.open.map(f => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {grouped.resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Risolti ({grouped.resolved.length})
          </h2>
          <div className="space-y-2">
            {grouped.resolved.map(f => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: SecurityFinding }) {
  const isOverdue = finding.sla_deadline && new Date(finding.sla_deadline) < new Date() && finding.status === "open";

  return (
    <Card className={isOverdue ? "border-red-500/50" : ""}>
      <CardContent className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {severityBadge(finding.severity)}
              {statusBadge(finding.status)}
              {finding.checklist_ref && (
                <Badge variant="outline" className="text-[10px]">{finding.checklist_ref}</Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px]">SLA SCADUTO</Badge>
              )}
            </div>
            <p className="text-sm font-medium">{finding.title}</p>
            {finding.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{finding.description}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            <p>{finding.area}</p>
            {finding.sla_deadline && (
              <p className={isOverdue ? "text-red-600 font-semibold" : ""}>
                SLA: {fmtDate(finding.sla_deadline)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Drills Tab =============

function DrillsTab({ drills }: { drills: IncidentDrill[] }) {
  if (drills.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Siren className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nessun incident drill registrato.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {drills.map(d => (
        <Card key={d.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">{d.scenario_id}: {d.scenario_name}</CardTitle>
                {statusBadge(d.status)}
                <Badge variant="outline" className="text-xs">{d.drill_type}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{d.quarter}</span>
            </div>
          </CardHeader>
          <CardContent>
            {d.status === "completed" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricMini
                  label="TTD"
                  value={d.ttd_minutes != null ? `${d.ttd_minutes} min` : "—"}
                  target="≤ 5 min"
                  ok={d.ttd_minutes != null && d.ttd_minutes <= 5}
                />
                <MetricMini
                  label="TTM"
                  value={d.ttm_minutes != null ? `${d.ttm_minutes} min` : "—"}
                  target="≤ 30 min"
                  ok={d.ttm_minutes != null && d.ttm_minutes <= 30}
                />
                <MetricMini
                  label="Escalation"
                  value={d.escalation_correct == null ? "—" : d.escalation_correct ? "Corretta" : "Errata"}
                  target="100%"
                  ok={d.escalation_correct === true}
                />
                <MetricMini
                  label="Runbook"
                  value={d.runbook_compliance_pct != null ? `${d.runbook_compliance_pct}%` : "—"}
                  target="≥ 90%"
                  ok={d.runbook_compliance_pct != null && d.runbook_compliance_pct >= 90}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {d.scheduled_at ? `Programmato: ${fmtDate(d.scheduled_at)}` : "Data da definire"}
              </div>
            )}
            {d.debrief_notes && (
              <p className="mt-3 text-xs text-muted-foreground border-t pt-2">{d.debrief_notes}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MetricMini({
  label,
  value,
  target,
  ok,
}: {
  label: string;
  value: string;
  target: string;
  ok: boolean;
}) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">Target: {target}</p>
    </div>
  );
}

// ============= Loading =============

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-10 w-64" />
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
}

// ============= Page =============

export default function AdminSecurityReviews() {
  const { isAdmin } = useAuth();
  const { data: reviews, isLoading: loadingReviews } = useSecurityReviews();
  const { data: findings, isLoading: loadingFindings } = useSecurityFindings();
  const { data: drills, isLoading: loadingDrills } = useIncidentDrills();

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const isLoading = loadingReviews || loadingFindings || loadingDrills;

  return (
    <DashboardShell
      title="Security & Governance"
      subtitle="Review trimestrali, finding e incident drill"
      icon={<ShieldCheck className="h-6 w-6 text-primary" />}
      queryKeys={[["security-reviews"], ["security-findings"], ["incident-drills"]]}
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-6">
          <GovernanceSummary
            reviews={reviews ?? []}
            findings={findings ?? []}
            drills={drills ?? []}
          />

          <Tabs defaultValue="reviews" className="w-full">
            <TabsList>
              <TabsTrigger value="reviews" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Review ({reviews?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="findings" className="gap-1.5">
                <FileSearch className="h-3.5 w-3.5" />
                Finding ({findings?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="drills" className="gap-1.5">
                <Siren className="h-3.5 w-3.5" />
                Drill ({drills?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reviews" className="mt-4">
              <ReviewsTab reviews={reviews ?? []} />
            </TabsContent>

            <TabsContent value="findings" className="mt-4">
              <FindingsTab findings={findings ?? []} />
            </TabsContent>

            <TabsContent value="drills" className="mt-4">
              <DrillsTab drills={drills ?? []} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </DashboardShell>
  );
}
