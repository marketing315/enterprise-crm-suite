import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Trash2, ChevronDown, Check, GitBranch, Timer, Repeat, Globe, Edit2,
  UserPlus, Tag, Briefcase, PhoneCall, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_TYPES,
  PAYLOAD_FIELDS,
  CONDITION_OPERATORS,
  type Action,
  type Conditions,
  type ConditionItem,
  type DelayUnit,
  type HttpMethod,
} from "@/hooks/useAutomationRules";
import { WorkflowNodeIcon, getNodeConfig } from "./WorkflowNodeIcon";
import { useTags } from "@/hooks/useTags";

interface Props {
  actions: Action[];
  setActions: (a: Action[]) => void;
}

// Quick start templates
const TEMPLATES = [
  {
    label: "Crea contatto e tagga",
    icon: UserPlus,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    actions: [
      { type: "upsert_contact" as const, match: { phone: "{{payload.args.telefono_principale}}" }, fields: { first_name: "{{payload.args.Nome}}" } },
      { type: "add_tag" as const, tag: "" },
    ],
  },
  {
    label: "Crea contatto e deal",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    actions: [
      { type: "upsert_contact" as const, match: { phone: "{{payload.args.telefono_principale}}" } },
      { type: "create_deal" as const },
    ],
  },
  {
    label: "Ricontatto rapido",
    icon: PhoneCall,
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-950/40",
    actions: [
      { type: "upsert_contact" as const, match: { phone: "{{payload.args.telefono_principale}}" } },
      { type: "set_callback_requested" as const, value: true },
    ],
  },
];

