import { cn } from "@/lib/utils";

interface AuditDiffViewerProps {
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedFields: string[] | null;
}

const SENSITIVE_FIELDS = ["password", "token", "secret", "api_key"];
const SKIP_FIELDS = ["updated_at", "created_at", "id", "brand_id"];
const MAX_DEPTH = 5;
const MAX_INLINE_LENGTH = 80;

function isSensitive(key: string): boolean {
  return SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f));
}

function fieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatPrimitive(key: string, value: unknown): string {
  if (isSensitive(key)) return "••••••••";
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "vero" : "falso";
  if (typeof value === "string") {
    return value.length > MAX_INLINE_LENGTH
      ? `${value.slice(0, MAX_INLINE_LENGTH)}…`
      : value;
  }
  if (typeof value === "number") return String(value);
  // For objects/arrays at the leaf level, stringify compactly
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
}

function DiffLeafRow({ path, oldVal, newVal }: DiffRowProps) {
  const key = path[path.length - 1] ?? "";
  const oldDefined = oldVal !== undefined;
  const newDefined = newVal !== undefined;
  const breadcrumb = path.map(fieldLabel).join(" › ");

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-muted-foreground">{breadcrumb}</span>
      <div className="flex items-center gap-2 flex-wrap">
        {oldDefined && (
          <span className="line-through text-destructive/70 bg-destructive/5 px-1.5 py-0.5 rounded break-all">
            {formatPrimitive(key, oldVal)}
          </span>
        )}
        {oldDefined && newDefined && (
          <span className="text-muted-foreground">→</span>
        )}
        {newDefined && (
          <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded break-all">
            {formatPrimitive(key, newVal)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Recursively diffs two values. Emits a leaf row when:
 *  - either side is a primitive/array/null
 *  - max depth is reached
 *  - one side is missing (added/removed)
 * Otherwise descends into nested objects.
 */
function renderDiff(
  oldVal: unknown,
  newVal: unknown,
  path: string[],
  depth: number,
): React.ReactNode[] {
  const key = path[path.length - 1] ?? "";

  // Both sides are plain objects → recurse on union of keys
  if (isPlainObject(oldVal) && isPlainObject(newVal) && depth < MAX_DEPTH) {
    const allKeys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
    const rows: React.ReactNode[] = [];
    for (const k of allKeys) {
      if (SKIP_FIELDS.includes(k)) continue;
      const ov = oldVal[k];
      const nv = newVal[k];
      if (isEqual(ov, nv)) continue;
      rows.push(...renderDiff(ov, nv, [...path, k], depth + 1));
    }
    return rows;
  }

  // Sensitive: collapse to a single masked row
  if (isSensitive(key)) {
    return [
      <DiffLeafRow
        key={path.join(".")}
        path={path}
        oldVal={oldVal === undefined ? undefined : "•"}
        newVal={newVal === undefined ? undefined : "•"}
        depth={depth}
      />,
    ];
  }

  return [
    <DiffLeafRow
      key={path.join(".")}
      path={path}
      oldVal={oldVal}
      newVal={newVal}
      depth={depth}
    />,
  ];
}

export function AuditDiffViewer({ oldValue, newValue, changedFields }: AuditDiffViewerProps) {
  // Determine which top-level fields to inspect:
  //  - prefer changedFields (explicit signal from audit_events)
  //  - fall back to union of keys from old/new values
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
    rows.push(...renderDiff(ov, nv, [field], 1));
  }

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground italic">Nessuna differenza rilevata</span>;
  }

  return <div className={cn("space-y-1.5 text-xs")}>{rows}</div>;
}
