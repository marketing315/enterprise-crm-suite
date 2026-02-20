import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserCheck, Users } from "lucide-react";
import { useTeamMembers } from "@/hooks/useTeam";
import { useUserModuleAccessByBrand, useUpsertUserModuleAccess } from "@/hooks/useUserModuleAccess";
import { useBrand } from "@/contexts/BrandContext";

const ALL_MODULES: { key: string; label: string; category: "core" | "nice_to_have" }[] = [
  { key: "dashboard", label: "Dashboard", category: "core" },
  { key: "contacts", label: "Contatti", category: "core" },
  { key: "events", label: "Eventi Lead", category: "core" },
  { key: "pipeline", label: "Pipeline", category: "core" },
  { key: "sales", label: "Vendite", category: "core" },
  { key: "appointments", label: "Appuntamenti", category: "core" },
  { key: "tickets", label: "Ticket", category: "core" },
  { key: "notifications", label: "Notifiche", category: "core" },
  { key: "team", label: "Team", category: "core" },
  { key: "settings", label: "Impostazioni", category: "core" },
  { key: "products", label: "Prodotti", category: "core" },
  { key: "marketing", label: "Marketing", category: "core" },
  { key: "ai_governance", label: "Gestione AI", category: "core" },
  { key: "ai_metrics", label: "AI Metrics", category: "core" },
  { key: "ticket_trend", label: "Trend Ticket", category: "core" },
  { key: "webhooks_monitor", label: "Webhook Monitor", category: "core" },
  { key: "dlq_monitor", label: "DLQ Monitor", category: "core" },
  { key: "salesperson_kpi", label: "KPI Venditori", category: "core" },
  { key: "chat_team", label: "Chat Team", category: "nice_to_have" },
  { key: "ceo_dashboard", label: "Dashboard CEO", category: "nice_to_have" },
  { key: "company_finance", label: "Azienda / Finanza", category: "nice_to_have" },
  { key: "callcenter_kpi", label: "KPI Call Center", category: "nice_to_have" },
  { key: "analytics_advanced", label: "Analytics Avanzate", category: "nice_to_have" },
  { key: "capi_monitor", label: "CAPI Monitor", category: "nice_to_have" },
  { key: "pwa_install", label: "Installazione PWA", category: "nice_to_have" },
];

export function UserModuleAccessCard() {
  const { currentBrand } = useBrand();
  const { data: members = [], isLoading: loadingMembers } = useTeamMembers();
  const { data: accessList = [], isLoading: loadingAccess } = useUserModuleAccessByBrand();
  const upsertMutation = useUpsertUserModuleAccess();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Build a lookup: { `${userId}-${moduleKey}`: boolean }
  const accessMap = useMemo(() => {
    const map = new Map<string, boolean>();
    accessList.forEach((a) => {
      map.set(`${a.user_id}-${a.module_key}`, a.is_enabled);
    });
    return map;
  }, [accessList]);

  const selectedMember = members.find((m) => m.user_id === selectedUserId);

  const isModuleEnabled = (userId: string, moduleKey: string): boolean => {
    const key = `${userId}-${moduleKey}`;
    // Default: enabled (no override = all modules accessible)
    return accessMap.get(key) ?? true;
  };

  const handleToggle = (userId: string, moduleKey: string, currentValue: boolean) => {
    if (!currentBrand?.id) return;
    upsertMutation.mutate(
      {
        user_id: userId,
        brand_id: currentBrand.id,
        module_key: moduleKey,
        is_enabled: !currentValue,
      },
      {
        onSuccess: () => toast.success(`Modulo ${!currentValue ? "abilitato" : "disabilitato"}`),
        onError: (err) => toast.error(`Errore: ${err.message}`),
      }
    );
  };

  if (loadingMembers || loadingAccess) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Accesso moduli per utente
        </CardTitle>
        <CardDescription>
          Abilita o disabilita singoli moduli per ciascun utente. Per default tutti i moduli sono abilitati.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User selector */}
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedUserId ?? ""}
            onValueChange={(v) => setSelectedUserId(v || null)}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Seleziona un utente..." />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                  <span className="text-xs text-muted-foreground ml-2">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Module checklist */}
        {selectedUserId && selectedMember && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Moduli per <strong>{selectedMember.full_name || selectedMember.email}</strong>
            </p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_MODULES.map((mod) => {
                const enabled = isModuleEnabled(selectedUserId, mod.key);
                return (
                  <label
                    key={mod.key}
                    className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={() => handleToggle(selectedUserId, mod.key, enabled)}
                      disabled={upsertMutation.isPending}
                    />
                    <span className="text-sm flex-1">{mod.label}</span>
                    <Badge variant={mod.category === "core" ? "outline" : "secondary"} className="text-[10px] px-1.5">
                      {mod.category === "core" ? "Core" : "N2H"}
                    </Badge>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {!selectedUserId && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Seleziona un utente per gestire i moduli abilitati
          </p>
        )}
      </CardContent>
    </Card>
  );
}
