# Google Sheets Integration (M9) — Enterprise Architecture

## Overview

The Google Sheets integration provides **real-time, append-only synchronization** of lead events to a Google Spreadsheet. It is designed for C-level presentation with Italian headers, automated KPIs, and professional formatting.

## Architecture

### Multi-Tab Structure (Enterprise)

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Spreadsheet                        │
├─────────────────────────────────────────────────────────────┤
│  Riepilogo     │ KPI dashboard with SUMPRODUCT formulas     │
│                │ (works on ALL_RAW with proper datetime)    │
├─────────────────────────────────────────────────────────────┤
│  ALL_RAW       │ Aggregate append-only log (all sources)    │
├─────────────────────────────────────────────────────────────┤
│  Meta_RAW      │ Source-specific append-only log            │
│  Meta          │ VIEW with =ARRAYFORMULA (user-friendly)    │
├─────────────────────────────────────────────────────────────┤
│  Generic_RAW   │ Source-specific append-only log            │
│  Generic       │ VIEW with =ARRAYFORMULA                    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Inbound webhook** → creates `lead_event`
2. **webhook-ingest** → calls `sheets-export` (internal, service-role auth)
3. **sheets-export** → appends to `ALL_RAW` + `[Source]_RAW`
4. **VIEW tabs** → auto-mirror RAW via `ARRAYFORMULA`
5. **Riepilogo** → KPIs with proper ISO→datetime conversion

## Security

### Endpoint Protection

The `sheets-export` function is **internal-only**:

```typescript
// Only accepts:
// 1. Service role: Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}
// 2. Internal token: X-Internal-Token: ${SHEETS_INTERNAL_TOKEN}
```

**Never expose** this endpoint to public clients.

### Batch Export (Admin Only)

The `sheets-batch-export` function requires **service role** authentication:

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/sheets-batch-export" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "uuid",
    "from": "2026-01-01",
    "to": "2026-01-31",
    "only_failed": true,
    "limit": 100,
    "force": false
  }'
```

## KPI Formulas (Robust Datetime - Italian)

The Riepilogo tab uses **SUMPRODUCT with proper ISO timestamp conversion**. Google Sheets in Italian uses `;` as separator.

```
// ISO timestamp: 2026-01-27T14:30:00.000Z
// Conversion: DATEVALUE(LEFT(A2;10)) + TIMEVALUE(MID(A2;12;8))
```

### Lead Count Formulas

```
// Lead ultime 24h (robust with time):
=SUMPRODUCT((Meta_RAW!A2:A<>"")*(SE.ERRORE(DATEVALUE(LEFT(Meta_RAW!A2:A;10))+TIMEVALUE(MID(Meta_RAW!A2:A;12;8));0)>=NOW()-1))

// Lead ultimi 7 giorni:
=SUMPRODUCT((Meta_RAW!A2:A<>"")*(DATEVALUE(LEFT(Meta_RAW!A2:A;10))>=TODAY()-7))

// Lead ultimi 30 giorni:
=SUMPRODUCT((Meta_RAW!A2:A<>"")*(DATEVALUE(LEFT(Meta_RAW!A2:A;10))>=TODAY()-30))
```

### Source & Campaign Analysis

```
// Lista fonti uniche:
=UNIQUE(FILTER(Meta_RAW!C2:C; Meta_RAW!C2:C<>""))

// Conteggio per fonte (se il valore è in A11):
=COUNTIF(Meta_RAW!C2:C; A11)

// Lista campagne uniche:
=UNIQUE(FILTER(Meta_RAW!J2:J; Meta_RAW!J2:J<>""))

// Conteggio per campagna (se il valore è in A15):
=COUNTIF(Meta_RAW!J2:J; A15)
```

### Archived Status

```
// Se colonna L contiene "true"/"false" come stringa:
=COUNTIF(Meta_RAW!L2:L; "true")   // Archiviati
=COUNTIF(Meta_RAW!L2:L; "false")  // Non archiviati

// Se colonna L contiene booleano TRUE/FALSE:
=COUNTIF(Meta_RAW!L2:L; TRUE)
=COUNTIF(Meta_RAW!L2:L; FALSE)

