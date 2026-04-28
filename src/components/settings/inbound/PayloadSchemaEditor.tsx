import { useMemo, useState } from "react";
import { Plus, Trash2, AlertCircle, CheckCircle2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export type FieldType = "string" | "number" | "boolean" | "email" | "phone" | "object" | "array";

export interface FieldRule {
  type?: FieldType;
  max_length?: number;
  min_length?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface PayloadSchema {
  required?: string[];
  fields?: Record<string, FieldRule>;
  strict?: boolean;
}

interface PayloadSchemaEditorProps {
  value: PayloadSchema | null | undefined;
  onChange: (next: PayloadSchema | null) => void;
}

const FIELD_TYPES: FieldType[] = ["string", "number", "boolean", "email", "phone", "object", "array"];

/**
 * Editor visuale per `webhook_sources.payload_schema`.
 * - Validazione lato edge è in supabase/functions/webhook-ingest/index.ts (`validatePayloadSchema`)
 * - Schema vuoto/null = nessuna validazione (passthrough)
 */
export function PayloadSchemaEditor({ value, onChange }: PayloadSchemaEditorProps) {
  const schema = value ?? {};
  const [tab, setTab] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const required = schema.required ?? [];
  const fields = schema.fields ?? {};

  const fieldEntries = useMemo(() => Object.entries(fields), [fields]);

  const update = (patch: Partial<PayloadSchema>) => {
    const next: PayloadSchema = { ...schema, ...patch };
    // Normalize: drop empty arrays / objects so DB stores null when truly empty
    if (next.required && next.required.length === 0) delete next.required;
    if (next.fields && Object.keys(next.fields).length === 0) delete next.fields;
    if (!next.strict) delete next.strict;
    const isEmpty = Object.keys(next).length === 0;
    onChange(isEmpty ? null : next);
    setJsonText(JSON.stringify(isEmpty ? {} : next, null, 2));
  };

  const addRequired = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || required.includes(trimmed)) return;
    update({ required: [...required, trimmed] });
  };

  const removeRequired = (name: string) => {
    update({ required: required.filter((r) => r !== name) });
  };

  const addField = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || fields[trimmed]) return;
    update({ fields: { ...fields, [trimmed]: { type: "string" } } });
  };

  const updateField = (name: string, rule: FieldRule) => {
    update({ fields: { ...fields, [name]: rule } });
  };

  const removeField = (name: string) => {
    const next = { ...fields };
    delete next[name];
    update({ fields: next });
  };

  const handleJsonApply = () => {
    try {
      const parsed = jsonText.trim() ? JSON.parse(jsonText) : {};
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Lo schema deve essere un oggetto JSON");
      }
      setJsonError(null);
      onChange(Object.keys(parsed).length === 0 ? null : (parsed as PayloadSchema));
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON non valido");
    }
  };

  const isEmpty = required.length === 0 && fieldEntries.length === 0 && !schema.strict;

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "visual" | "json")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="visual">Editor visuale</TabsTrigger>
          <TabsTrigger value="json" className="gap-1.5">
            <Code2 className="h-3.5 w-3.5" /> JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-4 mt-4">
          {isEmpty && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Nessuno schema configurato — tutti i payload vengono accettati.
                Aggiungi campi obbligatori o regole per validare i webhook in ingresso.
              </AlertDescription>
            </Alert>
          )}

          {/* Required fields */}
          <RequiredFieldsSection
            required={required}
            onAdd={addRequired}
            onRemove={removeRequired}
          />

          {/* Field rules */}
          <FieldRulesSection
            fields={fieldEntries}
            onAdd={addField}
            onUpdate={updateField}
            onRemove={removeField}
          />

          {/* Strict mode */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5 pr-3">
              <Label className="text-sm font-medium">Modalità strict</Label>
              <p className="text-xs text-muted-foreground">
                Rifiuta payload con campi non dichiarati in "Regole campo".
              </p>
            </div>
            <Switch
              checked={!!schema.strict}
              onCheckedChange={(checked) => update({ strict: checked })}
            />
          </div>

          {!isEmpty && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
              <span>
                Validazione attiva — payload non conformi vengono respinti con HTTP 422 e finiscono in DLQ
                con motivo <code className="bg-muted px-1 rounded">schema_validation_failed</code>.
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="json" className="space-y-3 mt-4">
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder='{\n  "required": ["email"],\n  "fields": {\n    "email": { "type": "email" }\n  },\n  "strict": false\n}'
          />
          {jsonError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{jsonError}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleJsonApply}>
              Applica JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setJsonText(JSON.stringify(value ?? {}, null, 2));
                setJsonError(null);
              }}
            >
              Annulla
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --------------------------------------------------------------------
// Subcomponents
// --------------------------------------------------------------------

function RequiredFieldsSection({
  required,
  onAdd,
  onRemove,
}: {
  required: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Campi obbligatori</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="es. email"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {required.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {required.map((r) => (
            <Badge key={r} variant="secondary" className="gap-1 pl-2 pr-1">
              {r}
              <button
                type="button"
                onClick={() => onRemove(r)}
                className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                aria-label={`Rimuovi ${r}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun campo obbligatorio configurato.</p>
      )}
    </div>
  );
}

function FieldRulesSection({
  fields,
  onAdd,
  onUpdate,
  onRemove,
}: {
  fields: Array<[string, FieldRule]>;
  onAdd: (name: string) => void;
  onUpdate: (name: string, rule: FieldRule) => void;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Regole campo</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="nome campo (es. phone)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna regola configurata.</p>
      ) : (
        <div className="space-y-2">
          {fields.map(([name, rule]) => (
            <FieldRuleRow
              key={name}
              name={name}
              rule={rule}
              onUpdate={(r) => onUpdate(name, r)}
              onRemove={() => onRemove(name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRuleRow({
  name,
  rule,
  onUpdate,
  onRemove,
}: {
  name: string;
  rule: FieldRule;
  onUpdate: (rule: FieldRule) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isString = rule.type === "string" || rule.type === "email" || rule.type === "phone";
  const isNumber = rule.type === "number";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-muted/20">
      <div className="flex items-center gap-2 p-2">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <code className="text-xs font-mono flex-1 truncate">{name}</code>
        <Select
          value={rule.type ?? "string"}
          onValueChange={(v) => onUpdate({ ...rule, type: v as FieldType })}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive shrink-0"
          onClick={onRemove}
          aria-label={`Rimuovi ${name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CollapsibleContent className="px-2 pb-3 space-y-2 border-t bg-background">
        {isString && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <NumberField
              label="min length"
              value={rule.min_length}
              onChange={(v) => onUpdate({ ...rule, min_length: v })}
            />
            <NumberField
              label="max length"
              value={rule.max_length}
              onChange={(v) => onUpdate({ ...rule, max_length: v })}
            />
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">pattern (regex)</Label>
              <Input
                value={rule.pattern ?? ""}
                onChange={(e) =>
                  onUpdate({ ...rule, pattern: e.target.value || undefined })
                }
                placeholder="es. ^[A-Z]{2,3}$"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}
        {isNumber && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <NumberField
              label="min"
              value={rule.min}
              onChange={(v) => onUpdate({ ...rule, min: v })}
            />
            <NumberField
              label="max"
              value={rule.max}
              onChange={(v) => onUpdate({ ...rule, max: v })}
            />
          </div>
        )}
        {!isString && !isNumber && (
          <p className="text-xs text-muted-foreground pt-2">
            Nessuna regola aggiuntiva per il tipo <code>{rule.type}</code>.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}
