import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUpsertMcpPolicy, type McpPolicy, type McpPolicyAction } from "@/hooks/useMcpData";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  policy: McpPolicy | null;
}

interface FormValues {
  role: string;
  tool_pattern: string;
  action: McpPolicyAction;
  priority: number;
  brand_scope: string;
  description: string;
}

export function McpPolicyFormDrawer({ open, onOpenChange, policy }: Props) {
  const upsert = useUpsertMcpPolicy();
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: { role: "", tool_pattern: "*", action: "deny", priority: 0, brand_scope: "", description: "" },
  });

  useEffect(() => {
    if (policy) {
      reset({
        role: policy.role,
        tool_pattern: policy.tool_pattern,
        action: policy.action,
        priority: policy.priority,
        brand_scope: policy.brand_scope || "",
        description: policy.description || "",
      });
    } else {
      reset({ role: "", tool_pattern: "*", action: "deny", priority: 0, brand_scope: "", description: "" });
    }
  }, [policy, reset]);

  const onSubmit = (data: FormValues) => {
    upsert.mutate(
      {
        id: policy?.id,
        role: data.role,
        tool_pattern: data.tool_pattern,
        action: data.action,
        priority: data.priority,
        brand_scope: data.brand_scope || null,
        description: data.description || null,
      },
      {
        onSuccess: () => { toast.success(policy ? "Policy aggiornata" : "Policy creata"); onOpenChange(false); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{policy ? "Modifica Policy" : "Nuova Policy"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Input {...register("role", { required: true })} placeholder="es. admin, operatore_callcenter" />
          </div>
          <div className="space-y-2">
            <Label>Tool Pattern</Label>
            <Input {...register("tool_pattern")} placeholder="es. crm.* o keplero.lookup" />
            <p className="text-xs text-muted-foreground">Usa * come wildcard. Es: crm.*, keplero.*, *</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Azione</Label>
              <Select value={watch("action")} onValueChange={(v) => setValue("action", v as McpPolicyAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                  <SelectItem value="require_approval">Require Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priorità</Label>
              <Input type="number" {...register("priority", { valueAsNumber: true })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Brand Scope (UUID, vuoto = globale)</Label>
            <Input {...register("brand_scope")} placeholder="Lascia vuoto per globale" />
          </div>
          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Textarea {...register("description")} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Salvataggio..." : "Salva"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
