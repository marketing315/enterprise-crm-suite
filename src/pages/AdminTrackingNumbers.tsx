import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Pencil, Search, Phone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

const NUMBER_TYPES = [
  { value: "tollfree", label: "Numero verde" },
  { value: "mobile", label: "Mobile" },
  { value: "landline", label: "Fisso" },
  { value: "virtual", label: "Virtuale" },
] as const;

const DIRECTIONS = [
  { value: "inbound", label: "In entrata" },
  { value: "outbound", label: "In uscita" },
  { value: "both", label: "Entrambe" },
] as const;

// E.164: + seguito da 8-15 cifre
const formSchema = z.object({
  phone_e164: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Formato E.164: es. +390212345678"),
  label: z.string().trim().min(2, "Min 2 caratteri").max(120),
  number_type: z.enum(["tollfree", "mobile", "landline", "virtual"]),
  direction: z.enum(["inbound", "outbound", "both"]),
  channel_id: z.string().uuid().nullable().optional(),
  campaign_id: z.string().uuid().nullable().optional(),
  broadcaster: z.string().trim().max(120).nullable().optional(),
  voispeed_did: z.string().trim().max(64).nullable().optional(),
  default_operator_user_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type TrackingNumber = {
  id: string;
  brand_id: string;
  phone_e164: string;
  label: string;
  number_type: string;
  direction: string;
  channel_id: string | null;
  campaign_id: string | null;
  broadcaster: string | null;
  voispeed_did: string | null;
  default_operator_user_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const NONE = "__none__";

function emptyForm(): FormValues {
  return {
    phone_e164: "",
    label: "",
    number_type: "tollfree",
    direction: "both",
    channel_id: null,
    campaign_id: null,
    broadcaster: null,
    voispeed_did: null,
    default_operator_user_id: null,
    is_active: true,
    notes: null,
  };
}

export default function AdminTrackingNumbers() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrackingNumber | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [toDelete, setToDelete] = useState<TrackingNumber | null>(null);

  const brandId = currentBrand?.id ?? null;
  const enabled = !!brandId && !isAllBrandsSelected;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["tracking_numbers", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_numbers")
        .select("*")
        .eq("brand_id", brandId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TrackingNumber[];
    },
  });

  const { data: channels } = useQuery({
    queryKey: ["marketing_channels_for_tn", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_channels")
        .select("id,name,type,is_active")
        .eq("brand_id", brandId!)
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["marketing_campaigns_for_tn", brandId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("id,name,channel_id")
        .eq("brand_id", brandId!)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredCampaigns = useMemo(
    () => (form.channel_id ? (campaigns ?? []).filter((c: any) => c.channel_id === form.channel_id) : (campaigns ?? [])),
    [campaigns, form.channel_id]
  );

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const term = search.trim().toLowerCase();
    return list.filter((r) => {
      if (activeFilter === "active" && !r.is_active) return false;
      if (activeFilter === "inactive" && r.is_active) return false;
      if (!term) return true;
      return (
        r.label.toLowerCase().includes(term) ||
        r.phone_e164.toLowerCase().includes(term) ||
        (r.broadcaster ?? "").toLowerCase().includes(term) ||
        (r.voispeed_did ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, activeFilter]);

  const channelName = (id: string | null) => channels?.find((c: any) => c.id === id)?.name ?? "—";
  const campaignName = (id: string | null) => campaigns?.find((c: any) => c.id === id)?.name ?? "—";

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (tn: TrackingNumber) => {
    setEditing(tn);
    setForm({
      phone_e164: tn.phone_e164,
      label: tn.label,
      number_type: tn.number_type as FormValues["number_type"],
      direction: tn.direction as FormValues["direction"],
      channel_id: tn.channel_id,
      campaign_id: tn.campaign_id,
      broadcaster: tn.broadcaster,
      voispeed_did: tn.voispeed_did,
      default_operator_user_id: tn.default_operator_user_id,
      is_active: tn.is_active,
      notes: tn.notes,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const upsertMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!brandId) throw new Error("Brand non selezionato");
      const payload = {
        ...values,
        brand_id: brandId,
        broadcaster: values.broadcaster?.trim() || null,
        voispeed_did: values.voispeed_did?.trim() || null,
        notes: values.notes?.trim() || null,
        channel_id: values.channel_id || null,
        campaign_id: values.campaign_id || null,
        default_operator_user_id: values.default_operator_user_id || null,
      };
      if (editing) {
        const { error } = await supabase.from("tracking_numbers").update(payload as any).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tracking_numbers").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking_numbers", brandId] });
      setDialogOpen(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (tn: TrackingNumber) => {
      const { error } = await supabase
        .from("tracking_numbers")
        .update({ is_active: !tn.is_active })
        .eq("id", tn.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracking_numbers", brandId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracking_numbers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking_numbers", brandId] });
      setToDelete(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    upsertMutation.mutate(parsed.data, {
      onSuccess: () => feedback.success(editing ? "Numero aggiornato" : "Numero creato"),
      onError: feedback.error,
    });
  };

  if (!enabled) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Phone}
              title="Seleziona un brand"
              description="Per gestire i numeri di tracking devi avere un brand specifico selezionato (non 'Tutti i brand')."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Numeri di tracking</h1>
          <p className="text-muted-foreground">
            Registry dei numeri telefonici nominati (numeri verdi TV, cellulari) con mapping a canale, campagna e operatore.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuovo numero
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Elenco</CardTitle>
              <CardDescription>
                {rows ? `${filtered.length} di ${rows.length}` : "—"} numeri attivi sul brand
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca etichetta, numero, emittente, DID…"
                  className="pl-9 w-full sm:w-80"
                />
              </div>
              <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Solo attivi</SelectItem>
                  <SelectItem value="inactive">Solo inattivi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} columns={7} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="Nessun numero trovato"
              description={
                rows && rows.length > 0
                  ? "Modifica i filtri per visualizzare altri numeri."
                  : "Crea il primo numero di tracking per iniziare a mappare le chiamate ai canali."
              }
              action={
                rows && rows.length === 0
                  ? { label: "Nuovo numero", onClick: openCreate }
                  : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etichetta</TableHead>
                    <TableHead>Numero (E.164)</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Canale</TableHead>
                    <TableHead>Campagna</TableHead>
                    <TableHead>Emittente</TableHead>
                    <TableHead>Attivo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tn) => (
                    <TableRow key={tn.id}>
                      <TableCell className="font-medium">{tn.label}</TableCell>
                      <TableCell className="font-mono text-sm">{tn.phone_e164}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {NUMBER_TYPES.find((t) => t.value === tn.number_type)?.label ?? tn.number_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{channelName(tn.channel_id)}</TableCell>
                      <TableCell>{campaignName(tn.campaign_id)}</TableCell>
                      <TableCell>{tn.broadcaster ?? "—"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={tn.is_active}
                          onCheckedChange={() =>
                            withFeedback(toggleMutation.mutateAsync(tn), {
                              successMessage: tn.is_active ? "Numero disattivato" : "Numero attivato",
                            })
                          }
                          aria-label={tn.is_active ? "Disattiva" : "Attiva"}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(tn)} aria-label="Modifica">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToDelete(tn)}
                            aria-label="Elimina"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Crea/Modifica */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica numero di tracking" : "Nuovo numero di tracking"}</DialogTitle>
            <DialogDescription>
              I campi sono validati lato client e server (RLS finance). Il numero deve essere in formato E.164.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="label">Etichetta *</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Es. Verde TV Lombardia"
                  maxLength={120}
                />
                {formErrors.label && <p className="text-sm text-destructive">{formErrors.label}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Numero E.164 *</Label>
                <Input
                  id="phone"
                  value={form.phone_e164}
                  onChange={(e) => setForm({ ...form, phone_e164: e.target.value })}
                  placeholder="+390212345678"
                  className="font-mono"
                />
                {formErrors.phone_e164 && <p className="text-sm text-destructive">{formErrors.phone_e164}</p>}
              </div>
              <div className="space-y-2">
                <Label>Tipo numero</Label>
                <Select
                  value={form.number_type}
                  onValueChange={(v) => setForm({ ...form, number_type: v as FormValues["number_type"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NUMBER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Direzione</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm({ ...form, direction: v as FormValues["direction"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Canale marketing</Label>
                <Select
                  value={form.channel_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, channel_id: v === NONE ? null : v, campaign_id: null })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(channels ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campagna</Label>
                <Select
                  value={form.campaign_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, campaign_id: v === NONE ? null : v })}
                  disabled={!form.channel_id && filteredCampaigns.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {filteredCampaigns.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcaster">Emittente (TV)</Label>
                <Input
                  id="broadcaster"
                  value={form.broadcaster ?? ""}
                  onChange={(e) => setForm({ ...form, broadcaster: e.target.value })}
                  placeholder="Es. Telelombardia"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="did">VoiSpeed DID</Label>
                <Input
                  id="did"
                  value={form.voispeed_did ?? ""}
                  onChange={(e) => setForm({ ...form, voispeed_did: e.target.value })}
                  placeholder="Identificativo DID"
                  maxLength={64}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Annotazioni interne"
                rows={3}
                maxLength={2000}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="active">Attivo</Label>
                <p className="text-sm text-muted-foreground">
                  Solo i numeri attivi vengono usati per attribuzione e dispatch.
                </p>
              </div>
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Salvataggio…" : editing ? "Salva modifiche" : "Crea numero"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il numero?</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà rimosso <b>{toDelete?.label}</b> ({toDelete?.phone_e164}). Le attribuzioni già registrate
              manterranno il riferimento nullo (ON DELETE SET NULL). Per pause temporanee, preferisci disattivare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                toDelete &&
                withFeedback(deleteMutation.mutateAsync(toDelete.id), { successMessage: "Numero eliminato" })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
