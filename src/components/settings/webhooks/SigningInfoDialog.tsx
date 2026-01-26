import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

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
              <div>
                <Badge variant="outline" className="mr-2">X-Webhook-Timestamp</Badge>
                Unix timestamp (secondi)
              </div>
              <div>
                <Badge variant="outline" className="mr-2">X-Webhook-Signature</Badge>
                sha256=... (firma HMAC)
              </div>
            </div>
          </div>

          {/* Signing Algorithm */}
          <div>
            <h4 className="font-semibold mb-2">Algoritmo di firma:</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs">
              <p className="text-muted-foreground mb-2">// Stringa da firmare:</p>
              <p>string_to_sign = {"`${timestamp}.${raw_body}`"}</p>
              <p className="text-muted-foreground mt-4 mb-2">// Calcolo firma:</p>
              <p>signature = HMAC_SHA256(secret, string_to_sign)</p>
              <p className="text-muted-foreground mt-4 mb-2">// Header finale:</p>
              <p>X-Webhook-Signature: sha256={"{hex_signature}"}</p>
            </div>
          </div>

          {/* Verification Example */}
          <div>
            <h4 className="font-semibold mb-2">Esempio verifica (Node.js):</h4>
            <div className="bg-muted rounded-md p-4 font-mono text-xs overflow-x-auto">
              <pre>{`const crypto = require('crypto');

function verifyWebhook(payload, signature, timestamp, secret) {
  const stringToSign = \`\${timestamp}.\${payload}\`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');
  
  const [, receivedSignature] = signature.split('=');
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
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
              <li>Rispondi con 200-299 per confermare la ricezione</li>
              <li>I retry avvengono con backoff esponenziale fino a 10 tentativi</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
