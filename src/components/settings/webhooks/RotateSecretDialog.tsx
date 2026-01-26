import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRotateWebhookSecret, generateWebhookSecret } from "@/hooks/useWebhooks";

interface Props {
  webhookId: string | null;
  onClose: () => void;
}

export function RotateSecretDialog({ webhookId, onClose }: Props) {
  const rotateSecret = useRotateWebhookSecret();
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (webhookId) {
      setNewSecret(generateWebhookSecret());
      setRotatedSecret(null);
      setCopied(false);
    }
  }, [webhookId]);

  const handleRotate = async () => {
    if (!webhookId || !newSecret) return;

    try {
      const result = await rotateSecret.mutateAsync({
        id: webhookId,
        newSecret,
      });
      setRotatedSecret(result);
      toast.success("Secret ruotato con successo");
    } catch (error) {
      toast.error("Errore durante la rotazione del secret");
    }
  };

  const handleCopy = async () => {
    const secretToCopy = rotatedSecret || newSecret;
    if (secretToCopy) {
      await navigator.clipboard.writeText(secretToCopy);
      setCopied(true);
      toast.success("Secret copiato negli appunti");
    }
  };

  const handleRegenerate = () => {
    setNewSecret(generateWebhookSecret());
    setCopied(false);
  };

  const handleClose = () => {
    setNewSecret(null);
    setRotatedSecret(null);
    setCopied(false);
    onClose();
  };

  return (
    <AlertDialog open={!!webhookId} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ruota Signing Secret</AlertDialogTitle>
          <AlertDialogDescription>
            {rotatedSecret
              ? "Il secret è stato ruotato. Copialo ora, non sarà più visibile."
              : "Genera un nuovo secret per questo webhook. Il vecchio secret verrà invalidato immediatamente."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input
              value={rotatedSecret || newSecret || ""}
              readOnly
              className="font-mono text-xs"
              data-testid="new-secret-input"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              data-testid="copy-new-secret-btn"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            {!rotatedSecret && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRegenerate}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Alert variant={rotatedSecret ? "default" : "destructive"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {rotatedSecret
                ? "Copia questo secret ora. Non sarà più visibile dopo aver chiuso questo dialog."
                : "Attenzione: la rotazione invalida immediatamente il secret corrente. Aggiorna il tuo endpoint prima di ruotare."}
            </AlertDescription>
          </Alert>
        </div>

        <AlertDialogFooter>
          {rotatedSecret ? (
            <AlertDialogAction onClick={handleClose} data-testid="close-rotate-dialog">
              Chiudi
            </AlertDialogAction>
          ) : (
            <>
              <AlertDialogCancel onClick={handleClose}>Annulla</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleRotate}
                disabled={rotateSecret.isPending}
                data-testid="confirm-rotate-btn"
              >
                Ruota Secret
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
