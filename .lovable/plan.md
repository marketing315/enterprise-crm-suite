# Invio lead via email (HTML) per modulo Meta

## Cosa ottieni
- Nelle impostazioni Meta, per ogni modulo puoi aggiungere uno o più indirizzi email destinatari e attivarli/disattivarli quando vuoi.
- Ogni lead che arriva da quel modulo genera subito un'email HTML (una per lead, per ogni destinatario) con: nome, cognome, telefono, email, città, tutte le risposte del modulo, nome modulo/campagna, brand, data/ora e un pulsante "Apri nel CRM".
- Mittente: dominio già verificato `notify.my-med.it`.
- Se l'email fallisce, il lead arriva comunque nel CRM come oggi: l'invio non blocca mai l'ingresso dei lead.

## Interfaccia
- Nel dialog "Regole di smistamento" (o accanto, nella stessa riga della Meta App) nuova sezione "Notifiche email": scegli modulo, inserisci email, toggle attivo, elimina.
- Elenco destinatari configurati con nome modulo leggibile.

## Note
- In fondo a ogni email viene aggiunto automaticamente un link di disiscrizione (obbligatorio, non disattivabile). Se un destinatario lo usa, smette di ricevere queste email.
- Nessun allegato; i dati sono nel corpo dell'email.

## Dettagli tecnici
- Nuova tabella `meta_form_email_recipients` (meta_app_id FK, form_id, form_name, recipient_email, is_active, created_by, timestamps, UNIQUE(meta_app_id, form_id, recipient_email)). GRANT + RLS: admin/CEO del brand della Meta App; service_role completo. Additiva, nessun impatto su tabelle esistenti.
- Nuovo template React Email `meta-lead-notification.tsx` in `_shared/transactional-email-templates/` + registrazione in `registry.ts`; dati via `templateData` (escape automatico, campi `field_data` mostrati come tabella label/valore).
- Helper `_shared/meta-lead-email-notify.ts`: legge destinatari attivi per (meta_app, form_id) e invoca `send-transactional-email` per ciascuno con `idempotencyKey = meta-lead-{leadgen_id}-{email}`. Fire-and-forget con try/catch, log redatti (no PII).
- Hook in `meta-leads-webhook` (`processLeadChange`, dopo ingest) e in `meta-leads-recover` (quando un lead `fetched` diventa `ingested`), così anche i lead recuperati vengono notificati; l'idempotenza evita doppioni. Anche lead senza telefono (es. test) vengono inviati.
- UI: nuovo componente `MetaFormEmailRecipients` riusando l'elenco moduli da `meta-list-forms`; validazione email con Zod.
- Deploy: `meta-leads-webhook`, `meta-leads-recover`, `send-transactional-email`.
- Verifica: lead di prova dal Meta Lead Ads Testing Tool → controllo log invii email.
