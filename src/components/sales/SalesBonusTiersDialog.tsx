/**
 * F4 — Admin dialog gestione bonus tiers venditori per brand.
 * Versionati su `valid_from`/`valid_to`. Solo admin/ceo/responsabile_venditori.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Award } from "lucide-react";
import { useSalesBonusTiers, useUpsertBonusTier, useDeleteBonusTier } from "@/hooks/useSalesBonusTiers";

interface Props { brandId: string }

export function SalesBonusTiersDialog({ brandId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: tiers, isLoading } = useSalesBonusTiers(open ? brandId : null);
  const upsert = useUpsertBonusTier();
  const del = useDeleteBonusTier();

  const [form, setForm] = useState({
    label: "",
    threshold_gross: "",
    bonus_amount: "",
    bonus_percent: "",
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: "",
  });

  function reset() {
    setForm({ label: "", threshold_gross: "", bonus_amount: "", bonus_percent: "", valid_from: new Date().toISOString().slice(0, 10), valid_to: "" });
  }

  async function handleAdd() {
    if (!form.label || !form.threshold_gross) return;
    if (!form.bonus_amount && !form.bonus_percent) return;
    await upsert.mutateAsync({
      brand_id: brandId,
      label: form.label.trim(),
      threshold_gross: Number(form.threshold_gross),
      bonus_amount: form.bonus_amount ? Number(form.bonus_amount) : null,
      bonus_percent: form.bonus_percent ? Number(form.bonus_percent) : null,
      valid_from: form.valid_from,
      valid_to: form.valid_to || null,
    });
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Award className="h-4 w-4" />
          Bonus tiers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bonus tiers venditori</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-6 gap-2 items-end">
          <div className="col-span-2">
            <Label className="text-xs">Etichetta</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Es. Top performer" />
          </div>
          <div>
            <Label className="text-xs">Soglia lordo €</Label>
            <Input type="number" value={form.threshold_gross} onChange={(e) => setForm({ ...form, threshold_gross: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Bonus € fisso</Label>
            <Input type="number" value={form.bonus_amount} onChange={(e) => setForm({ ...form, bonus_amount: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Bonus %</Label>
            <Input type="number" step="0.01" value={form.bonus_percent} onChange={(e) => setForm({ ...form, bonus_percent: e.target.value })} />
          </div>
          <Button onClick={handleAdd} disabled={upsert.isPending} className="gap-1">
            <Plus className="h-4 w-4" /> Aggiungi
          </Button>
          <div>
            <Label className="text-xs">Valido dal</Label>
            <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Valido al (opz.)</Label>
            <Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </div>
        </div>

        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etichetta</TableHead>
                <TableHead className="text-right">Soglia</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead>Validità</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5}>Caricamento…</TableCell></TableRow>}
              {!isLoading && tiers?.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground text-sm">Nessun tier configurato</TableCell></TableRow>}
              {tiers?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.label}</TableCell>
                  <TableCell className="text-right">€ {Number(t.threshold_gross).toLocaleString("it-IT")}</TableCell>
                  <TableCell className="text-right">
                    {t.bonus_amount ? `€ ${Number(t.bonus_amount).toLocaleString("it-IT")}` : ""}
                    {t.bonus_amount && t.bonus_percent ? " + " : ""}
                    {t.bonus_percent ? `${t.bonus_percent}%` : ""}
                  </TableCell>
                  <TableCell className="text-xs">{t.valid_from} → {t.valid_to ?? "∞"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate({ id: t.id, brand_id: brandId })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
