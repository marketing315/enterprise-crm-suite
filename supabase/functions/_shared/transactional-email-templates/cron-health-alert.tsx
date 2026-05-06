/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Ralph Hub'

interface CronHealthAlertProps {
  alertType?: 'legacy_cron_reappeared' | 'high_error_rate'
  severity?: 'critical' | 'warning'
  title?: string
  summary?: string
  details?: Array<{ label: string; value: string }>
  affectedJobs?: string[]
  metricsWindow?: string
  errorRate?: number
  threshold?: number
  runbook?: string[]
  dashboardUrl?: string
  occurredAt?: string
}

function fmtDate(iso?: string): string {
  if (!iso) return new Date().toLocaleString('it-IT')
  try { return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' }) }
  catch { return iso }
}

const CronHealthAlertEmail = ({
  alertType = 'legacy_cron_reappeared',
  severity = 'critical',
  title = 'Anomalia infrastruttura cron',
  summary = '',
  details = [],
  affectedJobs = [],
  metricsWindow,
  errorRate,
  threshold,
  runbook = [],
  dashboardUrl,
  occurredAt,
}: CronHealthAlertProps) => {
  const accent = severity === 'critical' ? '#dc2626' : '#d97706'
  return (
    <Html lang="it" dir="ltr">
      <Head />
      <Preview>{`[${severity.toUpperCase()}] ${title}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badge, backgroundColor: accent }}>
            <Text style={badgeText}>{severity.toUpperCase()} · {alertType === 'legacy_cron_reappeared' ? 'CRON LEGACY' : 'TASSO ERRORI'}</Text>
          </Section>

          <Heading style={{ ...h1, color: accent }}>{title}</Heading>
          <Text style={text}>{summary}</Text>

          {(errorRate !== undefined || metricsWindow) && (
            <Section style={metricBox}>
              {errorRate !== undefined && (
                <>
                  <Text style={metricLabel}>Tasso errori</Text>
                  <Text style={{ ...metricValue, color: accent }}>{errorRate.toFixed(1)}% {threshold !== undefined ? `(soglia ${threshold}%)` : ''}</Text>
                </>
              )}
              {metricsWindow && (
                <>
                  <Text style={metricLabel}>Finestra</Text>
                  <Text style={metricValue}>{metricsWindow}</Text>
                </>
              )}
              <Text style={metricLabel}>Rilevato</Text>
              <Text style={metricValue}>{fmtDate(occurredAt)}</Text>
            </Section>
          )}

          {affectedJobs.length > 0 && (
            <Section style={{ margin: '8px 0 16px' }}>
              <Text style={sectionTitle}>Job coinvolti</Text>
              {affectedJobs.map((j, i) => (
                <Text key={i} style={listItem}>• {j}</Text>
              ))}
            </Section>
          )}

          {details.length > 0 && (
            <Section style={detailBox}>
              {details.map((d, i) => (
                <React.Fragment key={i}>
                  <Text style={detailLabel}>{d.label}</Text>
                  <Text style={detailValue}>{d.value}</Text>
                </React.Fragment>
              ))}
            </Section>
          )}

          {runbook.length > 0 && (
            <>
              <Hr style={hr} />
              <Text style={sectionTitle}>Runbook — azioni immediate</Text>
              {runbook.map((step, i) => (
                <Text key={i} style={runbookStep}><strong>{i + 1}.</strong> {step}</Text>
              ))}
            </>
          )}

          {dashboardUrl && (
            <Text style={text}>
              Dashboard: <a href={dashboardUrl} style={{ color: accent }}>{dashboardUrl}</a>
            </Text>
          )}

          <Hr style={hr} />
          <Text style={footer}>
            {SITE_NAME} · Alert automatico infrastruttura · Cooldown 1h per evitare flood
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CronHealthAlertEmail,
  subject: (data: Record<string, any>) =>
    `[${(data.severity ?? 'CRITICAL').toString().toUpperCase()}] ${data.title ?? 'Alert infrastruttura cron'}`,
  displayName: 'Alert salute cron',
  previewData: {
    alertType: 'legacy_cron_reappeared',
    severity: 'critical',
    title: 'Cron legacy ricomparsi',
    summary: '4 cron job legacy chiamano edge senza cron-relay e generano flood 401/403.',
    affectedJobs: ['sla-breach-checker', 'slo-burn-rate-monitor'],
    runbook: [
      'Aprire /admin/cron-jobs → tab Duplicati per vedere job IDs',
      'Eseguire cron.unschedule(<jobid>) per ogni duplicato legacy',
      'Verificare che la versione *-5min via cron-relay resti attiva',
    ],
    occurredAt: new Date().toISOString(),
    dashboardUrl: 'https://ralph-hub.lovable.app/admin/cron-jobs',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const badge = { display: 'inline-block', padding: '4px 12px', borderRadius: '4px', margin: '0 0 16px' }
const badgeText = { fontSize: '11px', color: '#ffffff', fontWeight: 'bold' as const, margin: 0, letterSpacing: '0.05em' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const sectionTitle = { fontSize: '13px', fontWeight: 'bold' as const, color: '#0f172a', margin: '8px 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const listItem = { fontSize: '13px', color: '#334155', margin: '0 0 4px', fontFamily: 'monospace' as const }
const detailBox = { backgroundColor: '#f8fafc', borderLeft: '3px solid #94a3b8', padding: '12px 16px', margin: '8px 0 16px', borderRadius: '4px' }
const detailLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '6px 0 2px' }
const detailValue = { fontSize: '13px', color: '#0f172a', margin: '0 0 6px', fontFamily: 'monospace' as const }
const metricBox = { backgroundColor: '#fef2f2', borderLeft: '3px solid #dc2626', padding: '12px 16px', margin: '8px 0 16px', borderRadius: '4px' }
const metricLabel = { fontSize: '11px', color: '#991b1b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '6px 0 2px' }
const metricValue = { fontSize: '15px', color: '#0f172a', margin: '0 0 6px', fontWeight: 'bold' as const }
const runbookStep = { fontSize: '13px', color: '#334155', lineHeight: '1.6', margin: '0 0 8px', paddingLeft: '4px' }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const footer = { fontSize: '11px', color: '#94a3b8', margin: '12px 0 0' }
