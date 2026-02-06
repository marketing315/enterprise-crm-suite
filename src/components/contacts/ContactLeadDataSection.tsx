import { FileText, PhoneForwarded } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ContactLeadDataSectionProps {
  contact: Record<string, any>;
}

export function ContactLeadDataSection({ contact }: ContactLeadDataSectionProps) {
  const leadType = contact.lead_type;
  const leadCost = contact.lead_cost;
  const leadValid = contact.lead_valid;
  const leadNote = contact.lead_note;
  const leadReason = contact.lead_reason;
  const callbackRequested = contact.callback_requested;
  const esitoChiamata = contact.esito_chiamata;

  const hasAnyData = leadType || leadCost != null || leadValid != null || leadNote || leadReason || callbackRequested || esitoChiamata;

  if (!hasAnyData) return null;

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Dati Lead
        </h3>
        <div className="rounded-lg border p-3 space-y-2 text-sm">
          {leadType && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tipo:</span>
              <Badge variant="outline">{leadType}</Badge>
            </div>
          )}
          {leadCost != null && (
            <div>
              <span className="text-muted-foreground">Costo Lead:</span>{' '}
              €{Number(leadCost).toFixed(2)}
            </div>
          )}
          {leadValid != null && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Validità:</span>
              <Badge variant={leadValid ? 'default' : 'destructive'} className="text-xs">
                {leadValid ? 'Valido' : 'Non valido'}
              </Badge>
            </div>
          )}
          {leadReason && (
            <div>
              <span className="text-muted-foreground">Motivo:</span> {leadReason}
            </div>
          )}
          {leadNote && (
            <div>
              <span className="text-muted-foreground">Note Lead:</span>{' '}
              <span className="whitespace-pre-wrap">{leadNote}</span>
            </div>
          )}
          {esitoChiamata && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Esito Chiamata:</span>
              <Badge variant="secondary">{esitoChiamata}</Badge>
            </div>
          )}
          {callbackRequested && (
            <div className="flex items-center gap-2">
              <PhoneForwarded className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary font-medium">Callback richiesta</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
