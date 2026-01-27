# Inbound Webhooks (M1)

Receive leads from external sources (Meta, Generic webhooks, etc.) via authenticated POST requests.

## Endpoint

```
POST /functions/v1/webhook-ingest/:sourceId
```

Where `:sourceId` is the UUID of the configured inbound source.

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-API-Key` | Yes | The API key for this source (shown once on creation) |

## Request Body

JSON object with lead data. Field names can be mapped via source configuration.

### Default fields (no mapping)

```json
{
  "phone": "+393331234567",
  "first_name": "Mario",
  "last_name": "Rossi",
  "email": "mario@example.com",
  "city": "Milano",
  "cap": "20100"
}
```

### With field mapping (e.g., Meta)

If the source has mapping configured like:
```json
{
  "phone": "telefono",
  "first_name": "nome",
  "last_name": "cognome"
}
```

Then send:
```json
{
  "telefono": "+393331234567",
  "nome": "Mario",
  "cognome": "Rossi",
  "email": "mario@example.com"
}
```

## Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success - lead processed |
| `400` | Invalid JSON or missing phone |
| `401` | Missing or invalid API key |
| `404` | Source not found |
| `409` | Source is inactive |
| `429` | Rate limit exceeded |
| `500` | Internal error |

## Success Response

```json
{
  "success": true,
  "contact_id": "uuid",
  "deal_id": "uuid",
  "lead_event_id": "uuid"
}
```

## Behavior

### Deduplication
- Contacts are deduplicated by normalized phone number within each brand
- Same phone = same contact (no duplicate contacts created)

### Append-Only Events
- Every webhook call creates a new `lead_event`, even for existing contacts
- This allows tracking multiple lead submissions from the same contact

### Phone Normalization
- International prefixes are detected and stripped (+39, +44, etc.)
- Non-digit characters are removed
- Country code is stored separately

## curl Examples

### Basic request

```bash
curl -X POST \
  "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-ingest/YOUR-SOURCE-ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR-API-KEY" \
  -d '{
    "phone": "+393331234567",
    "first_name": "Mario",
    "last_name": "Rossi",
    "email": "mario@example.com"
  }'
```

### Meta-style request (with mapping)

```bash
curl -X POST \
  "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-ingest/YOUR-SOURCE-ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR-API-KEY" \
  -d '{
    "telefono": "+393331234567",
    "nome": "Mario",
    "cognome": "Rossi",
    "email": "mario@example.com",
    "campagna": "Summer 2024"
  }'
```

## Rate Limiting

- Default: 60 requests/minute per source
- Configurable per source in admin UI
- Returns `429` with `Retry-After: 60` header when exceeded

## Security

- API keys are hashed (SHA-256) before storage
- Keys are shown only once at creation time
- Rotate keys via admin UI if compromised
- `brand_id` is derived server-side from source, never from client
