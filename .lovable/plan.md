

# Bug Fix: Impossibile eliminare i ticket

## Problema identificato

La tabella `tickets` ha RLS (Row Level Security) attivato con policy per SELECT, INSERT e UPDATE, ma **manca completamente la policy per DELETE**. Questo significa che qualsiasi tentativo di eliminare un ticket viene silenziosamente bloccato dal database, senza errore visibile all'utente (il frontend mostra "Errore nell'eliminazione").

Lo stesso problema esiste per le tabelle correlate:
- `ticket_events` -- manca la policy DELETE
- `ticket_audit_logs` -- manca la policy DELETE

La tabella `ticket_comments` ha gia una policy DELETE ma solo per i propri commenti.

## Soluzione

### 1. Aggiungere le policy DELETE mancanti

Creare una migrazione SQL con le seguenti policy:

```sql
-- Policy DELETE per tickets: solo utenti del brand possono eliminare
CREATE POLICY "Users can delete tickets in their brands"
ON public.tickets
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Policy DELETE per ticket_events: cascade con il ticket
CREATE POLICY "Users can delete ticket events in their brands"
ON public.ticket_events
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Policy DELETE per ticket_audit_logs: cascade con il ticket
CREATE POLICY "Users can delete audit logs in their brands"
ON public.ticket_audit_logs
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));
```

### 2. Nessuna modifica al codice frontend

Il codice frontend (useDeleteTicket, TicketsTable, TicketDetailSheet) e gia corretto: chiama `supabase.from("tickets").delete().eq("id", ticketId)` e gestisce l'errore. Il problema e esclusivamente lato database.

## Dettaglio tecnico

- **File modificato**: 1 nuova migrazione SQL
- **Rischio**: Basso. Aggiunge solo la capacita di eliminare, vincolata alla stessa logica di appartenenza al brand gia usata per le altre operazioni
- **Tempo stimato**: Meno di 1 minuto