export function AutomationWizardWorkflow({ actions, setActions }: Props) {
  const handleAddAction = (type: Action["type"]) => {
    setActions([...actions, { type }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, updates: Partial<Action>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    setActions(newActions);
  };

  return (
    <div className="space-y-4">
      {actions.length === 0 ? (
        <div className="space-y-6">
          {/* Empty state */}
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-semibold">Costruisci il tuo workflow</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">
              Scegli un template rapido o aggiungi i nodi uno alla volta
            </p>
          </div>

          {/* Templates */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Template rapidi</p>
            <div className="grid grid-cols-1 gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => setActions(tpl.actions)}
                  className="flex items-center gap-3 p-3.5 rounded-xl border hover:border-primary/30 hover:bg-accent/50 transition-all text-left group"
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", tpl.bg)}>
                    <tpl.icon className={cn("h-5 w-5", tpl.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{tpl.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tpl.actions.map((a) => ACTION_TYPES.find((t) => t.value === a.type)?.label).join(" → ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Or add manually */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">oppure</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="flex justify-center">
            <WorkflowNodePicker onSelect={(type) => setActions([{ type }])} />
          </div>
        </div>
      ) : (
        <div className="space-y-0">
          {actions.map((action, index) => (
            <WorkflowNodeCard
              key={index}
              action={action}
              index={index}
              isLast={index === actions.length - 1}
              onChange={(updates) => handleActionChange(index, updates)}
              onRemove={() => handleRemoveAction(index)}
            />
          ))}
          <div className="flex flex-col items-center pt-1">
            <div className="w-px h-4 bg-border" />
            <WorkflowNodePicker onSelect={(type) => handleAddAction(type)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============= Node Picker =============

function WorkflowNodePicker({ onSelect }: { onSelect: (type: Action["type"]) => void }) {
  const [open, setOpen] = useState(false);

  const categories = [
    {
      label: "Azioni CRM",
      types: ["upsert_contact", "add_tag", "create_deal", "create_ticket", "set_callback_requested", "log_note", "send_outbound_webhook"] as const,
    },
    {
      label: "Controllo Flusso",
      types: ["if_else", "delay", "loop", "http_request"] as const,
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="rounded-full h-8 px-4 border-dashed border-primary/30 text-primary hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Aggiungi Nodo
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="center">
        <ScrollArea className="max-h-[320px]">
          {categories.map((cat) => (
            <div key={cat.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                {cat.label}
              </p>
              {cat.types.map((type) => {
                const info = ACTION_TYPES.find((t) => t.value === type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { onSelect(type); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <WorkflowNodeIcon type={type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight">{info?.label || type}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">{info?.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ============= Node Card =============

function WorkflowNodeCard({
  action, index, isLast, onChange, onRemove,
}: {
  action: Action; index: number; isLast: boolean;
  onChange: (updates: Partial<Action>) => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const config = getNodeConfig(action.type);
  const label = ACTION_TYPES.find((t) => t.value === action.type)?.label || action.type;

  return (
    <div className="relative">
      {index > 0 && <div className="flex justify-center h-3"><div className="w-px bg-border" /></div>}
      <div className={cn("rounded-xl border transition-all duration-200 bg-card hover:shadow-sm", expanded && "shadow-sm")}>
        <button
          type="button"
          className="flex items-center gap-2.5 p-3 w-full text-left cursor-pointer select-none bg-transparent border-0"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Comprimi nodo " + label : "Espandi nodo " + label}
        >
          <WorkflowNodeIcon type={action.type} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{label}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal text-muted-foreground">#{index + 1}</Badge>
            </div>
            {!expanded && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{getNodeSummary(action)}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Select value={action.type} onValueChange={(v) => onChange({ type: v as Action["type"] })}>
              <SelectTrigger className="h-7 w-7 p-0 border-none shadow-none [&>svg]:hidden" onClick={(e) => e.stopPropagation()}>
                <Edit2 className="h-3 w-3 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value}>
                    <span className="flex items-center gap-2"><WorkflowNodeIcon type={at.value} size="sm" />{at.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) = aria-label="Elimina"> { e.stopPropagation(); onRemove(); }} aria-label="Elimina nodo">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          </div>
        </button>
        {expanded && (
          <div className="px-3 pb-3 pt-0">
            <div className={cn("rounded-lg p-3", config.bg, "bg-opacity-30")}>
              <ActionFields action={action} onChange={onChange} />
            </div>
          </div>
        )}
      </div>
      {!isLast && <div className="flex justify-center h-3"><div className="w-px bg-border" /></div>}
    </div>
  );
}

// ============= Summary =============

function getNodeSummary(action: Action): string {
  switch (action.type) {
    case "upsert_contact": return action.match?.phone || "Trova/crea contatto per telefono";
    case "add_tag": return action.tag || "Seleziona un tag...";
    case "create_deal": return "Crea deal per il contatto";
    case "create_ticket": return action.fields?.title || "Nuovo ticket";
    case "set_callback_requested": return action.value !== false ? "Attiva ricontatto" : "Disattiva ricontatto";
    case "log_note": return action.note?.slice(0, 50) || "Aggiungi nota...";
    case "send_outbound_webhook": return action.webhook_id || "Seleziona webhook...";
    case "if_else": return `Then: ${action.then_actions?.length || 0} · Else: ${action.else_actions?.length || 0} azioni`;
    case "delay": return `${action.delay_value || 0} ${action.delay_unit === "minutes" ? "min" : action.delay_unit === "hours" ? "ore" : "sec"}`;
    case "loop": return `${action.loop_actions?.length || 0} azioni su ${action.items_path || "..."}`;
    case "http_request": return `${action.method || "POST"} ${action.url || "..."}`;
    default: return "";
  }
}

// ============= Action Fields =============

function ActionFields({ action, onChange, depth = 0 }: { action: Action; onChange: (u: Partial<Action>) => void; depth?: number }) {
  switch (action.type) {
    case "upsert_contact":
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground text-xs">
            Cerca contatto per telefono, lo crea se non esiste.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Telefono: {{payload.args.telefono_principale}}" value={action.match?.phone || "{{payload.args.telefono_principale}}"} onChange={(e) => onChange({ match: { ...action.match, phone: e.target.value } })} />
            <Input placeholder="Nome: {{payload.args.Nome}}" value={action.fields?.first_name || ""} onChange={(e) => onChange({ fields: { ...action.fields, first_name: e.target.value } })} />
          </div>
        </div>
      );
    case "add_tag": return <AddTagActionFields action={action} onChange={onChange} />;
    case "create_deal": return <p className="text-sm text-muted-foreground">Crea un deal per il contatto nella pipeline.</p>;
    case "create_ticket":
      return (
        <div className="space-y-2">
          <Input placeholder="Titolo ticket" value={action.fields?.title || ""} onChange={(e) => onChange({ fields: { ...action.fields, title: e.target.value } })} />
          <Select value={action.fields?.priority || "medium"} onValueChange={(v) => onChange({ fields: { ...action.fields, priority: v } })}>
            <SelectTrigger><SelectValue placeholder="Priorità" /></SelectTrigger>
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
          <Switch checked={action.value !== false} onCheckedChange={(v) => onChange({ value: v })} />
          <span className="text-sm">Imposta richiesta ricontatto</span>
        </div>
      );
    case "log_note":
      return <Textarea placeholder="Nota (supporta {{payload.xxx}})" value={action.note || ""} onChange={(e) => onChange({ note: e.target.value })} rows={2} />;
    case "send_outbound_webhook":
      return <Input placeholder="ID Webhook Outbound" value={action.webhook_id || ""} onChange={(e) => onChange({ webhook_id: e.target.value })} />;
    case "if_else":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><GitBranch className="h-4 w-4" /><span>Branching condizionale</span></div>
          <IfElseConditionEditor conditions={action.conditions || {}} onChange={(c) => onChange({ conditions: c })} />
          <NestedActionList actions={action.then_actions || []} onChange={(a) => onChange({ then_actions: a })} label="✅ THEN" depth={depth + 1} />
          <NestedActionList actions={action.else_actions || []} onChange={(a) => onChange({ else_actions: a })} label="❌ ELSE" depth={depth + 1} />
        </div>
      );
    case "delay":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Timer className="h-4 w-4" /><span>Pausa il workflow</span></div>
          <div className="flex gap-2">
            <Input type="number" min={1} placeholder="Durata" value={action.delay_value || ""} onChange={(e) => onChange({ delay_value: parseInt(e.target.value) || 0 })} className="w-24" />
            <Select value={action.delay_unit || "seconds"} onValueChange={(v) => onChange({ delay_unit: v as DelayUnit })}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">Secondi</SelectItem>
                <SelectItem value="minutes">Minuti</SelectItem>
                <SelectItem value="hours">Ore</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case "loop":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Repeat className="h-4 w-4" /><span>Itera su un array (max 50)</span></div>
          <Input placeholder="Path array: payload.args.items" value={action.items_path || ""} onChange={(e) => onChange({ items_path: e.target.value })} />
          <NestedActionList actions={action.loop_actions || []} onChange={(a) => onChange({ loop_actions: a })} label="🔁 Per ogni elemento" depth={depth + 1} />
        </div>
      );
    case "http_request":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Globe className="h-4 w-4" /><span>Chiamata HTTP (timeout 10s)</span></div>
          <div className="flex gap-2">
            <Select value={action.method || "POST"} onValueChange={(v) => onChange({ method: v as HttpMethod })}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="https://api.example.com/endpoint" value={action.url || ""} onChange={(e) => onChange({ url: e.target.value })} className="flex-1" />
          </div>
          <HttpHeadersEditor headers={action.headers || {}} onChange={(h) => onChange({ headers: h })} />
          {action.method !== "GET" && (
            <Textarea placeholder='Body JSON (supporta {{payload.xxx}})' value={action.body || ""} onChange={(e) => onChange({ body: e.target.value })} rows={3} className="font-mono text-xs" />
          )}
        </div>
      );
    default: return null;
  }
}

// ============= Sub-components =============

function NestedActionList({ actions, onChange, label, depth = 1 }: { actions: Action[]; onChange: (a: Action[]) => void; label: string; depth?: number }) {
  if (depth > 3) return <p className="text-xs text-destructive">Nidificazione massima raggiunta</p>;
  return (
    <div className={cn("rounded-lg border border-dashed border-border/60 p-2.5 space-y-0", depth > 1 && "ml-1")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{label}</p>
      {actions.map((action, i) => (
        <div key={i} className="relative">
          {i > 0 && <div className="flex justify-center h-2"><div className="w-px bg-border" /></div>}
          <div className="rounded-lg border bg-card p-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <WorkflowNodeIcon type={action.type} size="sm" />
                <Select value={action.type} onValueChange={(v) => { const u = [...actions]; u[i] = { ...u[i], type: v as Action["type"] }; onChange(u); }}>
                  <SelectTrigger className="w-[160px] h-6 text-[11px] border-none shadow-none px-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTION_TYPES.map((at) => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" type="button" className="h-5 w-5" onClick={() = aria-label="Elimina"> onChange(actions.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
            <ActionFields action={action} onChange={(u) => { const updated = [...actions]; updated[i] = { ...updated[i], ...u }; onChange(updated); }} depth={depth} />
          </div>
        </div>
      ))}
      {actions.length === 0 && <p className="text-[10px] text-muted-foreground italic text-center py-2">Nessuna azione</p>}
      <div className="flex justify-center pt-2">
        <WorkflowNodePicker onSelect={(type) => onChange([...actions, { type }])} />
      </div>
    </div>
  );
}

function IfElseConditionEditor({ conditions, onChange }: { conditions: Conditions; onChange: (c: Conditions) => void }) {
  const items = conditions.all || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Condizioni IF</span>
        <Button variant="ghost" size="sm" type="button" onClick={() => onChange({ ...conditions, all: [...items, { path: "", op: "exists" }] })} className="h-6 px-2">
          <Plus className="h-3 w-3 mr-1" /> Aggiungi
        </Button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select value={item.path || ""} onValueChange={(v) => { const u = [...items]; u[i] = { ...u[i], path: v }; onChange({ ...conditions, all: u }); }}>
            <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue placeholder="Campo..." /></SelectTrigger>
            <SelectContent>{PAYLOAD_FIELDS.map((f) => <SelectItem key={f.path} value={f.path}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={item.op} onValueChange={(v) => { const u = [...items]; u[i] = { ...u[i], op: v as any }; onChange({ ...conditions, all: u }); }}>
            <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CONDITION_OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
          </Select>
          {!["exists", "not_exists"].includes(item.op) && (
            <Input className="flex-1 h-7 text-xs" placeholder="Valore..." value={String(item.value || "")} onChange={(e) => { const u = [...items]; u[i] = { ...u[i], value: e.target.value }; onChange({ ...conditions, all: u }); }} />
          )}
          <Button variant="ghost" size="icon" type="button" className="h-6 w-6" onClick={() = aria-label="Elimina"> onChange({ ...conditions, all: items.filter((_, idx) => idx !== i) })}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function HttpHeadersEditor({ headers, onChange }: { headers: Record<string, string>; onChange: (h: Record<string, string>) => void }) {
  const entries = Object.entries(headers);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Headers</span>
        <Button variant="ghost" size="sm" type="button" className="h-6 px-2" onClick={() => onChange({ ...headers, "": "" })}>
          <Plus className="h-3 w-3 mr-1" /> Header
        </Button>
      </div>
      {entries.map(([key, value], i) => (
        <div key={i} className="flex gap-1">
          <Input className="flex-1 h-7 text-xs font-mono" placeholder="Content-Type" value={key} onChange={(e) => { const n = { ...headers }; delete n[key]; n[e.target.value] = value; onChange(n); }} />
          <Input className="flex-1 h-7 text-xs font-mono" placeholder="application/json" value={value} onChange={(e) => onChange({ ...headers, [key]: e.target.value })} />
          <Button variant="ghost" size="icon" type="button" className="h-7 w-7" onClick={() = aria-label="Elimina"> { const n = { ...headers }; delete n[key]; onChange(n); }}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function AddTagActionFields({ action, onChange }: { action: Action; onChange: (u: Partial<Action>) => void }) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags();
  const selectedTag = tags.find((t) => t.name === action.tag);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
            {selectedTag ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedTag.color }} />
                {selectedTag.name}
              </span>
            ) : "Seleziona un tag..."}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <ScrollArea className="h-[200px]">
            {tags.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nessun tag disponibile.</div>
            ) : (
              <div className="p-1">
                {tags.map((tag) => (
                  <button key={tag.id} type="button" onClick={() => { onChange({ tag: tag.name }); setOpen(false); }} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors", action.tag === tag.name && "bg-accent")}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {action.tag === tag.name && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Select value={action.entity || "contact"} onValueChange={(v) => onChange({ entity: v as "contact" | "deal" | "ticket" })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="contact">Contatto</SelectItem>
          <SelectItem value="deal">Deal</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
