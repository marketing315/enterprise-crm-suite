import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Sparkles, Loader2, ChevronDown, Clock, Check, GitBranch, Timer, Repeat, Globe } from "lucide-react";
import {
  useCreateAutomationRule,
  useUpdateAutomationRule,
  ACTION_TYPES,
  PAYLOAD_FIELDS,
  TRIGGER_TYPES,
  COMMON_CRON_EXPRESSIONS,
  type AutomationRule,
  type Action,
  type Conditions,
  type ConditionItem,
  type TriggerType,
  type DelayUnit,
  type HttpMethod,
  CONDITION_OPERATORS,
} from "@/hooks/useAutomationRules";
 import { useAutomationEventTypes } from "@/hooks/useInboundSources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useTags } from "@/hooks/useTags";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: AutomationRule | null;
   defaultEventType?: string;
   defaultSource?: string;
}

 export function AutomationRuleFormDrawer({ 
   open, 
   onOpenChange, 
   editingRule,
   defaultEventType,
   defaultSource,
 }: Props) {
  const createMutation = useCreateAutomationRule();
  const updateMutation = useUpdateAutomationRule();
   const { eventTypes: AUTOMATION_EVENT_TYPES } = useAutomationEventTypes();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("webhook_event");
  const [triggerEventType, setTriggerEventType] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [priority, setPriority] = useState(100);
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  
  // AI generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSectionOpen, setAiSectionOpen] = useState(false);

  // Reset form when opening/closing or changing edit target
  useEffect(() => {
    if (open) {
      if (editingRule) {
        setName(editingRule.name);
        setDescription(editingRule.description || "");
        setTriggerType((editingRule.trigger_type as TriggerType) || "webhook_event");
        setTriggerEventType(editingRule.trigger_event_type || "");
        setCronExpression(editingRule.cron_expression || "");
        setIsActive(editingRule.is_active);
        setStopOnFailure(editingRule.stop_on_failure);
        setPriority(editingRule.priority);
        setConditions(editingRule.conditions?.all || []);
        setActions(editingRule.actions || []);
        setAiPrompt("");
        setAiSectionOpen(false);
      } else {
        setName("");
        setDescription("");
        setTriggerType("webhook_event");
         setTriggerEventType(defaultEventType || "");
        setCronExpression("");
        setIsActive(true);
        setStopOnFailure(true);
        setPriority(100);
        setConditions([]);
        setActions([]);
        setAiPrompt("");
        setAiSectionOpen(!defaultEventType); // Open AI section if no default event type
      }
    }
   }, [open, editingRule, defaultEventType]);

  const handleAddCondition = () => {
    setConditions([...conditions, { path: "", op: "exists" }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, field: keyof ConditionItem, value: unknown) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const handleAddAction = () => {
    setActions([...actions, { type: "upsert_contact" }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, updates: Partial<Action>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    setActions(newActions);
  };

  const handleGenerateFromAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Inserisci una descrizione dell'automazione");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-automation", {
        body: {
          prompt: aiPrompt,
          eventTypes: AUTOMATION_EVENT_TYPES,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const automation = data.automation;

      // Apply generated config to form
      setName(automation.name || "");
      setDescription(automation.description || "");
      setTriggerType(automation.trigger_type || "webhook_event");
      setTriggerEventType(automation.trigger_event_type || "");
      setCronExpression(automation.cron_expression || "");
      setConditions(automation.conditions?.all || []);
      setActions(automation.actions || []);
      setStopOnFailure(automation.stop_on_failure ?? true);
      setPriority(automation.priority || 100);

      toast.success("Automazione generata! Rivedi e modifica se necessario.");
      setAiSectionOpen(false);
    } catch (e) {
      console.error("AI generation error:", e);
      toast.error(e instanceof Error ? e.message : "Errore generazione AI");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Nome obbligatorio");
      return;
    }
    if (triggerType === "webhook_event" && !triggerEventType) {
      toast.error("Seleziona un evento trigger per webhook");
      return;
    }
    if (triggerType === "cron" && !cronExpression) {
      toast.error("Inserisci un'espressione cron");
      return;
    }
    if (actions.length === 0) {
      toast.error("Aggiungi almeno un'azione");
      return;
    }

    const conditionsObj: Conditions = conditions.length > 0 ? { all: conditions } : {};

    try {
      if (editingRule) {
        await updateMutation.mutateAsync({
          id: editingRule.id,
          name,
          description: description || undefined,
          trigger_type: triggerType,
          trigger_event_type: triggerType === "webhook_event" ? triggerEventType : undefined,
           trigger_source: defaultSource || undefined,
          cron_expression: triggerType === "cron" ? cronExpression : undefined,
          conditions: conditionsObj,
          actions,
          stop_on_failure: stopOnFailure,
          priority,
          is_active: isActive,
        });
        toast.success("Regola aggiornata");
      } else {
        await createMutation.mutateAsync({
          name,
          description: description || undefined,
          trigger_type: triggerType,
          trigger_event_type: triggerType === "webhook_event" ? triggerEventType : "cron.scheduled",
           trigger_source: defaultSource || undefined,
          cron_expression: triggerType === "cron" ? cronExpression : undefined,
          conditions: conditionsObj,
          actions,
          stop_on_failure: stopOnFailure,
          priority,
          is_active: isActive,
        });
        toast.success("Regola creata");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editingRule ? "Modifica Regola" : "Nuova Regola"}</SheetTitle>
          <SheetDescription>
            Configura un'automazione da webhook o schedulata
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* AI Generation Section */}
          {!editingRule && (
            <Collapsible open={aiSectionOpen} onOpenChange={setAiSectionOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full justify-between bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Genera con AI
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${aiSectionOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <Textarea
                  placeholder="Descrivi cosa vuoi automatizzare in linguaggio naturale...&#10;&#10;Esempio: Quando arriva un ricontatto da Keplero, crea il contatto con nome e telefono, tagga come 'ricontatto' e imposta la richiesta di callback"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <Button
                  type="button"
                  onClick={handleGenerateFromAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Genera Automazione
                    </>
                  )}
                </Button>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Regola *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es: Keplero Ricontatto → Crea Contatto"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrizione opzionale..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo Trigger *</Label>
                <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priorità</Label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
                  min={1}
                  max={1000}
                />
              </div>
            </div>

            {/* Webhook Event Trigger */}
            {triggerType === "webhook_event" && (
              <div className="space-y-2">
                <Label>Evento Trigger *</Label>
                <Select value={triggerEventType} onValueChange={setTriggerEventType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona evento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_EVENT_TYPES.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cron Trigger */}
            {triggerType === "cron" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Espressione Cron *
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={COMMON_CRON_EXPRESSIONS.find((c) => c.value === cronExpression)?.value || "custom"}
                    onValueChange={(v) => {
                      if (v !== "custom") setCronExpression(v);
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Preset..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CRON_EXPRESSIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Personalizzato</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1 font-mono"
                    placeholder="* * * * * (min hour day month weekday)"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Formato: minuto (0-59) ora (0-23) giorno (1-31) mese (1-12) giorno settimana (0-6)
                </p>
              </div>
            )}

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
                <Label htmlFor="is-active">Attiva</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={stopOnFailure} onCheckedChange={setStopOnFailure} id="stop-on-failure" />
                <Label htmlFor="stop-on-failure">Ferma su errore</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Conditions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Condizioni (opzionale)</Label>
              <Button variant="outline" size="sm" onClick={handleAddCondition}>
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            </div>

            {conditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna condizione = si attiva sempre quando arriva l'evento
              </p>
            ) : (
              <div className="space-y-2">
                {conditions.map((condition, index) => (
                  <Card key={index} className="p-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={condition.path}
                        onValueChange={(v) => handleConditionChange(index, "path", v)}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Campo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYLOAD_FIELDS.map((field) => (
                            <SelectItem key={field.path} value={field.path}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={condition.op}
                        onValueChange={(v) => handleConditionChange(index, "op", v)}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {!["exists", "not_exists"].includes(condition.op) && (
                        <Input
                          className="flex-1"
                          placeholder="Valore..."
                          value={String(condition.value || "")}
                          onChange={(e) => handleConditionChange(index, "value", e.target.value)}
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCondition(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Azioni *</Label>
              <Button variant="outline" size="sm" onClick={handleAddAction}>
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            </div>

            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aggiungi almeno un'azione da eseguire
              </p>
            ) : (
              <div className="space-y-3">
                {actions.map((action, index) => (
                  <Card key={index}>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline">{index + 1}</Badge>
                          <Select
                            value={action.type}
                            onValueChange={(v) => handleActionChange(index, { type: v as Action["type"] })}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_TYPES.map((at) => (
                                <SelectItem key={at.value} value={at.value}>
                                  {at.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveAction(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <ActionFields
                        action={action}
                        onChange={(updates) => handleActionChange(index, updates)}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Annulla
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? "Salvataggio..." : editingRule ? "Salva Modifiche" : "Crea Regola"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Reusable nested action list for IF/ELSE branches and Loop
function NestedActionList({
  actions,
  onChange,
  label,
  depth = 1,
}: {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  label: string;
  depth?: number;
}) {
  if (depth > 3) return <p className="text-xs text-destructive">Nidificazione massima raggiunta (3 livelli)</p>;

  const handleAdd = () => onChange([...actions, { type: "upsert_contact" }]);
  const handleRemove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));
  const handleChange = (i: number, updates: Partial<Action>) => {
    const updated = [...actions];
    updated[i] = { ...updated[i], ...updates };
    onChange(updated);
  };

  return (
    <div className={cn("space-y-2 border-l-2 border-muted pl-3", depth > 1 && "ml-2")}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" type="button" onClick={handleAdd} className="h-6 px-2">
          <Plus className="h-3 w-3 mr-1" />
          Aggiungi
        </Button>
      </div>
      {actions.map((action, i) => (
        <Card key={i} className="p-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1">{i + 1}</Badge>
              <Select
                value={action.type}
                onValueChange={(v) => handleChange(i, { type: v as Action["type"] })}
              >
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" type="button" className="h-6 w-6" onClick={() => handleRemove(i)}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
          <ActionFields action={action} onChange={(u) => handleChange(i, u)} depth={depth} />
        </Card>
      ))}
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nessuna azione</p>
      )}
    </div>
  );
}

// Action-specific fields component
function ActionFields({
  action,
  onChange,
  depth = 0,
}: {
  action: Action;
  onChange: (updates: Partial<Action>) => void;
  depth?: number;
}) {
  switch (action.type) {
    case "upsert_contact":
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Cerca contatto per telefono, lo crea se non esiste. Usa{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{{payload.args.telefono_principale}}"}</code>{" "}
            per mappare i campi.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Telefono: {{payload.args.telefono_principale}}"
              value={action.match?.phone || "{{payload.args.telefono_principale}}"}
              onChange={(e) =>
                onChange({ match: { ...action.match, phone: e.target.value } })
              }
            />
            <Input
              placeholder="Nome: {{payload.args.Nome}}"
              value={action.fields?.first_name || ""}
              onChange={(e) =>
                onChange({ fields: { ...action.fields, first_name: e.target.value } })
              }
            />
          </div>
        </div>
      );

    case "add_tag":
      return <AddTagActionFields action={action} onChange={onChange} />;

    case "create_deal":
      return (
        <p className="text-sm text-muted-foreground">
          Crea un deal per il contatto nella pipeline. Richiede che upsert_contact sia eseguito prima.
        </p>
      );

    case "create_ticket":
      return (
        <div className="space-y-2">
          <Input
            placeholder="Titolo ticket"
            value={action.fields?.title || ""}
            onChange={(e) => onChange({ fields: { ...action.fields, title: e.target.value } })}
          />
          <Select
            value={action.fields?.priority || "medium"}
            onValueChange={(v) => onChange({ fields: { ...action.fields, priority: v } })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Priorità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Bassa</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case "set_callback_requested":
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={action.value !== false}
            onCheckedChange={(v) => onChange({ value: v })}
          />
          <span className="text-sm">Imposta richiesta ricontatto</span>
        </div>
      );

    case "log_note":
      return (
        <Textarea
          placeholder="Nota da aggiungere (supporta {{payload.xxx}})"
          value={action.note || ""}
          onChange={(e) => onChange({ note: e.target.value })}
          rows={2}
        />
      );

    case "send_outbound_webhook":
      return (
        <Input
          placeholder="ID Webhook Outbound"
          value={action.webhook_id || ""}
          onChange={(e) => onChange({ webhook_id: e.target.value })}
        />
      );

    // ========== NEW WORKFLOW NODES ==========

    case "if_else":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>Branching condizionale — esegue "Then" se le condizioni sono vere, altrimenti "Else"</span>
          </div>
          {/* Inline condition editor for IF */}
          <IfElseConditionEditor
            conditions={action.conditions || {}}
            onChange={(c) => onChange({ conditions: c })}
          />
          <NestedActionList
            actions={action.then_actions || []}
            onChange={(a) => onChange({ then_actions: a })}
            label="✅ THEN (condizioni vere)"
            depth={depth + 1}
          />
          <NestedActionList
            actions={action.else_actions || []}
            onChange={(a) => onChange({ else_actions: a })}
            label="❌ ELSE (condizioni false)"
            depth={depth + 1}
          />
        </div>
      );

    case "delay":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span>Mette in pausa il workflow prima del prossimo step</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              placeholder="Durata"
              value={action.delay_value || ""}
              onChange={(e) => onChange({ delay_value: parseInt(e.target.value) || 0 })}
              className="w-24"
            />
            <Select
              value={action.delay_unit || "seconds"}
              onValueChange={(v) => onChange({ delay_unit: v as DelayUnit })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">Secondi</SelectItem>
                <SelectItem value="minutes">Minuti</SelectItem>
                <SelectItem value="hours">Ore</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(action.delay_unit === "minutes" && (action.delay_value || 0) > 0) ||
          (action.delay_unit === "hours") ? (
            <p className="text-xs text-amber-600">
              ⚠️ Delay superiori a 25 secondi verranno schedulati come job asincrono
            </p>
          ) : null}
        </div>
      );

    case "loop":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Repeat className="h-4 w-4" />
            <span>Itera su un array del payload (max 50 elementi)</span>
          </div>
          <Input
            placeholder="Path array: payload.args.items"
            value={action.items_path || ""}
            onChange={(e) => onChange({ items_path: e.target.value })}
          />
          <NestedActionList
            actions={action.loop_actions || []}
            onChange={(a) => onChange({ loop_actions: a })}
            label="🔁 Azioni per ogni elemento ({{item}} disponibile)"
            depth={depth + 1}
          />
        </div>
      );

    case "http_request":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>Chiamata HTTP generica (timeout 10s)</span>
          </div>
          <div className="flex gap-2">
            <Select
              value={action.method || "POST"}
              onValueChange={(v) => onChange({ method: v as HttpMethod })}
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="https://api.example.com/endpoint"
              value={action.url || ""}
              onChange={(e) => onChange({ url: e.target.value })}
              className="flex-1"
            />
          </div>
          <HttpHeadersEditor
            headers={action.headers || {}}
            onChange={(h) => onChange({ headers: h })}
          />
          {action.method !== "GET" && (
            <Textarea
              placeholder='Body JSON (supporta {{payload.xxx}})&#10;{"name": "{{payload.args.Nome}}"}'
              value={action.body || ""}
              onChange={(e) => onChange({ body: e.target.value })}
              rows={3}
              className="font-mono text-xs"
            />
          )}
        </div>
      );

    default:
      return null;
  }
}

// IF/ELSE condition editor (simplified inline)
function IfElseConditionEditor({
  conditions,
  onChange,
}: {
  conditions: Conditions;
  onChange: (c: Conditions) => void;
}) {
  const items = conditions.all || [];

  const handleAdd = () => {
    onChange({ ...conditions, all: [...items, { path: "", op: "exists" }] });
  };
  const handleRemove = (i: number) => {
    onChange({ ...conditions, all: items.filter((_, idx) => idx !== i) });
  };
  const handleChange = (i: number, field: string, value: unknown) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    onChange({ ...conditions, all: updated });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Condizioni IF (tutte devono essere vere)</span>
        <Button variant="ghost" size="sm" type="button" onClick={handleAdd} className="h-6 px-2">
          <Plus className="h-3 w-3 mr-1" /> Aggiungi
        </Button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select value={item.path || ""} onValueChange={(v) => handleChange(i, "path", v)}>
            <SelectTrigger className="w-[160px] h-7 text-xs">
              <SelectValue placeholder="Campo..." />
            </SelectTrigger>
            <SelectContent>
              {PAYLOAD_FIELDS.map((f) => (
                <SelectItem key={f.path} value={f.path}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={item.op} onValueChange={(v) => handleChange(i, "op", v)}>
            <SelectTrigger className="w-[120px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!["exists", "not_exists"].includes(item.op) && (
            <Input
              className="flex-1 h-7 text-xs"
              placeholder="Valore..."
              value={String(item.value || "")}
              onChange={(e) => handleChange(i, "value", e.target.value)}
            />
          )}
          <Button variant="ghost" size="icon" type="button" className="h-6 w-6" onClick={() => handleRemove(i)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// HTTP Headers key-value editor
function HttpHeadersEditor({
  headers,
  onChange,
}: {
  headers: Record<string, string>;
  onChange: (h: Record<string, string>) => void;
}) {
  const entries = Object.entries(headers);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Headers</span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-6 px-2"
          onClick={() => onChange({ ...headers, "": "" })}
        >
          <Plus className="h-3 w-3 mr-1" /> Header
        </Button>
      </div>
      {entries.map(([key, value], i) => (
        <div key={i} className="flex gap-1">
          <Input
            className="flex-1 h-7 text-xs font-mono"
            placeholder="Content-Type"
            value={key}
            onChange={(e) => {
              const newHeaders = { ...headers };
              delete newHeaders[key];
              newHeaders[e.target.value] = value;
              onChange(newHeaders);
            }}
          />
          <Input
            className="flex-1 h-7 text-xs font-mono"
            placeholder="application/json"
            value={value}
            onChange={(e) => onChange({ ...headers, [key]: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-7 w-7"
            onClick={() => {
              const newHeaders = { ...headers };
              delete newHeaders[key];
              onChange(newHeaders);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// Dedicated component for add_tag action with tag selector
function AddTagActionFields({
  action,
  onChange,
}: {
  action: Action;
  onChange: (updates: Partial<Action>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags();
  
  const selectedTag = tags.find((t) => t.name === action.tag);
  
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedTag ? (
              <span className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: selectedTag.color }}
                />
                {selectedTag.name}
              </span>
            ) : (
              "Seleziona un tag..."
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <ScrollArea className="h-[200px]">
            {tags.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nessun tag disponibile. Creane uno nelle impostazioni Tag.
              </div>
            ) : (
              <div className="p-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      onChange({ tag: tag.name });
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors",
                      action.tag === tag.name && "bg-accent"
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {action.tag === tag.name && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Select
        value={action.entity || "contact"}
        onValueChange={(v) => onChange({ entity: v as "contact" | "deal" | "ticket" })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contact">Contatto</SelectItem>
          <SelectItem value="deal">Deal</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
