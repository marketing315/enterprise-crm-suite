import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffectivePiiPolicies, type EffectivePiiRule } from "@/hooks/useAuditPiiPolicies";
import { resolveStrategy, applyMask } from "@/lib/piiMasking";

interface AuditDiffViewerProps {
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedFields: string[] | null;
}

const SKIP_FIELDS = ["updated_at", "created_at", "id", "brand_id"];
const MAX_DEPTH = 8;
const MAX_INLINE_LENGTH = 80;
const COLLAPSE_THRESHOLD = 4; // collapse object/array nodes with > N changed children

function fieldLabel(key: string): string {
  if (/^\d+$/.test(key)) return `[${key}]`;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatPrimitive(key: string, value: unknown, rules: EffectivePiiRule[]): string {
  const strategy = resolveStrategy(key, rules);
  if (strategy !== "none") {
    return applyMask(value, strategy);
  }
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "vero" : "falso";
  if (typeof value === "string") {
    return value.length > MAX_INLINE_LENGTH ? `${value.slice(0, MAX_INLINE_LENGTH)}…` : value;
  }
  if (typeof value === "number") return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > MAX_INLINE_LENGTH ? `${json.slice(0, MAX_INLINE_LENGTH)}…` : json;
  } catch {
    return String(value);
  }
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

interface DiffRowProps {
  path: string[];
  oldVal: unknown;
  newVal: unknown;
  depth: number;
  rules: EffectivePiiRule[];
}

function DiffLeafRow({ path, oldVal, newVal, rules }: DiffRowProps) {
  const key = path[path.length - 1] ?? "";
  const oldDefined = oldVal !== undefined;
  const newDefined = newVal !== undefined;
  const breadcrumb = path.map(fieldLabel).join(" › ");
  const strategy = resolveStrategy(key, rules);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-muted-foreground flex items-center gap-1">
        {breadcrumb}
        {strategy !== "none" && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 ml-1">
            mascherato
          </span>
        )}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {oldDefined && (
          <span className="line-through text-destructive/70 bg-destructive/5 px-1.5 py-0.5 rounded break-all">
            {formatPrimitive(key, oldVal, rules)}
          </span>
        )}
        {oldDefined && newDefined && <span className="text-muted-foreground">→</span>}
        {newDefined && (
          <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded break-all">
            {formatPrimitive(key, newVal, rules)}
          </span>
        )}
      </div>
    </div>
  );
}

interface CollapsibleNodeProps {
  path: string[];
  childRows: React.ReactNode[];
  defaultOpen: boolean;
  type: "object" | "array";
  changedCount: number;
}

function CollapsibleNode({ path, childRows, defaultOpen, type, changedCount }: CollapsibleNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const breadcrumb = path.map(fieldLabel).join(" › ");
  const indent = Math.min(path.length - 1, 6) * 12;

  return (
    <div style={{ marginLeft: indent }} className="border-l-2 border-muted/40 pl-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span>{breadcrumb}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {type} · {changedCount} {changedCount === 1 ? "modifica" : "modifiche"}
        </span>
      </button>
      {open && <div className="mt-1 space-y-1.5">{childRows}</div>}
    </div>
  );
}

function renderDiff(
  oldVal: unknown,
  newVal: unknown,
  path: string[],
  depth: number,
  rules: EffectivePiiRule[],
): React.ReactNode[] {
  // Recurse into plain objects
  if (isPlainObject(oldVal) && isPlainObject(newVal) && depth < MAX_DEPTH) {
    const allKeys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
    const rows: React.ReactNode[] = [];
    for (const k of allKeys) {
      if (SKIP_FIELDS.includes(k)) continue;
      const ov = oldVal[k];
      const nv = newVal[k];
      if (isEqual(ov, nv)) continue;
      rows.push(...renderDiff(ov, nv, [...path, k], depth + 1, rules));
    }
    if (rows.length > COLLAPSE_THRESHOLD && path.length > 0) {
      return [
        <CollapsibleNode
          key={path.join(".") || "root-obj"}
          path={path}
          childRows={rows}
          defaultOpen={depth <= 1}
          type="object"
          changedCount={rows.length}
        />,
      ];
    }
    return rows;
  }

  // Recurse into arrays (positional diff)
  if (Array.isArray(oldVal) && Array.isArray(newVal) && depth < MAX_DEPTH) {
    const maxLen = Math.max(oldVal.length, newVal.length);
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < maxLen; i++) {
      const ov = oldVal[i];
      const nv = newVal[i];
      if (isEqual(ov, nv)) continue;
      rows.push(...renderDiff(ov, nv, [...path, String(i)], depth + 1, rules));
    }
    if (rows.length > COLLAPSE_THRESHOLD && path.length > 0) {
      return [
        <CollapsibleNode
          key={path.join(".") || "root-arr"}
          path={path}
          childRows={rows}
          defaultOpen={depth <= 1}
          type="array"
          changedCount={rows.length}
        />,
      ];
    }
    return rows;
  }

  // Type-mismatch fallback (e.g. object → array, primitive → object): render leaf
  return [
    <DiffLeafRow
      key={path.join(".")}
      path={path}
      oldVal={oldVal}
      newVal={newVal}
      depth={depth}
      rules={rules}
    />,
  ];
}

export function AuditDiffViewer({ oldValue, newValue, changedFields }: AuditDiffViewerProps) {
  const { data: rules = [] } = useEffectivePiiPolicies();

  const topLevelKeys = (() => {
    if (changedFields && changedFields.length > 0) {
      return changedFields.filter((f) => !SKIP_FIELDS.includes(f));
    }
    const keys = new Set<string>();
    if (oldValue) Object.keys(oldValue).forEach((k) => keys.add(k));
    if (newValue) Object.keys(newValue).forEach((k) => keys.add(k));
    return Array.from(keys).filter((k) => !SKIP_FIELDS.includes(k));
  })();

  if (topLevelKeys.length === 0 && !oldValue && !newValue) {
    return <span className="text-xs text-muted-foreground italic">Nessun dettaglio disponibile</span>;
  }

  const rows: React.ReactNode[] = [];
  for (const field of topLevelKeys) {
    const ov = oldValue?.[field];
    const nv = newValue?.[field];
    if (isEqual(ov, nv)) continue;
    rows.push(...renderDiff(ov, nv, [field], 1, rules));
  }

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground italic">Nessuna differenza rilevata</span>;
  }

  return <div className={cn("space-y-1.5 text-xs")}>{rows}</div>;
}
