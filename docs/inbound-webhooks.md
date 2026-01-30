# Inbound Webhooks (M1) — Enterprise Architecture

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
| `X-API-Key` | Yes | The API key for this source (authentication) |
| `X-Webhook-Secret` | If HMAC enabled | The webhook signing secret |
| `X-Signature` | If HMAC enabled | HMAC-SHA256 signature: `sha256=<hex>` |
| `X-Timestamp` | If HMAC enabled | Unix timestamp in seconds |

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

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | Success | Lead processed, contact created/deduped |
| `400` | Bad Request | Invalid JSON, missing phone, or invalid UUID |
| `401` | Unauthorized | Missing or invalid API key |
| `404` | Not Found | Source UUID not found |
| `409` | Conflict | Source is inactive (`inactive_source`) |
| `429` | Too Many Requests | Rate limit exceeded (check `Retry-After` header) |
| `500` | Internal Error | Server error |

## Success Response

```json
{
  "success": true,
  "contact_id": "uuid",
  "deal_id": "uuid",
  "lead_event_id": "uuid"
}
```

## Error Response

```json
{
  "error": "error_code",
  "message": "Human-readable message",
  "retry_after": 60  // Only for 429
}
```

## Pipeline

### Guard-rails (in order)

1. **UUID validation** → 400 if invalid format
2. **API key check** → 401 if missing
3. **Source lookup** → 404 if not found
4. **Active check** → 409 if inactive
5. **API key verify** → 401 if wrong key
6. **Rate limit** → 429 if exceeded
7. **Body parse** → 400 if invalid JSON
8. **Phone required** → 400 if missing phone

### Processing

1. **Audit**: Store raw request in `incoming_requests`
2. **Field mapping**: Apply source-specific field mapping
3. **Phone normalization**: Strip prefixes, detect country
4. **Contact dedup**: Find or create contact (per brand)
5. **Deal creation**: Find or create open deal for contact
6. **Lead event**: Create append-only event record
7. **Side-effects**: Fire sheets-export (async, non-blocking)

## Behavior

### Deduplication
- Contacts are deduplicated **per brand** by normalized phone number
- Same phone within a brand = same contact (no duplicate contacts)
- Different brands = different contacts (even with same phone)

### Append-Only Events
- Every webhook call creates a **new** `lead_event`, even for existing contacts
- This allows tracking multiple lead submissions from the same contact
- Events are never updated or deleted

### Phone Normalization
- International prefixes are detected and stripped (+39, +44, +1, etc.)
- Non-digit characters are removed
- Country code is stored separately for reporting

### Field Mapping
- Sources can define custom field mappings in JSON
- Unmapped fields are passed through unchanged
- Mapping is config-driven (no code changes needed for new sources)

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
- Token bucket algorithm with per-minute refill

## Security

### API Key Authentication
- API keys are hashed (SHA-256) before storage
- Keys are shown only once at creation time
- Rotate keys via admin UI if compromised
- `brand_id` is derived server-side from source, never from client
- All requests logged to `incoming_requests` for audit

### HMAC Signature Verification (Optional, per-source)

When HMAC is enabled for a source, you receive TWO secrets:
1. **API Key** - For authentication (`X-API-Key` header)
2. **Webhook Secret** - For signing requests (`X-Webhook-Secret` header)

**Verification Flow**:
1. Server verifies `X-Webhook-Secret` matches stored hash
2. Server verifies `X-Timestamp` is within replay window
3. Server computes `HMAC-SHA256(secret, "{timestamp}.{body}")`
4. Server compares computed signature with `X-Signature`

**Signature Format**: `X-Signature: sha256=<hex>`
**Message Format**: `{timestamp}.{body}`

**Anti-Replay Protection**:
- Requires `X-Timestamp` header with Unix timestamp (seconds)
- Configurable time window (60-3600 seconds, default 300s = 5 minutes)
- Requests outside the window are rejected with `replay_detected`

**Example (curl with HMAC)**:

```bash
# Variables
API_KEY="your-api-key"
WEBHOOK_SECRET="your-webhook-secret"
TIMESTAMP=$(date +%s)
BODY='{"phone":"+393331234567","first_name":"Mario"}'

# Generate signature
SIGNATURE=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST \
  "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-ingest/YOUR-SOURCE-ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -H "X-Signature: sha256=$SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$BODY"
```

**HMAC Error Codes**:
| Error | Description |
|-------|-------------|
| `missing_webhook_secret` | X-Webhook-Secret header required but not provided |
| `invalid_webhook_secret` | Webhook secret doesn't match |
| `missing_signature` | X-Signature header required |
| `missing_timestamp` | X-Timestamp header required |
| `invalid_timestamp_format` | Timestamp must be Unix seconds |
| `replay_detected` | Timestamp outside allowed window |
| `invalid_signature` | HMAC verification failed |

## Structured Logging

Every request is logged with JSON structure:

```json
{
  "request_id": "uuid",
  "source_id": "uuid",
  "outcome": "success|invalid_uuid|missing_api_key|invalid_api_key|source_not_found|inactive_source|rate_limited",
  "status": 200,
  "contact_id": "uuid",
  "lead_event_id": "uuid"
}
```

## Troubleshooting

### 400 - Invalid JSON or missing phone

**Cause**: Request body is not valid JSON, or phone field is missing/empty.

**Fix**:
- Ensure `Content-Type: application/json` header is set
- Ensure phone field is present (using mapped name if applicable)
- Validate JSON syntax

### 401 - Unauthorized

**Cause**: Missing `X-API-Key` header, or key doesn't match stored hash.

**Fix**:
- Include `X-API-Key` header with the key shown at source creation
- If key is lost, rotate it via admin UI

### 404 - Source not found

**Cause**: The source UUID in the URL doesn't exist.

**Fix**:
- Verify the source ID is correct
- Check if source was deleted

### 409 - Source inactive

**Cause**: Source exists but `is_active = false`.

**Fix**:
- Re-enable source in admin UI
- Or contact admin to activate

### 429 - Rate limit exceeded

**Cause**: Too many requests in the current minute.

**Fix**:
- Wait for `Retry-After` seconds (default 60)
- Implement backoff in your client
- Request rate limit increase via admin

### 500 - Internal error

**Cause**: Server-side error (DB, RPC, etc.)

**Fix**:
- Check edge function logs for details
- Retry with exponential backoff
- Contact support if persistent

## Source Configuration

Each inbound source has:

| Field | Description |
|-------|-------------|
| `id` | UUID (used in endpoint URL) |
| `brand_id` | Brand this source belongs to |
| `name` | Display name (e.g., "Meta Lead Forms") |
| `api_key_hash` | SHA-256 hash of the API key |
| `is_active` | Enable/disable ingestion |
| `rate_limit_per_min` | Max requests per minute |
| `mapping` | JSON field mapping config |

## E2E Test Sources

For CI/CD testing, these sources are seeded:

| Source | ID | Purpose |
|--------|----|---------|
| Active | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001` | Happy path tests |
| Inactive | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002` | 409 inactive test |
| Rate-limited | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003` | 429 rate limit test |

API Key for all: `e2e-test-api-key-12345`
