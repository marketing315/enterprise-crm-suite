# Più email destinatarie per modulo Meta Lead Ads

## Stato attuale (verificato)
- Il backend `supabase/functions/_shared/meta-lead-email-notify.ts` invia già l'email a **tutti** i destinatari attivi di un modulo (loop su `meta_form_email_recipients` filtrato per meta_app + form_id + is_active).
- L'indice unico sul database è `(meta_app_id, form_id, recipient_email)`: consentire più email per lo stesso modulo è già previsto, **nessuna migrazione necessaria**.
- Il problema è solo di UI in `src/components/settings/meta/MetaFormEmailRecipients.tsx`: la lista è piatta (email + modulo su ogni riga), non si capisce che un modulo può avere più destinatari.

## Modifiche

### 1. Lista raggruppata per modulo
In `MetaFormEmailRecipients.tsx`:
- Raggruppare i destinatari per `form_id`, con il nome del modulo come intestazione (`form_name`, fallback all'elenco moduli, fallback `Modulo {id}`).
- Sotto ogni intestazione, un rigo per email con switch attivo/disattivo e cestino (invariato).

### 2. Aggiungere più email insieme
- Sostituire il campo singolo con un `Textarea` che accetta più email separate da virgola, punto e virgola o nuova riga (placeholder esplicativo).
- Al click su "Aggiungi destinatari": validare ogni indirizzo con lo schema Zod esistente, deduplicare (case-insensitive, anche rispetto ai destinatari già attivi del modulo) e inserire in un solo `insert` multiplo con `created_by`.
- Toast di riepilogo: "N destinatari aggiunti"; se qualche email è duplicata o non valida, avvisare separatamente senza bloccare le valide.
- Il pulsante si abilita quando è scelto il modulo e c'è almeno un indirizzo valido.

## Non modificato
- `meta-lead-email-notify.ts`: già invia a tutti i destinatari attivi con idempotency key per singolo destinatario.
- Schema/RLS della tabella: invariati.
- Toggle ed eliminazione: invariati.

## Verifica
- Build OK.
- Test E2E via Playwright: aprire "Regole di smistamento", aggiungere 2 email per lo stesso modulo, verificare la lista raggruppata e che i record compaiano nel database; rimuovere i record di test.
