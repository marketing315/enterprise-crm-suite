/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
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

const Row = ({ label, value }: Field) => (
  <Section style={row}>
    <Text style={lbl}>{label}</Text>
    <Text style={val}>{value || '—'}</Text>
  </Section>
)

const MetaLeadEmail = ({
  fullName, phone, email, city, formName, campaignName, brandName, receivedAt, fields = [], crmUrl,
}: Props) => (
  <Html lang="it" dir="ltr">
    <Head />
    <Preview>{`Nuovo lead${formName ? ` da ${formName}` : ''}: ${fullName || phone || email || ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={badge}>NUOVO LEAD{brandName ? ` · ${brandName.toUpperCase()}` : ''}</Text>
        <Heading style={h1}>{fullName || 'Lead senza nome'}</Heading>
        <Text style={muted}>
          {formName ? `Modulo: ${formName}` : 'Modulo Meta'}
          {campaignName ? ` · Campagna: ${campaignName}` : ''}
          {receivedAt ? ` · ${receivedAt}` : ''}
        </Text>

        <Section style={box}>
          <Row label="Telefono" value={phone || ''} />
          <Row label="Email" value={email || ''} />
          <Row label="Città" value={city || ''} />
        </Section>

        {fields.length > 0 && (
          <>
            <Text style={section}>Risposte al modulo</Text>
            <Section style={box}>
              {fields.map((f, i) => <Row key={i} label={f.label} value={f.value} />)}
            </Section>
          </>
        )}

        {crmUrl && (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={crmUrl} style={btn}>Apri nel CRM</Button>
          </Section>
        )}
        <Hr style={{ borderColor: '#e5e7eb' }} />
        <Text style={footer}>Email automatica inviata dal CRM per ogni nuovo lead di questo modulo.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MetaLeadEmail,
  subject: (d: Record<string, any>) =>
    `Nuovo lead${d.formName ? ` – ${d.formName}` : ''}${d.fullName ? `: ${d.fullName}` : ''}`,
  displayName: 'Notifica lead Meta',
  previewData: {
    fullName: 'Mario Rossi', phone: '+39 333 1234567', email: 'mario@example.com', city: 'Milano',
    formName: 'Centri MyMed', campaignName: 'Campagna ottobre', brandName: 'Centri MyMed',
    receivedAt: '06/10/2026 16:00', fields: [{ label: 'Che tipo di attività gestisci?', value: 'Poliambulatorio' }],
    crmUrl: 'https://crm.gruppobenessere.it/events',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, Segoe UI, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const badge = { fontSize: '11px', letterSpacing: '1px', color: '#3B82F6', fontWeight: 700, margin: '0 0 8px' }
const h1 = { fontSize: '22px', color: '#0F172A', margin: '0 0 4px' }
const muted = { fontSize: '13px', color: '#64748b', margin: '0 0 16px' }
const section = { fontSize: '13px', fontWeight: 700, color: '#0F172A', margin: '16px 0 6px' }
const box = { border: '1px solid #e5e7eb', borderRadius: '10px', padding: '4px 14px' }
const row = { padding: '6px 0', borderBottom: '1px solid #f1f5f9' }
const lbl = { fontSize: '11px', color: '#64748b', margin: 0 }
const val = { fontSize: '14px', color: '#0F172A', margin: '2px 0 0' }
const btn = { backgroundColor: '#3B82F6', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', fontSize: '14px', textDecoration: 'none' }
const footer = { fontSize: '11px', color: '#94a3b8' }
