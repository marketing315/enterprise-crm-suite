import { useState, useRef } from "react";
import { UserPlus, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SetupStepCard } from "../SetupStepCard";
import { useMarkSetupStep } from "@/hooks/useAdminSetupProgress";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { AppRole } from "@/types/database";

interface Row {
  email: string;
  full_name: string;
  role: AppRole;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "responsabile_venditori", label: "Responsabile vendite" },
  { value: "responsabile_callcenter", label: "Responsabile call center" },
  { value: "venditore", label: "Venditore" },
  { value: "operatore_callcenter", label: "Operatore call center" },
  { value: "amministrazione", label: "Amministrazione" },
  { value: "admin", label: "Admin" },
];

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function Step2InviteUsers({ completed, stepNumber }: { completed: boolean; stepNumber: number }) {
  const { currentBrand } = useBrand();
  const markStep = useMarkSetupStep();
  const [rows, setRows] = useState<Row[]>([{ email: "", full_name: "", role: "venditore" }]);
  const [submitting, setSubmitting] = useState(false);
  // H8 — guardia double-submit (admin-create-user è side-effect costoso)
  const submitInFlightRef = useRef(false);

  const update = (i: number, patch: Partial<Row>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (rows.length >= 3) return;
    setRows((r) => [...r, { email: "", full_name: "", role: "venditore" }]);
  };

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const handleInvite = async () => {
    const valid = rows.filter((r) => r.email.includes("@") && r.full_name.trim());
    if (valid.length === 0) return toast.error("Inserisci almeno un utente con email e nome");
    if (!currentBrand) return toast.error("Seleziona prima un brand");
    if (submitting || submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (const r of valid) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: r.email,
            password: randomPassword(),
            full_name: r.full_name,
            brand_ids: [currentBrand.id],
            role: r.role,
          },
        });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
        ok += 1;
      } catch (e) {
        fail += 1;
        toast.error(`${r.email}: ${(e as Error).message}`);
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      toast.success(`${ok} utente/i invitato/i. Password temporanea generata.`);
      markStep.mutate("users_invited");
      setRows([{ email: "", full_name: "", role: "venditore" }]);
    }
    if (fail > 0 && ok === 0) toast.error("Nessun invito riuscito");
  };

  return (
    <SetupStepCard
      step={stepNumber}
      icon={UserPlus}
      title="Invita 2-3 utenti"
      description="Crea i primi utenti del team con i loro ruoli. Riceveranno una password temporanea da cambiare al primo accesso."
      completed={completed}
    >
      {!completed && (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_180px_auto]">
              <div className="space-y-1">
                {i === 0 && <Label className="text-xs">Email</Label>}
                <Input placeholder="email@azienda.com" value={row.email} onChange={(e) => update(i, { email: e.target.value })} />
              </div>
              <div className="space-y-1">
                {i === 0 && <Label className="text-xs">Nome completo</Label>}
                <Input placeholder="Mario Rossi" value={row.full_name} onChange={(e) => update(i, { full_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                {i === 0 && <Label className="text-xs">Ruolo</Label>}
                <Select value={row.role} onValueChange={(v) => update(i, { role: v as AppRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {rows.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Rimuovi">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= 3}>
              <Plus className="mr-1 h-4 w-4" /> Aggiungi
            </Button>
            <Button onClick={handleInvite} disabled={submitting}>
              {submitting ? "Invito in corso..." : "Invita utenti"}
            </Button>
          </div>
        </div>
      )}
    </SetupStepCard>
  );
}