// % Archiviati (formatta cella come Percentuale):
=SE.ERRORE(B18/(B18+B19);0)
```

## Headers (Italian) - PRD Aligned

| Column | Header IT              | Description                         |
|--------|------------------------|-------------------------------------|
| A      | Timestamp              | ISO datetime received_at            |
| B      | Brand                  | Brand name                          |
| C      | Fonte                  | Source name (Meta, Generic...)      |
| D      | Campagna               | Campaign name                       |
| E      | AdSet                  | AdSet name                          |
| F      | Ad                     | Ad creative name                    |
| G      | Nome                   | First name                          |
| H      | Cognome                | Last name                           |
| I      | Telefono               | Normalized phone                    |
| J      | Email                  | Email address                       |
| K      | Città                  | City                                |
| L      | Messaggio/Pain Area    | Message/notes/pain area             |
| M      | Priorità AI            | AI priority (1=min, 5=urgent)       |
| N      | Stage Pipeline         | Current deal stage name             |
| O      | Tags                   | Comma-separated tags                |
| P      | Appuntamento Status    | Appointment status                  |
| Q      | Appuntamento Data      | Appointment scheduled datetime      |
| R      | Vendita Outcome        | Deal status (won/lost/open)         |
| S      | Vendita Valore         | Deal value                          |
| T      | Operatore Ultima Azione| Last operator action timestamp      |

## Scheduled KPI Refresh Job

The `sheets-kpi-refresh` edge function updates the "Riepilogo" tab with live KPIs:

### Invocation

```bash
# Manual refresh
curl -X POST "${SUPABASE_URL}/functions/v1/sheets-kpi-refresh" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

### Cron Setup

```sql
SELECT cron.schedule(
  'sheets-kpi-refresh-hourly',
  '0 * * * *', -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://project-ref.supabase.co/functions/v1/sheets-kpi-refresh',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

### KPIs Included (1-10)

1. **Lead Totali** - Total lead count
2. **Lead Ultime 24h** - Leads in last 24 hours
3. **Lead Ultimi 7 giorni** - Leads in last 7 days
4. **Lead Ultimi 30 giorni** - Leads in last 30 days
5. **Media Giornaliera** - Daily average (30 days)
6. **Appuntamenti** - Appointment counts by status
7. **Vendite** - Sales count (won/lost) with win rate
8. **Distribuzione Priorità AI** - Priority distribution (1-5)
9. **Lead per Fonte** - Leads grouped by source
10. **Top 10 Campagne** - Top campaigns by volume

## Idempotency

Race-safe idempotency via DB constraint:

1. `INSERT sheets_export_logs (status='processing')`
2. If conflict (23505) → already exported → return `{skipped: true}`
3. Append to Google Sheets
4. `UPDATE status='success'`

## Batch Operations

### Re-export Failed

```json
{
  "brand_id": "uuid",
  "only_failed": true,
  "limit": 100
}
```

### Export Date Range

```json
{
  "brand_id": "uuid",
  "from": "2026-01-01",
  "to": "2026-01-31"
}
```

### Force Re-export (bypass idempotency)

```json
{
  "brand_id": "uuid",
  "force": true,
  "limit": 50
}
```

## Environment Variables

| Variable                    | Required | Description                          |
|-----------------------------|----------|--------------------------------------|
| GOOGLE_SHEETS_ENABLED       | Yes      | Feature flag (true/false)            |
| GOOGLE_SERVICE_ACCOUNT_KEY  | Yes      | Base64 or JSON service account       |
| GOOGLE_SHEETS_FILE_ID       | Yes      | Spreadsheet ID                       |
| SHEETS_INTERNAL_TOKEN       | Optional | Alternative to service role auth     |

## Tab Layout (Applied on Creation)

- **Frozen row 1** (header)
- **Basic filter** on columns A-L
- **Bold header** with gray background
- **Auto-resize** columns

Layout is applied **only once** when a tab is created (not on every export).

## Cost

**Google Sheets API is free** within standard quotas (100 requests/100 seconds per user). No billing required for normal CRM usage.

## Troubleshooting

### "Permission denied" error

- Ensure the service account email is added as Editor to the Sheets file
- Check that the Sheets API is enabled in Google Cloud Console

### Missing data

- Check `sheets_export_logs` table for failed exports
- Verify the lead_event was created successfully first
- Check idempotency: if already exported, returns `skipped: true`

### Rate limiting

- Google Sheets API has quotas (100 requests/100 seconds per user)
- The batch export function adds 200ms delay between requests
