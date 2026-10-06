/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Column, Container, Head, Heading, Hr, Html, Link, Preview, Row, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Field { label: string; value: string }
interface Props {
  fullName?: string
  phone?: string
  email?: string
  city?: string
  formName?: string
  campaignName?: string
  brandName?: string
  receivedAt?: string
  fields?: Field[]
  crmUrl?: string
}

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`

const Meta = ({ label, value }: { label: string; value?: string }) => (
  <Column style={metaCol}>
    <Text style={metaLbl}>{label}</Text>
    <Text style={metaVal}>{value || '—'}</Text>
  </Column>
)

const MetaLeadEmail = ({
  fullName, phone, email, city, formName, campaignName, brandName, receivedAt, fields = [], crmUrl,
}: Props) => {
  const name = fullName || 'Lead senza nome'
  const initials = (fullName || '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Html lang="it" dir="ltr">
      <Head />
      <Preview>{`Nuovo lead${formName ? ` · ${formName}` : ''} — ${fullName || phone || email || ''}`}</Preview>
      <Body style={main}>
        <Container style={outer}>
          <Section style={topbar}>
            <Row>
              <Column><Text style={brandMark}>CRM GRUPPO BENESSERE</Text></Column>
              <Column align="right"><Text style={pill}>Nuovo lead</Text></Column>
            </Row>
          </Section>

          <Section style={card}>
            <Row>
              <Column style={{ width: '64px', verticalAlign: 'top' }}>
                <Text style={avatar}>{initials}</Text>
              </Column>
              <Column style={{ verticalAlign: 'middle' }}>
                <Text style={eyebrow}>{brandName || 'Meta Lead Ads'}</Text>
                <Heading style={h1}>{name}</Heading>
                {city && <Text style={sub}>{city}</Text>}
              </Column>
            </Row>

            <Section style={{ marginTop: '24px' }}>
              {phone && (
                <Button href={telHref(phone)} style={btnPrimary}>Chiama {phone}</Button>
              )}
              {email && (
                <Text style={emailLine}>
                  <Link href={`mailto:${email}`} style={link}>{email}</Link>
                </Text>
              )}
            </Section>

            <Hr style={divider} />

            <Row>
              <Meta label="Modulo" value={formName} />
              <Meta label="Campagna" value={campaignName} />
            </Row>
            <Row>
              <Meta label="Ricevuto" value={receivedAt} />
              <Meta label="Telefono" value={phone} />
            </Row>

            {fields.length > 0 && (
              <>
                <Hr style={divider} />
                <Text style={sectionTitle}>Risposte al modulo</Text>
                {fields.map((f, i) => (
                  <Section key={i} style={answer}>
                    <Text style={qLbl}>{f.label}</Text>
                    <Text style={qVal}>{f.value || '—'}</Text>
                  </Section>
                ))}
              </>
            )}

            {crmUrl && (
              <Section style={{ marginTop: '28px' }}>
                <Button href={crmUrl} style={btnGhost}>Apri nel CRM →</Button>
              </Section>
            )}
          </Section>

          <Text style={footer}>
            Notifica automatica di CRM Gruppo Benessere · inviata per ogni nuovo lead di questo modulo.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MetaLeadEmail,
  subject: (d: Record<string, any>) =>
    `Nuovo lead${d.formName ? ` · ${d.formName}` : ''}${d.fullName ? ` — ${d.fullName}` : ''}`,
  displayName: 'Notifica lead Meta',
  previewData: {
    fullName: 'Mario Rossi', phone: '+39 333 1234567', email: 'mario@example.com', city: 'Milano',
    formName: 'Centri MyMed', campaignName: 'Campagna ottobre', brandName: 'Centri MyMed',
    receivedAt: '06/10/2026 16:00',
    fields: [
      { label: 'Che tipo di attività gestisci?', value: 'Poliambulatorio' },
      { label: 'Quando preferisci essere ricontattato?', value: 'Mattina' },
    ],
    crmUrl: 'https://crm.gruppobenessere.it/events',
  },
} satisfies TemplateEntry

const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif'
const main = { backgroundColor: '#ffffff', fontFamily: font, margin: 0, padding: '32px 0' }
const outer = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const topbar = { padding: '0 4px 16px' }
const brandMark = { fontSize: '11px', letterSpacing: '2px', fontWeight: 700, color: '#0F172A', margin: 0 }
const pill = { display: 'inline-block', fontSize: '11px', fontWeight: 600, color: '#3B82F6', backgroundColor: '#EFF6FF', borderRadius: '999px', padding: '4px 10px', margin: 0 }
const card = { border: '1px solid #E2E8F0', borderRadius: '16px', padding: '32px', backgroundColor: '#ffffff' }
const avatar = { width: '48px', height: '48px', lineHeight: '48px', borderRadius: '24px', backgroundColor: '#0F172A', color: '#ffffff', textAlign: 'center' as const, fontSize: '16px', fontWeight: 600, margin: 0 }
const eyebrow = { fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#64748B', fontWeight: 600, margin: '0 0 4px' }
const h1 = { fontSize: '26px', lineHeight: '32px', fontWeight: 700, letterSpacing: '-0.5px', color: '#0F172A', margin: 0 }
const sub = { fontSize: '14px', color: '#64748B', margin: '4px 0 0' }
const btnPrimary = { backgroundColor: '#0F172A', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '14px 22px', borderRadius: '10px', textDecoration: 'none', display: 'inline-block' }
const btnGhost = { backgroundColor: '#ffffff', color: '#0F172A', fontSize: '14px', fontWeight: 600, padding: '12px 20px', borderRadius: '10px', border: '1px solid #CBD5E1', textDecoration: 'none' }
const emailLine = { fontSize: '14px', margin: '14px 0 0' }
const link = { color: '#3B82F6', textDecoration: 'none' }
const divider = { borderColor: '#F1F5F9', margin: '28px 0 20px' }
const metaCol = { width: '50%', verticalAlign: 'top', paddingBottom: '14px' }
const metaLbl = { fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#94A3B8', fontWeight: 600, margin: 0 }
const metaVal = { fontSize: '15px', color: '#0F172A', margin: '4px 0 0' }
const sectionTitle = { fontSize: '13px', fontWeight: 700, color: '#0F172A', margin: '0 0 12px' }
const answer = { backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '12px 16px', marginBottom: '8px' }
const qLbl = { fontSize: '12px', color: '#64748B', margin: 0 }
const qVal = { fontSize: '15px', color: '#0F172A', fontWeight: 500, margin: '4px 0 0' }
const footer = { fontSize: '11px', color: '#94A3B8', textAlign: 'center' as const, margin: '20px 0 0' }
