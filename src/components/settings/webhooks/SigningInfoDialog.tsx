import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SigningInfoDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Verifica della Firma Webhook</DialogTitle>
          <DialogDescription>
            Tutti i webhook sono firmati con HMAC-SHA256 per garantire l'autenticità
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* Headers */}
          <div>
            <h4 className="font-semibold mb-2">Header inclusi in ogni richiesta:</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs space-y-1">
              <div>
                <Badge variant="outline" className="mr-2">X-Webhook-Event</Badge>
                tipo di evento (es. ticket.created)
              </div>
              <div>
                <Badge variant="outline" className="mr-2">X-Webhook-Id</Badge>
                ID del webhook
              </div>
              <div>
                <Badge variant="outline" className="mr-2">X-Webhook-Delivery-Id</Badge>
                ID univoco della delivery
              </div>
            </div>
          </div>

          {/* Signing Headers */}
          <div>
            <h4 className="font-semibold mb-2">Header per la firma HMAC:</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs space-y-2">
              <div>
                <Badge variant="outline" className="mr-2">X-Signature</Badge>
                <span className="text-foreground">sha256=... (firma HMAC)</span>
              </div>
              <div>
                <Badge variant="outline" className="mr-2">X-Timestamp</Badge>
                <span className="text-foreground">Unix timestamp (secondi)</span>
              </div>
            </div>

            <Alert className="mt-3">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Compatibilità:</strong> il backend accetta anche{" "}
                <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> come alias di{" "}
                <code className="bg-muted px-1 rounded">X-Signature</code> per piattaforme come systeme.io.
                Per nuove integrazioni, usa <code className="bg-muted px-1 rounded">X-Signature</code> e{" "}
                <code className="bg-muted px-1 rounded">X-Timestamp</code>.
              </AlertDescription>
            </Alert>
          </div>

          {/* Signing Algorithm */}
          <div>
            <h4 className="font-semibold mb-2">Algoritmo di firma:</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs">
              <p className="text-muted-foreground mb-2">// Stringa da firmare:</p>
              <p>string_to_sign = {"`${timestamp}.${raw_body}`"}</p>
              <p className="text-muted-foreground mt-4 mb-2">// Calcolo firma:</p>
              <p>signature = HMAC_SHA256(secret, string_to_sign)</p>
              <p className="text-muted-foreground mt-4 mb-2">// Header richiesti:</p>
              <p>X-Signature: sha256={"{hex_signature}"}</p>
              <p>X-Timestamp: {"{unix_seconds}"}</p>
            </div>
          </div>

          {/* Verification Example */}
          <div>
            <h4 className="font-semibold mb-2">Esempio verifica (Node.js):</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs overflow-x-auto">
              <pre>{`const crypto = require('crypto');

function verifyWebhook(payload, headers, secret) {
  const signature = headers['x-signature'];    // sha256=<hex>
  const timestamp  = headers['x-timestamp'];   // unix seconds

  // 1. Anti-replay: reject if timestamp > 5 min old
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error('Replay detected');

  // 2. Compute expected signature
  const stringToSign = \`\${timestamp}.\${payload}\`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');

  // 3. Validate format (must be exactly 64 hex chars)
  const match = signature.match(/^sha256=([a-f0-9]{64})$/);
  if (!match) throw new Error('Invalid signature format');

  // 4. Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(match[1])
  );
}`}</pre>
            </div>
          </div>

          {/* Security Tips */}
          <div>
            <h4 className="font-semibold mb-2">Best Practices:</h4>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li>Verifica sempre la firma prima di processare il payload</li>
              <li>Controlla che il timestamp non sia troppo vecchio (es. max 5 minuti)</li>
              <li>Usa timing-safe comparison per evitare timing attacks</li>
              <li>La firma SHA-256 deve essere esattamente 64 caratteri hex</li>
              <li>Rispondi con 200-299 per confermare la ricezione</li>
              <li>I retry avvengono con backoff esponenziale fino a 10 tentativi</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
