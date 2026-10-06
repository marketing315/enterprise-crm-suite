import { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient as db } from "@/integrations/supabase/untypedClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [email, setEmail] = useState("");

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
  const formLabel = (r: Recipient) => r.form_name || forms.find((f) => f.id === r.form_id)?.name || `Modulo ${r.form_id}`;

  const add = useMutation({
    mutationFn: async () => {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) throw new Error("Email non valida");
      const { data: u } = await db.auth.getUser();
      const { error } = await db.from("meta_form_email_recipients").insert({
        meta_app_id: metaAppId,
        form_id: formId,
        form_name: forms.find((f) => f.id === formId)?.name ?? null,
        recipient_email: parsed.data.toLowerCase(),
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setEmail(""); invalidate(); toast.success("Destinatario aggiunto"); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Questa email è già impostata per il modulo" : e.message),
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
        <p className="text-xs text-muted-foreground">Ogni nuovo lead del modulo scelto viene inviato subito a questi indirizzi.</p>
      </div>
      {list.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.recipient_email}</p>
            <p className="text-xs text-muted-foreground truncate">{formLabel(r)}</p>
          </div>
          <Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} aria-label="Attiva invio email" />
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Elimina destinatario">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Select value={formId} onValueChange={setFormId}>
        <SelectTrigger><SelectValue placeholder={formsLoading ? "Carico i moduli da Meta..." : "Scegli il modulo"} /></SelectTrigger>
        <SelectContent>
          {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} · {f.leads_count ?? 0} lead</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="email" placeholder="Email destinatario" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button className="w-full" variant="secondary" disabled={!formId || !emailSchema.safeParse(email).success || add.isPending} onClick={() => add.mutate()}>
        Aggiungi destinatario
      </Button>
    </div>
  );
}
