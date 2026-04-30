import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Save, Globe2, Building2, Info } from "lucide-react";

type AppRole =
  | "admin"
  | "ceo"
  | "callcenter"
  | "sales"
  | "responsabile_venditori"
  | "responsabile_callcenter"
  | "operatore_callcenter"
  | "venditore"
  | "amministrazione";

interface Policy {
  id: string;
  brand_id: string | null;
  is_default: boolean;
  level_1_minutes: number;
  level_2_minutes: number;
  level_3_minutes: number;
  level_1_roles: AppRole[];
  level_2_roles: AppRole[];
  level_3_roles: AppRole[];
  notes: string | null;
}

const ALL_ROLES: { value: AppRole; label: string; group: "callcenter" | "manager" | "admin" }[] = [
  { value: "operatore_callcenter", label: "Operatore call center", group: "callcenter" },
  { value: "callcenter", label: "Call center (legacy)", group: "callcenter" },
  { value: "responsabile_callcenter", label: "Responsabile call center", group: "manager" },
  { value: "responsabile_venditori", label: "Responsabile venditori", group: "manager" },
  { value: "venditore", label: "Venditore", group: "manager" },
  { value: "amministrazione", label: "Amministrazione", group: "manager" },
  { value: "admin", label: "Admin", group: "admin" },
  { value: "ceo", label: "CEO", group: "admin" },
];

const GLOBAL_KEY = "__global__";

function usePolicies() {
  return useQuery({
    queryKey: ["ticket-escalation-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_escalation_policies")
        .select("*")
        .order("brand_id", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
    staleTime: 60_000,
  });
}

export function TicketEscalationPolicyPanel() {
  const { brands } = useBrand();
  const { data: policies, isLoading } = usePolicies();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(GLOBAL_KEY);
  const [draft, setDraft] = useState<Policy | null>(null);

  const defaultPolicy = useMemo(
    () => policies?.find((p) => p.brand_id === null && p.is_default) ?? null,
    [policies],
  );

  const currentPolicy = useMemo(() => {
    if (!policies) return null;
    if (selected === GLOBAL_KEY) return defaultPolicy;
    return policies.find((p) => p.brand_id === selected) ?? null;
  }, [policies, selected, defaultPolicy]);

  // Sync draft when selection changes
  useEffect(() => {
    if (selected === GLOBAL_KEY) {
      setDraft(defaultPolicy ? { ...defaultPolicy } : null);
    } else if (currentPolicy) {
      setDraft({ ...currentPolicy });
    } else if (defaultPolicy) {
      // brand without override → start from default values
      setDraft({
        ...defaultPolicy,
        id: "",
        brand_id: selected,
        is_default: false,
        notes: null,
      });
    }
  }, [selected, currentPolicy, defaultPolicy]);

  const saveMutation = useMutation({
    mutationFn: async (p: Policy) => {
      const payload = {
        brand_id: p.brand_id,
        is_default: p.brand_id === null,
        level_1_minutes: p.level_1_minutes,
        level_2_minutes: p.level_2_minutes,
        level_3_minutes: p.level_3_minutes,
        level_1_roles: p.level_1_roles,
        level_2_roles: p.level_2_roles,
        level_3_roles: p.level_3_roles,
        notes: p.notes,
      };
      if (p.id) {
        const { error } = await supabase
          .from("ticket_escalation_policies")
          .update(payload)
          .eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ticket_escalation_policies")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Policy salvata", description: "Le nuove soglie saranno applicate al prossimo ciclo (5 min)." });
      queryClient.invalidateQueries({ queryKey: ["ticket-escalation-policies"] });
    },
    onError: (e: any) => {
      toast({ title: "Errore salvataggio", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading || !draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy escalation</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const valid =
    draft.level_1_minutes >= 1 &&
    draft.level_2_minutes > draft.level_1_minutes &&
    draft.level_3_minutes > draft.level_2_minutes &&
    draft.level_1_roles.length > 0 &&
    draft.level_2_roles.length > 0 &&
    draft.level_3_roles.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Policy escalation SLA</CardTitle>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL_KEY}>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  Default globale (fallback)
                </div>
              </SelectItem>
              {brands.map((b) => {
                const hasOverride = policies?.some((p) => p.brand_id === b.id);
                return (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {b.name}
                      {hasOverride && (
                        <Badge variant="outline" className="text-[10px]">override</Badge>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Soglie espresse in minuti dal momento del breach SLA. I ruoli sono provati in ordine:
            il primo utente attivo trovato nel brand riceve notifica e action suggestion.
            Se nessun ruolo è trovato nel brand, fallback automatico ad admin/CEO globali.
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <LevelEditor
            level={1}
            minutes={draft.level_1_minutes}
            roles={draft.level_1_roles}
            onChangeMinutes={(v) => setDraft({ ...draft, level_1_minutes: v })}
            onChangeRoles={(r) => setDraft({ ...draft, level_1_roles: r })}
          />
          <LevelEditor
            level={2}
            minutes={draft.level_2_minutes}
            roles={draft.level_2_roles}
            onChangeMinutes={(v) => setDraft({ ...draft, level_2_minutes: v })}
            onChangeRoles={(r) => setDraft({ ...draft, level_2_roles: r })}
          />
          <LevelEditor
            level={3}
            minutes={draft.level_3_minutes}
            roles={draft.level_3_roles}
            onChangeMinutes={(v) => setDraft({ ...draft, level_3_minutes: v })}
            onChangeRoles={(r) => setDraft({ ...draft, level_3_roles: r })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="policy-notes">Note interne</Label>
          <Textarea
            id="policy-notes"
            value={draft.notes ?? ""}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Es: brand high-touch, escalation più aggressiva richiesta dal cliente."
            rows={2}
          />
        </div>

        <div className="flex justify-end items-center gap-3">
          {!valid && (
            <span className="text-xs text-destructive">
              L1 &lt; L2 &lt; L3 e ogni livello deve avere almeno un ruolo destinatario
            </span>
          )}
          <Button
            onClick={() => draft && saveMutation.mutate(draft)}
            disabled={!valid || saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            Salva policy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LevelEditor({
  level,
  minutes,
  roles,
  onChangeMinutes,
  onChangeRoles,
}: {
  level: 1 | 2 | 3;
  minutes: number;
  roles: AppRole[];
  onChangeMinutes: (v: number) => void;
  onChangeRoles: (r: AppRole[]) => void;
}) {
  const tone =
    level === 3 ? "border-destructive/40" : level === 2 ? "border-orange-300/50" : "border-yellow-300/50";

  const toggleRole = (role: AppRole) => {
    if (roles.includes(role)) {
      onChangeRoles(roles.filter((r) => r !== role));
    } else {
      onChangeRoles([...roles, role]);
    }
  };

  return (
    <div className={`rounded-lg border ${tone} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Livello {level}</span>
        <Badge variant="outline">L{level}</Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`mins-${level}`} className="text-xs">Minuti dal breach SLA</Label>
        <Input
          id={`mins-${level}`}
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => onChangeMinutes(Math.max(1, Number(e.target.value) || 0))}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Ruoli destinatari (in ordine di priorità)</Label>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
          {ALL_ROLES.map((r) => {
            const idx = roles.indexOf(r.value);
            const checked = idx >= 0;
            return (
              <label
                key={r.value}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleRole(r.value)} />
                <span className="flex-1">{r.label}</span>
                {checked && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                    #{idx + 1}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
