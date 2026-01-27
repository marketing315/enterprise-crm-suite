import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Copy, Key } from "lucide-react";

interface RotateInboundKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; name: string } | null;
}

// Generate a secure random API key
function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
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

  const handleCopyApiKey = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      toast.success("API Key copiata");
    }
  };

  const handleClose = () => {
    setNewApiKey(null);
    onOpenChange(false);
  };

  if (newApiKey) {
    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nuova API Key Generata</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Salva questa API Key!</strong> Non sarà più visibile
                    dopo la chiusura di questa finestra.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nuova API Key</label>
                  <div className="flex gap-2">
                    <Input
                      value={newApiKey}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyApiKey}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ruota API Key</AlertDialogTitle>
          <AlertDialogDescription>
            Stai per generare una nuova API Key per "{source?.name}".
            <br />
            <br />
            La vecchia chiave smetterà immediatamente di funzionare. Assicurati di
            aggiornare le integrazioni esterne con la nuova chiave.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => rotateMutation.mutate()}
            disabled={rotateMutation.isPending}
          >
            {rotateMutation.isPending ? "Generazione..." : "Genera nuova chiave"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
