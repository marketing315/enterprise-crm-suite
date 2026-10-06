import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient as db } from "@/integrations/supabase/untypedClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/BrandContext";
import type { MetaApp } from "@/hooks/useMetaApps";

interface Route {
  id: string;
  form_id: string;
  form_name: string | null;
  target_brand_id: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metaApp: MetaApp | null;
}

export function MetaFormRoutesDialog({ open, onOpenChange, metaApp }: Props) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [targetBrand, setTargetBrand] = useState("");
  const key = ["meta-form-routes", metaApp?.id];

  const { data: routes = [] } = useQuery({
    queryKey: key,
    enabled: open && !!metaApp,
    queryFn: async () => {
      const { data, error } = await db
        .from("meta_form_brand_routes")
        .select("id, form_id, form_name, target_brand_id, is_active")
        .eq("meta_app_id", metaApp!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Route[];
    },
  });

  // All Lead Ads forms of the page, live from Meta (names included).
  const { data: formsResp, isLoading: formsLoading } = useQuery({
    queryKey: ["meta-page-forms", metaApp?.id],
    enabled: open && !!metaApp,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.functions.invoke("meta-list-forms", { body: { meta_app_id: metaApp!.id } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const details = ctx ? await ctx.text().catch(() => error.message) : error.message;
        throw new Error(details);
      }
      return data as { forms: Array<{ id: string; name: string; status?: string; leads_count?: number }> };
    },
  });
  const forms = (formsResp?.forms ?? []).filter((f) => f.status !== "ARCHIVED");
  const formLabel = (id: string) => formsResp?.forms.find((f) => f.id === id)?.name;

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await db.auth.getUser();
      const { error } = await db.from("meta_form_brand_routes").insert({
        meta_app_id: metaApp!.id,
        form_id: formId.trim(),
        form_name: formName.trim() || null,
        target_brand_id: targetBrand,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setFormId(""); setFormName(""); setTargetBrand(""); invalidate(); toast.success("Regola aggiunta"); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Esiste già una regola per questo modulo" : e.message),
  });

  const toggle = useMutation({
    mutationFn: async (r: Route) => {
      const { error } = await db.from("meta_form_brand_routes").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meta_form_brand_routes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Regola rimossa"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id;
  const otherBrands = brands.filter((b) => b.id !== metaApp?.brand_id);
  const validId = /^\d{5,30}$/.test(formId.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Regole di smistamento</DialogTitle>
          <DialogDescription>
            I lead dei moduli indicati qui vanno sul brand scelto. Tutti gli altri continuano ad arrivare su {metaApp ? brandName(metaApp.brand_id) : "il brand della pagina"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {routes.length === 0 && <p className="text-sm text-muted-foreground">Nessuna regola: tutti i lead vanno sul brand della pagina.</p>}
          {routes.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.form_name || formLabel(r.form_id) || `Modulo ${r.form_id}`}</p>
                <p className="text-xs text-muted-foreground truncate">ID {r.form_id} → {brandName(r.target_brand_id)}</p>
              </div>
              <Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} aria-label="Attiva regola" />
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Elimina regola">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Nuova regola</p>
          <Select
            value={forms.some((f) => f.id === formId) ? formId : ""}
            onValueChange={(id) => { setFormId(id); setFormName(forms.find((f) => f.id === id)?.name ?? ""); }}
          >
            <SelectTrigger>
              <SelectValue placeholder={formsLoading ? "Carico i moduli da Meta..." : "Scegli il modulo"} />
            </SelectTrigger>
            <SelectContent>
              {forms.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name} · {f.leads_count ?? 0} lead</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="ID modulo Meta (es. 1234567890123456)" value={formId} onChange={(e) => setFormId(e.target.value)} />
          <Input placeholder="Nome modulo (facoltativo)" value={formName} onChange={(e) => setFormName(e.target.value)} />
          <Select value={targetBrand} onValueChange={setTargetBrand}>
            <SelectTrigger><SelectValue placeholder="Brand di destinazione" /></SelectTrigger>
            <SelectContent>
              {otherBrands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="w-full" disabled={!validId || !targetBrand || add.isPending} onClick={() => add.mutate()}>
            Aggiungi regola
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
