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
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  useCreateAutomationRule,
  useUpdateAutomationRule,
  AUTOMATION_EVENT_TYPES,
  ACTION_TYPES,
  PAYLOAD_FIELDS,
  type AutomationRule,
  type Action,
  type Conditions,
  type ConditionItem,
  CONDITION_OPERATORS,
} from "@/hooks/useAutomationRules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerEventType, setTriggerEventType] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [priority, setPriority] = useState(100);
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [actions, setActions] = useState<Action[]>([]);

  // Reset form when opening/closing or changing edit target
  useEffect(() => {
    if (open) {
      if (editingRule) {
        setName(editingRule.name);
        setDescription(editingRule.description || "");
        setTriggerEventType(editingRule.trigger_event_type || "");
        setIsActive(editingRule.is_active);
        setStopOnFailure(editingRule.stop_on_failure);
        setPriority(editingRule.priority);
        setConditions(editingRule.conditions?.all || []);
        setActions(editingRule.actions || []);
      } else {
        setName("");
        setDescription("");
         setTriggerEventType(defaultEventType || "");
        setIsActive(true);
        setStopOnFailure(true);
        setPriority(100);
        setConditions([]);
        setActions([]);
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

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Nome obbligatorio");
      return;
    }
    if (!triggerEventType) {
      toast.error("Seleziona un evento trigger");
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
          trigger_event_type: triggerEventType,
           trigger_source: defaultSource || undefined,
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
          trigger_event_type: triggerEventType,
           trigger_source: defaultSource || undefined,
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
            Configura un'automazione che si attiva quando arriva un webhook
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
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

// Action-specific fields component
function ActionFields({
  action,
  onChange,
}: {
  action: Action;
  onChange: (updates: Partial<Action>) => void;
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
      return (
        <div className="space-y-2">
          <Input
            placeholder="Nome tag (es: keplero_ricontatto)"
            value={action.tag || ""}
            onChange={(e) => onChange({ tag: e.target.value })}
          />
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

    default:
      return null;
  }
}
