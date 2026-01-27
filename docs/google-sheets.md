# Google Sheets Export (M9) - Level C

Automatically append lead events to a Google Sheets file for real-time visibility and reporting.

## Overview

When a new `lead_event` is created via inbound webhook, it is automatically appended to a Google Sheets file. The system uses an **Enterprise structure** with separate RAW (append-only) and VIEW (filtered) tabs.

## File Structure

### Tabs

| Tab Name | Description |
|----------|-------------|
| `Riepilogo` | Summary KPIs: lead totali, 24h/7d/30d, per fonte/campagna, % archiviati |
| `ALL_RAW` | Aggregate append-only log of ALL leads (source of truth for Riepilogo) |
| `Meta_RAW` | Append-only log for Meta/Facebook sources |
| `Meta` | Filtered view with ARRAYFORMULA pointing to Meta_RAW |
| `Generic_RAW` | Append-only log for generic webhook sources |
| `Generic` | Filtered view with ARRAYFORMULA pointing to Generic_RAW |
| `[SourceName]_RAW` | Auto-created RAW tab for each new source |
| `[SourceName]` | Auto-created VIEW tab for each new source |

### Columns (Italian Headers)

Each row in a source tab contains:

| Column | Description |
|--------|-------------|
| `Timestamp` | When the lead was received (ISO 8601) |
| `Brand` | Brand name |
| `Fonte` | Source name (e.g., "Meta Campaign Q1") |
| `Nome` | Contact first name |
| `Cognome` | Contact last name |
| `Telefono` | Primary phone number |
| `Email` | Email address |
| `Città` | City |
| `Messaggio` | Message or notes from payload |
| `Campagna` | Campaign identifier (if present) |
| `Priorità AI` | AI-assigned priority (1-5, if processed) |
| `Archiviato` | Whether the event is archived (true/false) |

### View Features (Level C)

- ✅ **Freeze**: First row frozen
- ✅ **Filter**: Basic filter enabled on all columns
- ✅ **Bold Header**: Header row bold with gray background
- ✅ **Auto-resize**: Columns auto-sized

### Riepilogo KPIs

| KPI | Formula Source |
|-----|----------------|
| Lead Totali | Count from ALL_RAW |
| Lead Ultime 24h | COUNTIFS with date filter |
| Lead Ultimi 7 giorni | COUNTIFS with date filter |
| Lead Ultimi 30 giorni | COUNTIFS with date filter |
| Lead per Fonte | QUERY grouping by Fonte |
| Lead per Campagna | QUERY grouping by Campagna |
| % Archiviati | COUNTIF true/false |

## Idempotency

Before appending, the system checks `sheets_export_logs`:
- If `lead_event_id` exists with `status='success'` → **skip** (no duplicate rows)
- Use `force=true` to bypass this check

## Retry Behavior

- **Max attempts**: 3
- **Backoff**: Exponential (1s, 2s, 4s)
- **On failure**: 
  - Error logged to `sheets_export_logs` table with `status='failed'`
  - Does not block inbound webhook processing
  - Can be retried manually via admin UI

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_ENABLED` | `true` to enable export |
| `GOOGLE_SHEETS_FILE_ID` | The Sheets file ID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON |

### Service Account Setup

1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a service account with Sheets access
4. Download the JSON key
5. Base64-encode and add as secret: `GOOGLE_SERVICE_ACCOUNT_KEY`
6. Share the Sheets file with the service account email as **Editor**

## API

### Manual trigger (for testing)

```bash
curl -X POST \
  "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/sheets-export" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -d '{
    "lead_event_id": "uuid",
    "force": false
  }'
```

Response:
```json
{
  "success": true,
  "all_raw_tab": "ALL_RAW",
  "source_raw_tab": "Meta_RAW",
  "source_view_tab": "Meta"
}
```

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `GOOGLE_SHEETS_ENABLED` | `false` | Enable/disable Sheets export |
| `MYSQL_EXPORT_ENABLED` | `false` | Enable/disable MySQL export (future) |

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
- The worker batches writes to stay within limits
