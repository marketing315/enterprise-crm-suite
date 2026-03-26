

## Piano: Allineare la configurazione Keplero di MyMed a quella di Excell

### Situazione attuale

| Campo | Excell (`f330ec9e`) | MyMed (`6bca111b`) |
|-------|--------------------|--------------------|
| `handler` | `keplero` | `null` |
| `counts_as_new_lead` | `false` | `true` |
| `description` | "Keplero invia i dati al CRM..." | `null` |

Senza `handler = 'keplero'`, i webhook Keplero per MyMed vengono processati come webhook generici e non passano per il flusso household (contatti, appuntamenti, deal, auto-stage "Fissato").

### Cosa farò

Aggiornare il record `webhook_sources` di MyMed (`id: 6bca111b-410d-41c6-bcf3-264d86c5f943`) con una migration SQL:

1. **`handler`** → `'keplero'` — attiva il routing verso l'edge function `keplero-webhook`
2. **`counts_as_new_lead`** → `false` — il lead viene creato dal handler Keplero, non dal gateway generico
3. **`description`** → `'Keplero invia i dati al CRM attraverso questo webhook'`

Nessuna modifica al codice dell'edge function: il flusso Keplero è già brand-agnostico (usa il `brand_id` della webhook source).

### Dettaglio tecnico

```sql
UPDATE webhook_sources
SET handler = 'keplero',
    counts_as_new_lead = false,
    description = 'Keplero invia i dati al CRM attraverso questo webhook',
    updated_at = now()
WHERE id = '6bca111b-410d-41c6-bcf3-264d86c5f943';
```

