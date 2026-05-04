import { Link, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  overview: 'Overview',
  admin: 'Admin',
  ceo: 'CEO',
  callcenter: 'Call center',
  venditore: 'Venditore',
  'responsabile-callcenter': 'Resp. Call center',
  'responsabile-venditori': 'Resp. Vendite',
  contacts: 'Contatti',
  pipeline: 'Pipeline',
  sales: 'Vendite',
  products: 'Prodotti',
  events: 'Eventi',
  appointments: 'Appuntamenti',
  calendar: 'Calendario',
  'ops-board': 'Ops Board',
  availability: 'Disponibilità',
  tickets: 'Ticket',
  chat: 'Chat',
  notifications: 'Notifiche',
  azienda: 'Azienda',
  costi: 'Costi',
  budget: 'Budget',
  report: 'Report',
  marketing: 'Marketing',
  campagne: 'Campagne',
  leads: 'Lead',
  settings: 'Impostazioni',
  team: 'Team',
  'ai-metrics': 'AI Metrics',
  'ai-decisions': 'AI Decisions',
  'ticket-escalations': 'Escalation Ticket',
  'notification-webhooks': 'Webhook Notifiche',
  'quick-backup': 'Quick Backup',
  observability: 'Observability',
  mcp: 'MCP',
  audit: 'Audit',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelFor(seg: string): string {
  if (LABELS[seg]) return LABELS[seg];
  if (UUID_RE.test(seg)) return 'Dettaglio';
  if (/^\d+$/.test(seg)) return `#${seg}`;
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppBreadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  return (
    <div className="border-b bg-muted/30 px-3 md:px-6 py-2">
      <Breadcrumb>
        <BreadcrumbList>
          {segments.map((seg, idx) => {
            const isLast = idx === segments.length - 1;
            const href = '/' + segments.slice(0, idx + 1).join('/');
            const label = labelFor(seg);
            return (
              <BreadcrumbItem key={href}>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <>
                    <BreadcrumbLink asChild>
                      <Link to={href}>{label}</Link>
                    </BreadcrumbLink>
                    <BreadcrumbSeparator />
                  </>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
