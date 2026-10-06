import { useMemo, useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient as db } from "@/integrations/supabase/untypedClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Recipient { id: string; form_id: string; form_name: string | null; recipient_email: string; is_active: boolean }
interface Props {
  metaAppId: string;
  forms: Array<{ id: string; name: string; leads_count?: number }>;
  formsLoading: boolean;
}

const emailSchema = z.string().trim().email().max(255);

export function MetaFormEmailRecipients({ metaAppId, forms, formsLoading }: Props) {
  const qc = useQueryClient();
  const key = ["meta-form-email-recipients", metaAppId];
  const [formId, setFormId] = useState("");
  const [emailsRaw, setEmailsRaw] = useState("");

  const { data: list = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db
        .from("meta_form_email_recipients")
        .select("id, form_id, form_name, recipient_email, is_active")
        .eq("meta_app_id", metaAppId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Recipient[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const formLabel = (r: Pick<Recipient, "form_id" | "form_name">) =>
    r.form_name || forms.find((f) => f.id === r.form_id)?.name || `Modulo ${r.form_id}`;

  // Group recipients by module, one heading per form.
  const grouped = useMemo(() => {
    const map = new Map<string, Recipient[]>();
    for (const r of list) {
      const arr = map.get(r.form_id) ?? [];
      arr.push(r);
      map.set(r.form_id, arr);
    }
    return [...map.entries()];
  }, [list]);

  const parseEmails = (): { valid: string[]; duplicates: string[]; invalid: string[] } => {
    const tokens = emailsRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const duplicates: string[] = [];
    const invalid: string[] = [];
    const alreadyForForm = new Set(list.filter((r) => r.form_id === formId).map((r) => r.recipient_email));
    for (const t of tokens) {
      if (!emailSchema.safeParse(t).success) { invalid.push(t); continue; }
      if (seen.has(t) || alreadyForForm.has(t)) { duplicates.push(t); continue; }
      seen.add(t);
      valid.push(t);
    }
    return { valid, duplicates, invalid };
  };
  const parsed = parseEmails();
  const canAdd = !!formId && parsed.valid.length > 0;

  const add = useMutation({
    mutationFn: async () => {
      const { valid, duplicates, invalid } = parseEmails();
      if (!formId) throw new Error("Scegli il modulo");
      if (!valid.length) throw new Error("Nessun indirizzo email valido");
      const { data: u } = await db.auth.getUser();
      const rows = valid.map((email) => ({
        meta_app_id: metaAppId,
        form_id: formId,
        form_name: forms.find((f) => f.id === formId)?.name ?? null,
        recipient_email: email,
        created_by: u.user?.id ?? null,
      }));
      const { error } = await db.from("meta_form_email_recipients").insert(rows);
      if (error) throw error;
      return { added: valid.length, duplicates: duplicates.length, invalid: invalid.length };
    },
    onSuccess: ({ added, duplicates, invalid }) => {
      setEmailsRaw("");
      invalidate();
      toast.success(`${added} ${added === 1 ? "destinatario aggiunto" : "destinatari aggiunti"}`);
      if (duplicates > 0) toast.warning(`${duplicates} indirizzo/i già presente/i per il modulo`);
      if (invalid > 0) toast.warning(`${invalid} indirizzo/i non valido/i ignorato/i`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (r: Recipient) => {
      const { error } = await db.from("meta_form_email_recipients").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meta_form_email_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Destinatario rimosso"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> Notifiche email</p>
        <p className="text-xs text-muted-foreground">Ogni nuovo lead del modulo scelto viene inviato a tutti gli indirizzi elencati.</p>
      </div>
      {grouped.map(([fId, recips]) => (
        <div key={fId} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium truncate">{formLabel(recips[0])}</p>
          {recips.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <p className="flex-1 min-w-0 text-sm truncate">{r.recipient_email}</p>
              <Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} aria-label="Attiva invio email" />
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Elimina destinatario">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ))}
      <Select value={formId} onValueChange={setFormId}>
        <SelectTrigger><SelectValue placeholder={formsLoading ? "Carico i moduli da Meta..." : "Scegli il modulo"} /></SelectTrigger>
        <SelectContent>
          {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {f.leads_count ?? 0} lead</SelectItem>)}
        </SelectContent>
      </Select>
      <Textarea
        placeholder="Un indirizzo per riga, oppure separati da virgola o punto e virgola"
        value={emailsRaw}
        onChange={(e) => setEmailsRaw(e.target.value)}
      />
      <Button className="w-full" variant="secondary" disabled={!canAdd || add.isPending} onClick={() => add.mutate()}>
        Aggiungi destinatari
      </Button>
    </div>
  );
}
