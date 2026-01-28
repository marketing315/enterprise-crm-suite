import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Edit, Trash2, ExternalLink, TestTube } from "lucide-react";
import { useMetaApps, MetaApp } from "@/hooks/useMetaApps";
import { MetaAppFormDrawer } from "./MetaAppFormDrawer";
import { DeleteMetaAppDialog } from "./DeleteMetaAppDialog";
import { toast } from "sonner";

export function MetaAppsList() {
  const { metaApps, isLoading, toggleActive } = useMetaApps();
  const [editingApp, setEditingApp] = useState<MetaApp | null>(null);
  const [deletingApp, setDeletingApp] = useState<MetaApp | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiato negli appunti`);
  };

  const getWebhookUrl = (brandSlug: string) => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    return `${baseUrl}/functions/v1/meta-leads-webhook/${brandSlug}`;
  };

  const testWebhook = async (app: MetaApp) => {
    const webhookUrl = getWebhookUrl(app.brand_slug);
    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${app.verify_token}&hub.challenge=test_challenge_123`;
    
    try {
      const res = await fetch(testUrl);
      if (res.ok) {
        const text = await res.text();
        if (text === "test_challenge_123") {
          toast.success("Webhook verificato con successo!");
        } else {
          toast.warning(`Risposta inattesa: ${text}`);
        }
      } else {
        toast.error(`Verifica fallita: ${res.status}`);
      }
    } catch (error) {
      toast.error("Errore nella verifica del webhook");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (metaApps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nessuna Meta App configurata. Clicca "Aggiungi Meta App" per iniziare.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand Slug</TableHead>
            <TableHead>Page ID</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Webhook URL</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metaApps.map((app) => (
            <TableRow key={app.id}>
              <TableCell className="font-medium">{app.brand_slug}</TableCell>
              <TableCell>{app.page_id || "-"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={app.is_active}
                    onCheckedChange={(checked) => 
                      toggleActive.mutate({ id: app.id, is_active: checked })
                    }
                  />
                  <Badge variant={app.is_active ? "default" : "secondary"}>
                    {app.is_active ? "Attivo" : "Inattivo"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                    {getWebhookUrl(app.brand_slug)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(getWebhookUrl(app.brand_slug), "Webhook URL")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => testWebhook(app)}
                    title="Test Webhook"
                  >
                    <TestTube className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingApp(app)}
                    title="Modifica"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingApp(app)}
                    title="Elimina"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <MetaAppFormDrawer
        open={!!editingApp}
        onOpenChange={(open) => !open && setEditingApp(null)}
        editingApp={editingApp}
      />

      <DeleteMetaAppDialog
        open={!!deletingApp}
        onOpenChange={(open) => !open && setDeletingApp(null)}
        metaApp={deletingApp}
      />
    </>
  );
}
