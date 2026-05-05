import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AppointmentItem {
  id: string
  scheduled_at: string
  duration_minutes: number
  status: string
  appointment_type?: string | null
  address?: string | null
  city?: string | null
  cap?: string | null
  notes?: string | null
  contact: {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    city?: string | null
    cap?: string | null
    notes?: string | null
  }
}

interface Props {
  sellerName?: string
  routeDate?: string // ISO date YYYY-MM-DD
  brandName?: string
  appointments?: AppointmentItem[]
  mapsUrl?: string | null
}

const formatTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
    }).format(new Date(iso))
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

const SalesRouteIndividualEmail = ({
  sellerName, routeDate, brandName, appointments = [], mapsUrl,
}: Props) => {
  const count = appointments.length
  return (
    <Html lang="it" dir="ltr">
      <Head />
      <Preview>{`Il tuo giro di domani: ${count} appuntament${count === 1 ? 'o' : 'i'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Buonasera{sellerName ? `, ${sellerName}` : ''} 👋</Heading>
          <Text style={lead}>
            Ecco il tuo giro per <strong>{formatDateLong(routeDate)}</strong>
            {brandName ? ` — ${brandName}` : ''}.
          </Text>

          <Section style={kpiBox}>
            <Text style={kpiNumber}>{count}</Text>
            <Text style={kpiLabel}>appuntament{count === 1 ? 'o confermato' : 'i confermati'}</Text>
          </Section>

          {mapsUrl && (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={mapsUrl} style={btn}>🗺️ Apri itinerario su Google Maps</Button>
            </Section>
          )}

          <Hr style={hr} />

          {appointments.length === 0 ? (
            <Text style={text}>Nessun appuntamento confermato per domani.</Text>
          ) : (
            appointments.map((a, idx) => {
              const fullName = [a.contact.first_name, a.contact.last_name].filter(Boolean).join(' ') || '—'
              const addr = [
                a.address || a.contact.address,
                [a.cap || a.contact.cap, a.city || a.contact.city].filter(Boolean).join(' '),
              ].filter(Boolean).join(' · ')
              return (
                <Section key={a.id} style={card}>
                  <Text style={cardTime}>
                    {formatTime(a.scheduled_at)} · <span style={{ color: '#64748b', fontWeight: 400 }}>
                      {idx + 1}/{appointments.length}
                    </span>
                  </Text>
                  <Text style={cardName}>{fullName}</Text>
                  {addr && <Text style={cardMeta}>📍 {addr}</Text>}
                  {a.contact.phone && <Text style={cardMeta}>📞 <Link href={`tel:${a.contact.phone}`} style={linkStyle}>{a.contact.phone}</Link></Text>}
                  {a.notes && <Text style={cardNote}>📝 {a.notes}</Text>}
                  {a.contact.notes && a.contact.notes !== a.notes && (
                    <Text style={cardNote}>👤 {a.contact.notes}</Text>
                  )}
                </Section>
              )
            })
          )}

          <Hr style={hr} />
          <Text style={footer}>
            Buon lavoro!<br/>
            Email automatica del CRM — non rispondere.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SalesRouteIndividualEmail,
  subject: (data: Record<string, any>) => {
    const n = Array.isArray(data?.appointments) ? data.appointments.length : 0
    return `🚗 Giro di domani · ${n} appuntament${n === 1 ? 'o' : 'i'}`
  },
  displayName: 'Giro venditori (individuale)',
  previewData: {
    sellerName: 'Mario',
    routeDate: '2026-05-05',
    brandName: 'My-Med',
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Roma',
    appointments: [
      {
        id: '1', scheduled_at: '2026-05-05T08:30:00+02:00', duration_minutes: 60,
        status: 'confirmed', address: 'Via Roma 1', city: 'Milano', cap: '20100',
        notes: 'Cliente preferisce mattino',
        contact: { first_name: 'Anna', last_name: 'Rossi', phone: '+39 333 1234567' },
      },
      {
        id: '2', scheduled_at: '2026-05-05T11:00:00+02:00', duration_minutes: 60,
        status: 'confirmed',
        contact: { first_name: 'Luca', last_name: 'Bianchi', phone: '+39 348 7654321',
          address: 'Corso Italia 25', city: 'Milano', cap: '20122' },
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }
const lead = { fontSize: '15px', color: '#334155', margin: '0 0 20px' }
const kpiBox = { textAlign: 'center' as const, backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '20px', margin: '8px 0 0' }
const kpiNumber = { fontSize: '36px', fontWeight: 800, color: '#0ea5e9', margin: '0', lineHeight: '1' }
const kpiLabel = { fontSize: '13px', color: '#64748b', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const btn = { backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const card = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', margin: '0 0 12px' }
const cardTime = { fontSize: '13px', fontWeight: 700, color: '#0ea5e9', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }
const cardName = { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }
const cardMeta = { fontSize: '13px', color: '#475569', margin: '2px 0' }
const cardNote = { fontSize: '12px', color: '#64748b', margin: '6px 0 0', fontStyle: 'italic' as const }
const linkStyle = { color: '#0ea5e9', textDecoration: 'none' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.5' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '24px 0 0', textAlign: 'center' as const }
