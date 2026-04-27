
-- Aggiungi colonna payload_schema per validazione opzionale dei payload in ingresso
ALTER TABLE public.webhook_sources
ADD COLUMN IF NOT EXISTS payload_schema jsonb DEFAULT NULL;

COMMENT ON COLUMN public.webhook_sources.payload_schema IS
'Schema opzionale di validazione del payload in ingresso. Formato:
{
  "required": ["field1", "field2"],
  "fields": {
    "field1": { "type": "string", "max_length": 255, "pattern": "^[A-Z]+$" },
    "field2": { "type": "number", "min": 0, "max": 100 },
    "field3": { "type": "email" },
    "field4": { "type": "phone" },
    "field5": { "type": "object" },
    "field6": { "type": "array" }
  },
  "strict": false
}
Se NULL la validazione è disabilitata e il payload viene accettato così com''è.';
