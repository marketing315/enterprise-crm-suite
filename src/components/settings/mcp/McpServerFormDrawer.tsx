import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUpsertMcpServer, type McpServer, type McpServerStatus, type McpTransport } from "@/hooks/useMcpData";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  server: McpServer | null;
}

interface FormValues {
  name: string;
  version: string;
  transport: McpTransport;
  endpoint: string;
  status: McpServerStatus;
  description: string;
}

export function McpServerFormDrawer({ open, onOpenChange, server }: Props) {
  const upsert = useUpsertMcpServer();
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: { name: "", version: "1.0.0", transport: "streamable_http", endpoint: "", status: "active", description: "" },
  });

  useEffect(() => {
    if (server) {
      reset({
        name: server.name,
        version: server.version,
        transport: server.transport,
        endpoint: server.endpoint || "",
        status: server.status,
        description: server.description || "",
      });
    } else {
      reset({ name: "", version: "1.0.0", transport: "streamable_http", endpoint: "", status: "active", description: "" });
    }
  }, [server, reset]);

  const onSubmit = (data: FormValues) => {
    upsert.mutate(
      { ...data, id: server?.id },
      {
        onSuccess: () => { toast.success(server ? "Server aggiornato" : "Server creato"); onOpenChange(false); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{server ? "Modifica Server MCP" : "Nuovo Server MCP"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input {...register("name", { required: true })} placeholder="es. crm-internal" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Versione</Label>
              <Input {...register("version")} placeholder="1.0.0" />
            </div>
            <div className="space-y-2">
              <Label>Trasporto</Label>
              <Select value={watch("transport")} onValueChange={(v) => setValue("transport", v as McpTransport)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="stdio">Stdio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Endpoint</Label>
            <Input {...register("endpoint")} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Stato</Label>
            <Select value={watch("status")} onValueChange={(v) => setValue("status", v as McpServerStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Attivo</SelectItem>
                <SelectItem value="disabled">Disabilitato</SelectItem>
                <SelectItem value="degraded">Degradato</SelectItem>
                <SelectItem value="maintenance">Manutenzione</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Textarea {...register("description")} rows={3} />
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
