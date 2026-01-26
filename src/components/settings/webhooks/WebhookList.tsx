import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Webhook,
  Plus,
  MoreHorizontal,
  Pencil,
  Key,
  Trash2,
  Send,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  useWebhooks,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  WEBHOOK_EVENT_TYPES,
} from "@/hooks/useWebhooks";
import { WebhookFormDrawer } from "./WebhookFormDrawer";
import { RotateSecretDialog } from "./RotateSecretDialog";
import { DeleteWebhookDialog } from "./DeleteWebhookDialog";
import { SigningInfoDialog } from "./SigningInfoDialog";

export function WebhookList() {
  const { data: webhooks, isLoading } = useWebhooks();
  const updateWebhook = useUpdateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();

  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  const [rotateSecretId, setRotateSecretId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [signingInfoOpen, setSigningInfoOpen] = useState(false);

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await updateWebhook.mutateAsync({ id, is_active: !currentActive });
      toast.success(currentActive ? "Webhook disattivato" : "Webhook attivato");
    } catch (error) {
      toast.error("Errore durante l'aggiornamento");
    }
  };

  const handleTest = async (id: string) => {
    try {
      await testWebhook.mutateAsync(id);
      toast.success("Test webhook inviato! Controlla il monitor.");
    } catch (error) {
      toast.error("Errore durante il test");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteWebhook.mutateAsync(deleteId);
      toast.success("Webhook eliminato");
      setDeleteId(null);
    } catch (error) {
      toast.error("Errore durante l'eliminazione");
    }
  };

  const getEventTypeLabels = (types: string[]) => {
    return types.map((t) => {
      const found = WEBHOOK_EVENT_TYPES.find((e) => e.value === t);
      return found?.label || t;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Outbound Webhooks
              </CardTitle>
              <CardDescription>
                Configura endpoint esterni per ricevere notifiche in tempo reale
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSigningInfoOpen(true)}
              >
                <Info className="mr-2 h-4 w-4" />
                Info Firma
              </Button>
              <Button size="sm" onClick={() => setFormOpen(true)} data-testid="create-webhook-btn">
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Webhook
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Nessun webhook configurato</p>
              <p className="text-sm">Crea il primo webhook per iniziare</p>
            </div>
          ) : (
            <Table data-testid="webhooks-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Attivo</TableHead>
                  <TableHead>Eventi</TableHead>
                  <TableHead>Aggiornato</TableHead>
                  <TableHead className="w-[100px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks?.map((webhook) => (
                  <TableRow key={webhook.id} data-testid="webhook-row">
                    <TableCell className="font-medium">{webhook.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {webhook.url}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={webhook.is_active}
                        onCheckedChange={() =>
                          handleToggleActive(webhook.id, webhook.is_active)
                        }
                        disabled={updateWebhook.isPending}
                        data-testid="webhook-active-toggle"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {getEventTypeLabels(webhook.event_types)
                          .slice(0, 2)
                          .map((label) => (
                            <Badge key={label} variant="secondary" className="text-xs">
                              {label}
                            </Badge>
                          ))}
                        {webhook.event_types.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{webhook.event_types.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(webhook.updated_at), "dd MMM HH:mm", {
                        locale: it,
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid="webhook-actions-menu">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background">
                          <DropdownMenuItem
                            onClick={() => handleTest(webhook.id)}
                            disabled={testWebhook.isPending}
                            data-testid="test-webhook-btn"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Test Webhook
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingWebhook(webhook.id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setRotateSecretId(webhook.id)}
                            data-testid="rotate-secret-btn"
                          >
                            <Key className="mr-2 h-4 w-4" />
                            Ruota Secret
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteId(webhook.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Drawer */}
      <WebhookFormDrawer
        open={formOpen || !!editingWebhook}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingWebhook(null);
          }
        }}
        webhookId={editingWebhook}
      />

      {/* Rotate Secret Dialog */}
      <RotateSecretDialog
        webhookId={rotateSecretId}
        onClose={() => setRotateSecretId(null)}
      />

      {/* Delete Confirmation */}
      <DeleteWebhookDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={handleDelete}
        isPending={deleteWebhook.isPending}
      />

      {/* Signing Info Dialog */}
      <SigningInfoDialog
        open={signingInfoOpen}
        onOpenChange={setSigningInfoOpen}
      />
    </>
  );
}
