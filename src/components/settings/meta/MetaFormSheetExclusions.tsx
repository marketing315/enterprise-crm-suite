import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient as db } from "@/integrations/supabase/untypedClient";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Exclusion { id: string; form_id: string; form_name: string | null; is_active: boolean }
interface Props {
  metaAppId: string;
  forms: Array<{ id: string; name: string; leads_count?: number }>;
  formsLoading: boolean;
}

export function MetaFormSheetExclusions({ metaAppId, forms, formsLoading }: Props) {
  const qc = useQueryClient();
  const key = ["meta-form-sheet-exclusions", metaAppId];
  const [formId, setFormId] = useState("");

  const { data: list = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db
        .from("meta_form_sheet_exclusions")
        .select("id, form_id, form_name, is_active")
        .eq("meta_app_id", metaAppId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Exclusion[];
    },
  });

  const excludedIds = new Set(list.map((x) => x.form_id));
  const available = forms.filter((f) => !excludedIds.has(f.id));
  const nameOf = (x: Exclusion) => forms.find((f) => f.id === x.form_id)?.name ?? x.form_name ?? `Modulo ${x.form_id}`;

  const add = useMutation({
    mutationFn: async () => {
      const f = forms.find((x) => x.id === formId);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("meta_form_sheet_exclusions").insert({
        meta_app_id: metaAppId, form_id: formId, form_name: f?.name ?? null, created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setFormId(""); qc.invalidateQueries({ queryKey: key }); toast.success("Modulo escluso dal Google Sheet"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (x: Exclusion) => {
      const { error } = await db.from("meta_form_sheet_exclusions").update({ is_active: !x.is_active }).eq("id", x.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meta_form_sheet_exclusions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <Sheet className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Esclusione dal Google Sheet</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        I lead dei moduli esclusi arrivano comunque nel CRM, ma non vengono scritti sul Google Sheet.
      </p>

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((x) => (
            <div key={x.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span className="truncate">{nameOf(x)}</span>
              <div className="flex items-center gap-2">
                <Switch checked={x.is_active} onCheckedChange={() => toggle.mutate(x)} aria-label="Esclusione attiva" />
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(x.id)} aria-label="Rimuovi esclusione">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={formId} onValueChange={setFormId} disabled={formsLoading}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={formsLoading ? "Caricamento moduli…" : "Scegli il modulo da escludere"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => add.mutate()} disabled={!formId || add.isPending}>Escludi</Button>
      </div>
    </div>
  );
}
