import { Badge } from '@/components/ui/badge';
import type { ContactStatus } from '@/types/database';

const statusConfig: Record<ContactStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new: { label: 'Nuovo', variant: 'default' },
  active: { label: 'Attivo', variant: 'secondary' },
  qualified: { label: 'Qualificato', variant: 'default' },
  unqualified: { label: 'Non qualificato', variant: 'destructive' },
  archived: { label: 'Archiviato', variant: 'outline' },
};

interface ContactStatusBadgeProps {
  status: ContactStatus;
}

export function ContactStatusBadge({ status }: ContactStatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
