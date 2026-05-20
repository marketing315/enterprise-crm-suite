import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Zap, Play, Trash2, Edit2, History, Clock, Copy, ChevronRight } from "lucide-react";
import {
  useAutomationRules,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  useAutomationLogs,
  useInboundEvents,
  type AutomationRule,
} from "@/hooks/useAutomationRules";
import { AutomationRuleFormDrawer } from "./AutomationRuleFormDrawer";
import { AutomationLogsTable } from "./AutomationLogsTable";
import { InboundEventsTable } from "./InboundEventsTable";
import { AutomationJobsTable } from "./AutomationJobsTable";
import { DuplicateRuleDialog } from "./DuplicateRuleDialog";
import { WorkflowFlowPreview } from "./WorkflowFlowPreview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AutomationSettings() {
  const [activeTab, setActiveTab] = useState("rules");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<AutomationRule | null>(null);
  const [duplicatingRule, setDuplicatingRule] = useState<AutomationRule | null>(null);

  const { data: rules, isLoading: rulesLoading } = useAutomationRules();
  const { data: logs } = useAutomationLogs({ limit: 50 });
  const { data: events } = useInboundEvents({ limit: 50 });
  const updateMutation = useUpdateAutomationRule();
  const deleteMutation = useDeleteAutomationRule();

  const handleToggleActive = (rule: AutomationRule) => {
    updateMutation.mutate(
      { id: rule.id, is_active: !rule.is_active },
      {
        onSuccess: () => toast.success(`Regola ${rule.is_active ? "disattivata" : "attivata"}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormOpen(true);
  };

  const handleDelete = (rule: AutomationRule) => {
    setDeletingRule(rule);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deletingRule) return;
    deleteMutation.mutate(deletingRule.id, {
      onSuccess: () => {
        toast.success("Regola eliminata");
        setDeleteDialogOpen(false);
        setDeletingRule(null);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingRule(null);
  };

  const pendingEvents = events?.filter((e) => e.status === "pending").length ?? 0;
  const failedEvents = events?.filter((e) => e.status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="rules" className="gap-2">
              <Zap className="h-4 w-4" />
              Workflow
              {rules?.length ? (
                <Badge variant="secondary" className="ml-1">
                  {rules.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <History className="h-4 w-4" />
              Esecuzioni
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <Play className="h-4 w-4" />
              Eventi
              {pendingEvents > 0 && (
                <Badge variant="outline" className="ml-1">
                  {pendingEvents}
                </Badge>
              )}
              {failedEvents > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {failedEvents}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <Clock className="h-4 w-4" />
              Job Programmati
            </TabsTrigger>
          </TabsList>

          {activeTab === "rules" && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Workflow
            </Button>
          )}
        </div>

        <TabsContent value="rules" className="mt-4">
          {rulesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : rules?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-1">Nessun workflow configurato</h3>
                <p className="text-muted-foreground text-center text-sm max-w-md mb-6">
                  Crea il tuo primo workflow per automatizzare la gestione dei lead.
                  Supporta branching IF/ELSE, delay, loop e HTTP request.
                </p>
                <Button onClick={() => setFormOpen(true)} size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Crea Workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules?.map((rule) => (
                <Card
                  key={rule.id}
                  className="group hover:shadow-md transition-all duration-200 cursor-pointer border-border/60"
                  onClick={() => handleEdit(rule)}
                >
                  <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <h3 className="font-semibold text-sm truncate">{rule.name}</h3>
                          <Badge
                            variant={rule.is_active ? "default" : "secondary"}
                            className="shrink-0 text-[10px] px-1.5 py-0"
                          >
                            {rule.is_active ? "Attivo" : "Inattivo"}
                          </Badge>
                        </div>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{rule.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => handleToggleActive(rule)}
                          aria-label="Toggle active"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() = aria-label="Copia"> setDuplicatingRule(rule)}
                          title="Duplica"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() = aria-label="Elimina"> handleDelete(rule)}
                          title="Elimina"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 ml-1" />
                      </div>
                    </div>

                    {/* Visual workflow preview */}
                    <div className="mb-3">
                      <WorkflowFlowPreview
                        actions={rule.actions || []}
                        triggerLabel={rule.trigger_event_type || undefined}
                        compact
                      />
                    </div>

                    {/* Footer stats */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">
                          P{rule.priority}
                        </Badge>
                      </span>
                      <span>{rule.actions?.length || 0} nodi</span>
                      <span>{rule.execution_count} esecuzioni</span>
                      {rule.last_executed_at && (
                        <span>
                          Ultima: {new Date(rule.last_executed_at).toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <AutomationLogsTable logs={logs || []} />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <InboundEventsTable events={events || []} />
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Job Programmati</CardTitle>
              <CardDescription>
                Job schedulati per invio automatico a endpoint esterni (es. Keplero)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutomationJobsTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AutomationRuleFormDrawer
        open={formOpen}
        onOpenChange={handleFormClose}
        editingRule={editingRule}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Il workflow "{deletingRule?.name}" verrà eliminato permanentemente. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateRuleDialog
        rule={duplicatingRule as any}
        open={!!duplicatingRule}
        onOpenChange={(open) => !open && setDuplicatingRule(null)}
      />
    </div>
  );
}
