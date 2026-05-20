import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Filter, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PAYLOAD_FIELDS,
  CONDITION_OPERATORS,
  type ConditionItem,
} from "@/hooks/useAutomationRules";

interface Props {
  conditions: ConditionItem[];
  setConditions: (c: ConditionItem[]) => void;
}

function getConditionDescription(condition: ConditionItem): string {
  const field = PAYLOAD_FIELDS.find((f) => f.path === condition.path);
  const op = CONDITION_OPERATORS.find((o) => o.value === condition.op);
  if (!field || !op) return "";

  if (condition.op === "exists") return `Esegui solo se "${field.label}" è presente`;
  if (condition.op === "not_exists") return `Esegui solo se "${field.label}" non è presente`;
  return `Esegui solo se "${field.label}" ${op.label.toLowerCase()} "${condition.value || "..."}"`;
}

export function AutomationWizardConditions({ conditions, setConditions }: Props) {
  const hasConditions = conditions.length > 0;

  const handleAdd = () => {
    setConditions([...conditions, { path: "", op: "exists" }]);
  };

  const handleRemove = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof ConditionItem, value: unknown) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <Filter className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">Applica filtri</p>
            <p className="text-xs text-muted-foreground">Filtra gli eventi che attivano il workflow</p>
          </div>
        </div>
        <Switch
          checked={hasConditions}
          onCheckedChange={(v) => {
            if (v && conditions.length === 0) handleAdd();
            if (!v) setConditions([]);
          }}
        />
      </div>

      {/* No conditions state */}
      {!hasConditions && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Nessun filtro applicato</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[280px]">
            Il workflow si attiverà per ogni evento. Aggiungi filtri per restringere l'esecuzione.
          </p>
        </div>
      )}

      {/* Condition rows */}
      {hasConditions && (
        <div className="space-y-3">
          {conditions.map((condition, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center gap-2 p-3 rounded-xl border bg-card">
                {/* Field chip */}
                <Select
                  value={condition.path}
                  onValueChange={(v) => handleChange(index, "path", v)}
                >
                  <SelectTrigger className="w-[170px] h-9 rounded-lg bg-muted/50 border-0 text-xs font-medium">
                    <SelectValue placeholder="Campo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYLOAD_FIELDS.map((field) => (
                      <SelectItem key={field.path} value={field.path}>{field.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator chip */}
                <Select
                  value={condition.op}
                  onValueChange={(v) => handleChange(index, "op", v)}
                >
                  <SelectTrigger className="w-[140px] h-9 rounded-lg bg-primary/5 border-0 text-xs font-medium text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                {!["exists", "not_exists"].includes(condition.op) && (
                  <Input
                    className="flex-1 h-9 rounded-lg text-xs"
                    placeholder="Valore..."
                    value={String(condition.value || "")}
                    onChange={(e) => handleChange(index, "value", e.target.value)}
                  />
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(index)}
                 aria-label="Elimina">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Natural language description */}
              {condition.path && (
                <p className="text-[11px] text-muted-foreground/70 italic px-1">
                  {getConditionDescription(condition)}
                </p>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleAdd}
            className="rounded-full border-dashed"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Aggiungi filtro
          </Button>
        </div>
      )}
    </div>
  );
}
