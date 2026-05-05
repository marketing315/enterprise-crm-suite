import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface SellerGroup {
  user: { id: string; full_name?: string | null; email?: string | null }
  count: number
  appointments: Array<{
    id: string
    scheduled_at: string
    contact_name?: string | null
    address?: string | null
    city?: string | null
  }>
}

interface Props {
  brandName?: string
  routeDate?: string
  groups?: SellerGroup[]
  totalAppointments?: number
}

const formatTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(iso))
  } catch { return iso }
}

const formatDateLong = (d?: string) => {
  if (!d) return ''
  try {
    return new Intl.DateTimeFormat('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome',
    }).format(new Date(d + 'T12:00:00Z'))
  } catch { return d }
}

const SalesRouteAggregateEmail = ({
  brandName, routeDate, groups = [], totalAppointments,
}: Props) => {
  const total = totalAppointments ?? groups.reduce((s, g) => s + g.count, 0)
  return (
    <Html lang="it" dir="ltr">
      <Head />
      <Preview>{`Agenda venditori di domani · ${groups.length} venditori · ${total} appuntamenti`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Agenda venditori — {brandName || 'CRM'}</Heading>
          <Text style={lead}>
            Riepilogo per <strong>{formatDateLong(routeDate)}</strong>.
          </Text>

          <Section style={kpiRow}>
            <div style={kpiCell}>
              <Text style={kpiNumber}>{groups.length}</Text>
              <Text style={kpiLabel}>venditori attivi</Text>
            </div>
            <div style={kpiCell}>
              <Text style={kpiNumber}>{total}</Text>
              <Text style={kpiLabel}>appuntamenti totali</Text>
            </div>
          </Section>

          <Hr style={hr} />

          {groups.length === 0 ? (
            <Text style={text}>Nessun venditore con appuntamenti per domani.</Text>
          ) : (
            groups.map((g) => (
              <Section key={g.user.id} style={card}>
                <Text style={cardSeller}>
                  👤 {g.user.full_name || g.user.email || '—'} · <span style={{ color: '#0ea5e9' }}>{g.count}</span>
                </Text>
                {g.appointments.slice(0, 12).map((a) => (
                  <Text key={a.id} style={cardLine}>
                    <strong>{formatTime(a.scheduled_at)}</strong> · {a.contact_name || '—'}
                    {a.city ? ` · ${a.city}` : ''}
                  </Text>
                ))}
                {g.appointments.length > 12 && (
                  <Text style={cardLine}>… e altri {g.appointments.length - 12}</Text>
                )}
              </Section>
            ))
          )}

          <Hr style={hr} />
          <Text style={footer}>Email automatica del CRM — non rispondere.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SalesRouteAggregateEmail,
  subject: (data: Record<string, any>) => {
    const total = data?.totalAppointments ??
      (Array.isArray(data?.groups) ? data.groups.reduce((s: number, g: any) => s + (g.count || 0), 0) : 0)
    return `📋 Agenda venditori di domani · ${total} appuntamenti`
  },
  displayName: 'Giro venditori (aggregato)',
  previewData: {
    brandName: 'My-Med',
    routeDate: '2026-05-05',
    totalAppointments: 5,
    groups: [
      {
        user: { id: 'u1', full_name: 'Mario Rossi', email: 'mario@example.com' },
        count: 3,
        appointments: [
          { id: 'a1', scheduled_at: '2026-05-05T08:30:00+02:00', contact_name: 'Anna Verdi', city: 'Milano' },
          { id: 'a2', scheduled_at: '2026-05-05T11:00:00+02:00', contact_name: 'Luca Bianchi', city: 'Milano' },
          { id: 'a3', scheduled_at: '2026-05-05T15:00:00+02:00', contact_name: 'Sara Neri', city: 'Monza' },
        ],
      },
      {
        user: { id: 'u2', full_name: 'Giulia Conti', email: 'giulia@example.com' },
        count: 2,
        appointments: [
          { id: 'a4', scheduled_at: '2026-05-05T09:00:00+02:00', contact_name: 'Paolo Russo', city: 'Roma' },
          { id: 'a5', scheduled_at: '2026-05-05T14:00:00+02:00', contact_name: 'Marta Galli', city: 'Roma' },
        ],
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }
const lead = { fontSize: '15px', color: '#334155', margin: '0 0 20px' }
const kpiRow = { display: 'table' as const, width: '100%', margin: '8px 0' }
const kpiCell = { display: 'table-cell' as const, width: '50%', textAlign: 'center' as const, backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '16px', verticalAlign: 'middle' as const }
const kpiNumber = { fontSize: '28px', fontWeight: 800, color: '#0ea5e9', margin: '0', lineHeight: '1' }
const kpiLabel = { fontSize: '12px', color: '#64748b', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const card = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', margin: '0 0 12px' }
const cardSeller = { fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }
const cardLine = { fontSize: '13px', color: '#475569', margin: '2px 0' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.5' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '24px 0 0', textAlign: 'center' as const }
