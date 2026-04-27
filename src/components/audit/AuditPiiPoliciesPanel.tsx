import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, EyeOff, Shield, Trash2, Plus, Loader2 } from "lucide-react";
import {
  useAllPiiPolicies,
  useUpsertPiiPolicy,
  useDeletePiiPolicy,
  type MaskStrategy,
  type PiiPolicy,
} from "@/hooks/useAuditPiiPolicies";
import type { AppRole } from "@/types/database";

const ALL_ROLES: AppRole[] = [
  "admin",
  "ceo",
  "amministrazione",
  "responsabile_venditori",
  "responsabile_callcenter",
  "venditore",
  "operatore_callcenter",
];

const STRATEGY_LABELS: Record<MaskStrategy, string> = {
  full: "Completo (••••)",
  partial: "Parziale (j***@dom.com)",
  hash: "Hash (#a1b2c3d4)",
  none: "Nessuno (in chiaro)",
};

const STRATEGY_COLOR: Record<MaskStrategy, "destructive" | "default" | "secondary" | "outline"> = {
  full: "destructive",
  partial: "default",
  hash: "secondary",
  none: "outline",
};

export function AuditPiiPoliciesPanel() {
  const { data: policies = [], isLoading } = useAllPiiPolicies();
  const upsert = useUpsertPiiPolicy();
  const del = useDeletePiiPolicy();

  const [editing, setEditing] = useState<Partial<PiiPolicy>>({
    field_pattern: "",
    strategy: "partial",
    exempt_roles: ["admin"],
    description: "",
    is_active: true,
  });

  const handleSave = () => {
    if (!editing.field_pattern?.trim()) return;
    upsert.mutate(
      {
        field_pattern: editing.field_pattern.trim().toLowerCase(),
        strategy: (editing.strategy ?? "partial") as MaskStrategy,
        exempt_roles: editing.exempt_roles ?? [],
        description: editing.description ?? "",
        is_active: editing.is_active ?? true,
      },
      {
        onSuccess: () =>
          setEditing({
            field_pattern: "",
            strategy: "partial",
            exempt_roles: ["admin"],
            description: "",
            is_active: true,
          }),
      }
    );
  };

  const toggleRole = (role: AppRole) => {
    const current = editing.exempt_roles ?? [];
    setEditing({
      ...editing,
      exempt_roles: current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Aggiungi / aggiorna policy PII
          </CardTitle>
          <CardDescription>
            Definisci pattern di campo (es. <code>email</code>, <code>phone</code>,{" "}
            <code>tax_code</code>) e quale strategia di mascheramento applicare. I ruoli esentati
            vedranno il valore in chiaro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Pattern campo</Label>
              <Input
                placeholder="email, phone, codice_fiscale…"
                value={editing.field_pattern ?? ""}
                onChange={(e) => setEditing({ ...editing, field_pattern: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Strategia</Label>
              <Select
                value={editing.strategy ?? "partial"}
                onValueChange={(v) => setEditing({ ...editing, strategy: v as MaskStrategy })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STRATEGY_LABELS) as MaskStrategy[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STRATEGY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrizione</Label>
              <Input
                placeholder="Note opzionali"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Ruoli esentati (vedono in chiaro)</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES.map((role) => {
                const active = (editing.exempt_roles ?? []).includes(role);
                return (
                  <Badge
                    key={role}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleRole(role)}
                  >
                    {active ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                    {role}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="active-toggle"
                checked={editing.is_active ?? true}
                onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
              />
              <Label htmlFor="active-toggle" className="text-sm cursor-pointer">
                Policy attiva
              </Label>
            </div>
            <Button onClick={handleSave} disabled={!editing.field_pattern?.trim() || upsert.isPending}>
              {upsert.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Salva policy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy attive ({policies.length})</CardTitle>
          <CardDescription>
            Le regole vengono applicate in tempo reale al diff viewer degli audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
          ) : policies.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nessuna policy configurata.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Strategia</TableHead>
                  <TableHead>Ruoli esentati</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{p.field_pattern}</div>
                      {p.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STRATEGY_COLOR[p.strategy]}>
                        {STRATEGY_LABELS[p.strategy]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.exempt_roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">nessuno</span>
                        ) : (
                          p.exempt_roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) =>
                          upsert.mutate({
                            field_pattern: p.field_pattern,
                            strategy: p.strategy,
                            exempt_roles: p.exempt_roles,
                            description: p.description ?? "",
                            is_active: v,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => del.mutate(p.id)}
                        disabled={del.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
