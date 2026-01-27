import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Edit2, Key, Webhook } from "lucide-react";
import { InboundSourceFormDrawer } from "./InboundSourceFormDrawer";
import { DeleteInboundSourceDialog } from "./DeleteInboundSourceDialog";
import { RotateInboundKeyDialog } from "./RotateInboundKeyDialog";

interface WebhookSource {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  rate_limit_per_min: number;
  created_at: string;
  updated_at: string;
}

export function InboundSourceList() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<WebhookSource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSource, setDeletingSource] = useState<WebhookSource | null>(null);
  const [rotateKeyDialogOpen, setRotateKeyDialogOpen] = useState(false);
  const [rotatingSource, setRotatingSource] = useState<WebhookSource | null>(null);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["inbound-sources", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("webhook_sources")
        .select("id, name, description, is_active, rate_limit_per_min, created_at, updated_at")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WebhookSource[];
    },
    enabled: !!currentBrand?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("webhook_sources")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("Stato aggiornato");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const handleCopyEndpoint = (sourceId: string) => {
    const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest/${sourceId}`;
    navigator.clipboard.writeText(endpoint);
    toast.success("Endpoint copiato negli appunti");
  };

  const handleEdit = (source: WebhookSource) => {
    setEditingSource(source);
    setFormOpen(true);
  };

  const handleDelete = (source: WebhookSource) => {
    setDeletingSource(source);
    setDeleteDialogOpen(true);
  };

  const handleRotateKey = (source: WebhookSource) => {
    setRotatingSource(source);
    setRotateKeyDialogOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingSource(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Sorgenti Inbound</h3>
          <p className="text-sm text-muted-foreground">
            Configura le sorgenti webhook per ricevere lead (Meta, Generic, ecc.)
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} data-testid="add-inbound-source-btn">
          <Plus className="h-4 w-4 mr-2" />
          Nuova Sorgente
        </Button>
      </div>

      {sources?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Nessuna sorgente inbound configurata.
              <br />
              Crea la prima per iniziare a ricevere lead.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources?.map((source) => (
            <Card key={source.id} data-testid={`inbound-source-${source.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{source.name}</CardTitle>
                    <Badge variant={source.is_active ? "default" : "secondary"}>
                      {source.is_active ? "Attivo" : "Inattivo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={source.is_active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: source.id, is_active: checked })
                      }
                      aria-label="Toggle active"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyEndpoint(source.id)}
                      title="Copia endpoint"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRotateKey(source)}
                      title="Ruota API Key"
                    >
                      <Key className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(source)}
                      title="Modifica"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(source)}
                      title="Elimina"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {source.description && (
                  <CardDescription>{source.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Rate limit: {source.rate_limit_per_min}/min</span>
                  <span>ID: {source.id.slice(0, 8)}...</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InboundSourceFormDrawer
        open={formOpen}
        onOpenChange={handleFormClose}
        editingSource={editingSource}
      />

      <DeleteInboundSourceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        source={deletingSource}
      />

      <RotateInboundKeyDialog
        open={rotateKeyDialogOpen}
        onOpenChange={setRotateKeyDialogOpen}
        source={rotatingSource}
      />
    </div>
  );
}
