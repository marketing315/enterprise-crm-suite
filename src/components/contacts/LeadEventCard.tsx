import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { FileJson, Brain, User, Megaphone, ListChecks, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { sanitizeUrl } from '@/lib/safe-url';
import { LeadEventCampaignSelector } from './LeadEventCampaignSelector';

// --- Payload prettifier ----------------------------------------------------
type Row = { label: string; value: string };
type Group = { title: string; icon: React.ReactNode; rows: Row[] };

const FIELD_LABELS: Record<string, string> = {
  first_name: 'Nome', nome: 'Nome',
  last_name: 'Cognome', cognome: 'Cognome',
  email: 'Email', 'e-mail': 'Email',
  phone: 'Telefono', telefono: 'Telefono',
  cap: 'CAP', codice_postale: 'CAP', zip: 'CAP',
  city: 'Città', citta: 'Città',
  province: 'Provincia', provincia: 'Provincia',
  region: 'Regione', regione: 'Regione',
  meta_ad_name: 'Annuncio (Ad)',
  meta_adset_name: 'Gruppo inserzioni',
  meta_campaign_name: 'Campagna Meta',
  meta_form_name: 'Form Meta',
  meta_ad_id: 'Ad ID', meta_adset_id: 'Adset ID', meta_campaign_id: 'Campaign ID',
  meta_form_id: 'Form ID', meta_page_id: 'Page ID',
  utm_source: 'UTM Source', utm_medium: 'UTM Medium', utm_campaign: 'UTM Campaign',
  utm_content: 'UTM Content', utm_term: 'UTM Term',
  source_url: 'URL sorgente', landing_url: 'Landing URL',
  note: 'Note', notes: 'Note', message: 'Messaggio',
};

const HIDDEN_KEYS = new Set([
  'fetched_payload', 'field_data', 'answers', 'raw', 'raw_body',
  'id', 'created_at', 'updated_at', 'platform', 'type',
]);

function fmtValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(fmtValue).filter(Boolean).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function labelize(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\?$/, '').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildGroups(payload: any): Group[] {
  if (!payload || typeof payload !== 'object') return [];

  // Merge meta fetched_payload (richer info from Graph API) over root
  const merged: Record<string, any> = { ...(payload.fetched_payload || {}), ...payload };

  const contact: Row[] = [];
  const campaign: Row[] = [];
  const answers: Row[] = [];
  const technical: Row[] = [];

  const contactKeys = ['first_name', 'nome', 'last_name', 'cognome', 'email', 'e-mail', 'phone', 'telefono', 'cap', 'codice_postale', 'zip', 'city', 'citta', 'province', 'provincia', 'region', 'regione'];
  const campaignKeys = ['meta_campaign_name', 'campaign_name', 'meta_adset_name', 'adset_name', 'meta_ad_name', 'ad_name', 'meta_form_name', 'form_name', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source_url', 'landing_url', 'campaign'];
  const technicalKeys = ['meta_ad_id', 'ad_id', 'meta_adset_id', 'adset_id', 'meta_campaign_id', 'campaign_id', 'meta_form_id', 'form_id', 'meta_page_id', 'page_id'];

  const seen = new Set<string>();
  const push = (bucket: Row[], key: string, val: unknown) => {
    const s = fmtValue(val);
    if (!s || seen.has(key)) return;
    seen.add(key);
    bucket.push({ label: labelize(key), value: s });
  };

  contactKeys.forEach((k) => merged[k] != null && push(contact, k, merged[k]));
  campaignKeys.forEach((k) => merged[k] != null && push(campaign, k, merged[k]));
  technicalKeys.forEach((k) => merged[k] != null && push(technical, k, merged[k]));

  // Meta field_data → answers
  const fd = merged.field_data;
  if (Array.isArray(fd)) {
    fd.forEach((f: any) => {
      const name = String(f?.name ?? '').toLowerCase();
      if (!name || contactKeys.includes(name)) return;
      const val = fmtValue(f?.values);
      if (!val) return;
      answers.push({ label: labelize(name), value: val });
    });
  }

  // Quiz answers object
  if (merged.answers && typeof merged.answers === 'object' && !Array.isArray(merged.answers)) {
    Object.entries(merged.answers).forEach(([q, a]) => {
      const val = fmtValue(a);
      if (val) answers.push({ label: q, value: val });
    });
  }

  // Catch-all extra fields
  Object.entries(merged).forEach(([k, v]) => {
    if (HIDDEN_KEYS.has(k) || seen.has(k)) return;
    if (contactKeys.includes(k) || campaignKeys.includes(k) || technicalKeys.includes(k)) return;
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'object' && !Array.isArray(v)) return;
    const val = fmtValue(v);
    if (!val) return;
    technical.push({ label: labelize(k), value: val });
    seen.add(k);
  });

  const groups: Group[] = [];
  if (contact.length) groups.push({ title: 'Contatto', icon: <User className="h-3.5 w-3.5" />, rows: contact });
  if (campaign.length) groups.push({ title: 'Campagna & Tracking', icon: <Megaphone className="h-3.5 w-3.5" />, rows: campaign });
  if (answers.length) groups.push({ title: 'Risposte form', icon: <ListChecks className="h-3.5 w-3.5" />, rows: answers });
  if (technical.length) groups.push({ title: 'Dettagli tecnici', icon: <Settings2 className="h-3.5 w-3.5" />, rows: technical });
  return groups;
}

interface LeadEvent {
  id: string;
  source: string;
  received_at: string;
  occurred_at?: string | null;
  source_name?: string | null;
  raw_payload?: any;
  ai_priority?: number | null;
  lead_type?: string | null;
  ai_confidence?: number | null;
  ai_rationale?: string | null;
  ai_conversation_summary?: string | null;
  marketing_campaign_id?: string | null;
  marketing_campaigns?: { id: string; name: string } | null;
}

interface LeadEventCardProps {
  event: LeadEvent;
}

export function LeadEventCard({ event }: LeadEventCardProps) {
  const ev = event as any;

  // Use occurred_at (original event time) if valid, otherwise fall back to received_at
  const displayDate = event.occurred_at && new Date(event.occurred_at).getFullYear() > 2000
    ? event.occurred_at
    : event.received_at;

  return (
    <div className="rounded-lg border p-3 space-y-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{event.source}</Badge>
          {ev.lead_type && (
            <Badge variant="secondary" className="text-xs">{ev.lead_type}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(displayDate), 'dd/MM/yyyy HH:mm', { locale: it })}
        </span>
      </div>

      {event.source_name && (
        <p className="text-sm break-words">
          <span className="text-muted-foreground">Sorgente:</span> {event.source_name}
        </p>
      )}

      <LeadEventCampaignSelector
        eventId={event.id}
        currentCampaignId={event.marketing_campaign_id ?? null}
        currentCampaignName={event.marketing_campaigns?.name ?? null}
      />

      {event.raw_payload && typeof event.raw_payload === 'object' && (event.raw_payload as any).source_url && (() => {
        const safe = sanitizeUrl((event.raw_payload as any).source_url);
        if (!safe) return null;
        return (
          <p className="text-sm truncate">
            <span className="text-muted-foreground">URL:</span>{' '}
            <a
              href={safe}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary hover:underline"
            >
              {safe}
            </a>
          </p>
        );
      })()}

      {/* AI Data */}
      {(ev.ai_priority != null || ev.ai_confidence != null) && (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {ev.ai_priority != null && (
            <span>
              <span className="text-muted-foreground">Priorità AI:</span> {ev.ai_priority}
            </span>
          )}
          {ev.ai_confidence != null && (
            <span>
              <span className="text-muted-foreground">Confidenza:</span>{' '}
              {Math.round(ev.ai_confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {ev.ai_conversation_summary && (
        <div className="text-sm">
          <span className="text-muted-foreground">Riepilogo AI:</span>{' '}
          <span className="whitespace-pre-wrap break-words">{ev.ai_conversation_summary}</span>
        </div>
      )}

      {ev.ai_rationale && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Brain className="h-3 w-3" />
            Motivazione AI
          </summary>
          <p className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words">
            {ev.ai_rationale}
          </p>
        </details>
      )}

      {(() => {
        const groups = buildGroups(event.raw_payload);
        if (!groups.length) return null;
        return (
          <div className="rounded-md border bg-card/40 divide-y">
            {groups.map((g) => (
              <div key={g.title} className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {g.icon}
                  {g.title}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-1 text-sm">
                  {g.rows.map((r, i) => (
                    <div key={i} className="contents">
                      <dt className="text-muted-foreground">{r.label}</dt>
                      <dd className="break-words font-medium">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        );
      })()}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
          <FileJson className="h-3 w-3" />
          Payload grezzo
        </summary>
        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(event.raw_payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
