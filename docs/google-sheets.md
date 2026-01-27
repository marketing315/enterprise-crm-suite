# Google Sheets Export (M9)

Automatically append lead events to a Google Sheets file for real-time visibility and reporting.

## Overview

When a new `lead_event` is created via inbound webhook, it is automatically appended to a Google Sheets file. Each source type gets its own tab.

## File Structure

### Tabs

| Tab Name | Description |
|----------|-------------|
| `Riepilogo` | Summary statistics and KPIs |
| `Meta` | Leads from Meta/Facebook sources |
| `Generic` | Leads from generic webhook sources |
| `[SourceName]` | Auto-created tab for each new source |

### Columns

Each row in a source tab contains:

| Column | Description |
|--------|-------------|
| `timestamp` | When the lead was received (ISO 8601) |
| `brand` | Brand name |
| `source` | Source name (e.g., "Meta Campaign Q1") |
| `first_name` | Contact first name |
| `last_name` | Contact last name |
| `phone_primary` | Primary phone number |
| `email` | Email address |
| `city` | City |
| `message` | Message or notes from payload |
| `campaign_name` | Campaign identifier (if present) |
| `ai_priority` | AI-assigned priority (1-5, if processed) |
| `archived` | Whether the event is archived |

## Retry Behavior

- **Max attempts**: 3
- **Backoff**: Exponential (1s, 2s, 4s)
- **On failure**: 
  - Error logged to `sheets_export_logs` table
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
6. Share the Sheets file with the service account email

## API

### Manual trigger (for testing)

```bash
curl -X POST \
  "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/sheets-export" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -d '{
    "lead_event_id": "uuid",
    "force": true
  }'
```

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `GOOGLE_SHEETS_ENABLED` | `false` | Enable/disable Sheets export |
| `MYSQL_EXPORT_ENABLED` | `false` | Enable/disable MySQL export (future) |

## Troubleshooting

### "Permission denied" error

- Ensure the service account email is added as Editor to the Sheets file
- Check that the Sheets API is enabled in Google Cloud Console

### Missing data

- Check `sheets_export_logs` table for failed exports
- Verify the lead_event was created successfully first

### Rate limiting

- Google Sheets API has quotas (100 requests/100 seconds per user)
- The worker batches writes to stay within limits
