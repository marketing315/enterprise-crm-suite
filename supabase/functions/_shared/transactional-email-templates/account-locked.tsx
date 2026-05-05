/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Ralph Hub'

interface AccountLockedProps {
  retryMinutes?: number
  ipAddress?: string
  userAgent?: string
  whenIso?: string
}

function formatWhen(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const AccountLockedEmail = ({ retryMinutes = 15, ipAddress, userAgent, whenIso }: AccountLockedProps) => (
  <Html lang="it" dir="ltr">
    <Head />
    <Preview>Accesso temporaneamente bloccato per troppi tentativi falliti</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Accesso bloccato temporaneamente</Heading>
        <Text style={text}>
          Abbiamo rilevato troppi tentativi di accesso falliti sul tuo account {SITE_NAME}.
          Per proteggerti, abbiamo bloccato gli accessi per <strong>{retryMinutes} minuti</strong>.
        </Text>

        <Section style={detailBox}>
          <Text style={detailLabel}>Quando</Text>
          <Text style={detailValue}>{formatWhen(whenIso) || 'Pochi istanti fa'}</Text>
          {ipAddress ? (
            <>
              <Text style={detailLabel}>Indirizzo IP</Text>
              <Text style={detailValue}>{ipAddress}</Text>
            </>
          ) : null}
          {userAgent ? (
            <>
              <Text style={detailLabel}>Dispositivo</Text>
              <Text style={detailValue}>{userAgent.slice(0, 200)}</Text>
            </>
          ) : null}
        </Section>

        <Text style={text}>
          <strong>Sei stato tu?</strong> Aspetta {retryMinutes} minuti e riprova. Se hai dimenticato
          la password puoi reimpostarla dalla pagina di accesso.
        </Text>
        <Text style={text}>
          <strong>Non sei stato tu?</strong> Qualcuno potrebbe aver provato a indovinare la tua
          password. Cambia la password al prossimo accesso e contatta l'amministratore se i
          tentativi continuano.
        </Text>

        <Text style={footer}>{SITE_NAME} · Sicurezza account</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountLockedEmail,
  subject: 'Accesso bloccato — troppi tentativi falliti',
  displayName: 'Account bloccato',
  previewData: {
    retryMinutes: 15,
    ipAddress: '93.42.46.74',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    whenIso: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const detailBox = {
  backgroundColor: '#f8fafc',
  borderLeft: '3px solid #ef4444',
  padding: '12px 16px',
  margin: '16px 0 24px',
  borderRadius: '4px',
}
const detailLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '6px 0 2px' }
const detailValue = { fontSize: '13px', color: '#0f172a', margin: '0 0 6px', fontFamily: 'monospace' as const }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }
