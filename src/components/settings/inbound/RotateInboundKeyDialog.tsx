import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/copyToClipboard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Key, Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RotateInboundKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; name: string; hmac_enabled?: boolean } | null;
}

// Generate a secure random API key (24 alphanumeric chars)
function generateApiKey(): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => charset[b % charset.length]).join("");
}

// Hash API key for storage
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function RotateInboundKeyDialog({
  open,
  onOpenChange,
  source,
}: RotateInboundKeyDialogProps) {
  const queryClient = useQueryClient();
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [newHmacSecret, setNewHmacSecret] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"apikey" | "hmac">("apikey");

  const rotateMutation = useMutation({
    mutationFn: async () => {
      if (!source?.id) throw new Error("No source to rotate");

      const apiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(apiKey);

      const { error } = await supabase
        .from("webhook_sources")
        .update({ api_key_hash: apiKeyHash })
        .eq("id", source.id);

      if (error) throw error;
      return apiKey;
    },
    onSuccess: (apiKey) => {
      setNewApiKey(apiKey);
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("API Key ruotata");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const rotateHmacMutation = useMutation({
    mutationFn: async () => {
      if (!source?.id) throw new Error("No source to rotate");

      const secret = generateApiKey();

      const { error } = await supabase
        .from("webhook_sources")
        .update({ hmac_secret: secret })
        .eq("id", source.id);

      if (error) throw error;
      return secret;
    },
    onSuccess: (secret) => {
      setNewHmacSecret(secret);
      queryClient.invalidateQueries({ queryKey: ["inbound-sources"] });
      toast.success("Webhook Secret generato");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const handleCopyValue = (value: string, label: string) => {
    copyToClipboard(value, label);
  };

  const handleClose = () => {
    setNewApiKey(null);
    setNewHmacSecret(null);
    setActiveTab("apikey");
    onOpenChange(false);
  };

  const webhookUrl = source?.id
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest/${source.id}`
    : "";

  const showResult = newApiKey || newHmacSecret;

  if (showResult) {
    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {newApiKey ? "Nuova API Key Generata" : "Nuovo Webhook Secret Generato"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Salva queste credenziali!</strong> Non saranno più visibili
                    dopo la chiusura di questa finestra.
                  </AlertDescription>
                </Alert>

                {/* Webhook URL */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Webhook URL</label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyValue(webhookUrl, "Webhook URL")}
                     aria-label="Copia">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {newApiKey && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nuova API Key</label>
                    <div className="flex gap-2">
                      <Input value={newApiKey} readOnly className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopyValue(newApiKey, "API Key")}
                       aria-label="Copia">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Usa come parametro URL: <code className="bg-muted px-1 py-0.5 rounded">?api_key=...</code> oppure header <code className="bg-muted px-1 py-0.5 rounded">X-API-Key</code>
                    </p>
                  </div>
                )}

                {newHmacSecret && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Webhook Secret (HMAC)</label>
                    <div className="flex gap-2">
                      <Input value={newHmacSecret} readOnly className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopyValue(newHmacSecret, "Webhook Secret")}
                       aria-label="Copia">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Inserisci questo valore nel campo "Segreto" o "Secret key" della piattaforma esterna (es. systeme.io).
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleClose}>Chiudi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Gestione Credenziali — {source?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Scegli cosa vuoi generare/ruotare per questa sorgente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "apikey" | "hmac")}>
          <TabsList className="w-full">
            <TabsTrigger value="apikey" className="flex-1 gap-2">
              <Key className="h-4 w-4" />
              API Key
            </TabsTrigger>
            {source?.hmac_enabled && (
              <TabsTrigger value="hmac" className="flex-1 gap-2">
                <Shield className="h-4 w-4" />
                Webhook Secret
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="apikey" className="mt-4">
            <p className="text-sm text-muted-foreground">
              La vecchia API Key smetterà immediatamente di funzionare. Aggiorna le integrazioni esterne con la nuova chiave.
            </p>
          </TabsContent>

          {source?.hmac_enabled && (
            <TabsContent value="hmac" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Genera un nuovo Webhook Secret da inserire nel campo "Segreto" della piattaforma esterna (es. systeme.io). Il vecchio secret verrà invalidato.
              </p>
            </TabsContent>
          )}
        </Tabs>

        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          {activeTab === "apikey" ? (
            <AlertDialogAction
              onClick={() => rotateMutation.mutate()}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending ? "Generazione..." : "Genera nuova API Key"}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={() => rotateHmacMutation.mutate()}
              disabled={rotateHmacMutation.isPending}
            >
              {rotateHmacMutation.isPending ? "Generazione..." : "Genera Webhook Secret"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
