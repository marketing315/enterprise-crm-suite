import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Zap, Play, Trash2, Edit2, History, Clock, Copy } from "lucide-react";
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
              Regole
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
              Nuova Regola
            </Button>
          )}
        </div>

        <TabsContent value="rules" className="mt-4">
          {rulesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : rules?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Nessuna regola di automazione configurata.
                  <br />
                  Crea la prima per iniziare ad automatizzare i webhook.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules?.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">{rule.name}</CardTitle>
                        <Badge variant={rule.is_active ? "default" : "secondary"}>
                          {rule.is_active ? "Attiva" : "Inattiva"}
                        </Badge>
                        <Badge variant="outline">{rule.trigger_event_type}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => handleToggleActive(rule)}
                          aria-label="Toggle active"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(rule)}
                          title="Modifica"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(rule)}
                          title="Elimina"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {rule.description && (
                      <CardDescription>{rule.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Priorità: {rule.priority}</span>
                      <span>Azioni: {rule.actions?.length || 0}</span>
                      <span>Esecuzioni: {rule.execution_count}</span>
                      {rule.last_executed_at && (
                        <span>
                          Ultima: {new Date(rule.last_executed_at).toLocaleString("it-IT")}
                        </span>
                      )}
                    </div>
                  </CardContent>
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
      </Tabs>

      <AutomationRuleFormDrawer
        open={formOpen}
        onOpenChange={handleFormClose}
        editingRule={editingRule}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa regola?</AlertDialogTitle>
            <AlertDialogDescription>
              La regola "{deletingRule?.name}" verrà eliminata permanentemente. Questa azione non può essere annullata.
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
    </div>
  );
}
