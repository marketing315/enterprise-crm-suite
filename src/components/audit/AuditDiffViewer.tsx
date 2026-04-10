import { cn } from "@/lib/utils";

interface AuditDiffViewerProps {
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedFields: string[] | null;
}

const SENSITIVE_FIELDS = ["password", "token", "secret", "api_key"];
const SKIP_FIELDS = ["updated_at", "created_at", "id", "brand_id"];

function maskValue(key: string, value: unknown): string {
  if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
    return "••••••••";
  }
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function AuditDiffViewer({ oldValue, newValue, changedFields }: AuditDiffViewerProps) {
  const fields = changedFields?.filter(f => !SKIP_FIELDS.includes(f)) || [];

  if (fields.length === 0 && !oldValue && !newValue) {
    return <span className="text-xs text-muted-foreground italic">Nessun dettaglio disponibile</span>;
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5 text-xs">
      {fields.map(field => {
        const oldVal = oldValue?.[field];
        const newVal = newValue?.[field];
        return (
          <div key={field} className="flex flex-col gap-0.5">
            <span className="font-medium text-muted-foreground">{fieldLabel(field)}</span>
            <div className="flex items-center gap-2">
              {oldVal !== undefined && (
                <span className="line-through text-destructive/70 bg-destructive/5 px-1.5 py-0.5 rounded">
                  {maskValue(field, oldVal)}
                </span>
              )}
              {oldVal !== undefined && newVal !== undefined && (
                <span className="text-muted-foreground">→</span>
              )}
              {newVal !== undefined && (
                <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                  {maskValue(field, newVal)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
