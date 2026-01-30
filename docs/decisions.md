# Decisioni Architetturali

## Phone Correction - Gestione Conflitti

### Data: 2026-01-30

### Contesto
La funzione `correct_contact_phone` permette di correggere un numero di telefono associato a un contatto. Quando il nuovo numero è già associato a un altro contatto, si presenta un edge case che richiede una decisione di design.

### Decisione
**Approccio scelto: Notifica del conflitto senza merge automatico**

Quando si tenta di correggere un numero e questo esiste già su un altro contatto:
1. La funzione RPC ritorna `success: false` con `error: 'phone_exists_other_contact'`
2. Viene fornito il `conflicting_contact_id` per permettere la navigazione
3. L'operatore può visualizzare il contatto in conflitto e decidere manualmente

### Alternative considerate

#### A) Merge automatico dei contatti
- **Pro**: Workflow semplificato
- **Contro**: Rischio di merge errati, perdita dati, difficile reversibilità
- **Scartata**: Troppo rischioso per dati CRM critici

#### B) Blocco totale con errore
- **Pro**: Sicuro, nessuna ambiguità
- **Contro**: Non fornisce informazioni utili all'operatore
- **Scartata**: Esperienza utente povera

#### C) Spostamento automatico del telefono
- **Pro**: Risolve il conflitto immediatamente
- **Contro**: Il vecchio contatto perde un numero potenzialmente valido
- **Scartata**: Decisione troppo aggressiva per un'operazione automatica

### Conseguenze
- L'operatore deve gestire manualmente i conflitti
- Il sistema preserva l'integrità dei dati
- È possibile implementare un merge manuale in futuro tramite UI dedicata
- L'audit log traccia tutti i tentativi, inclusi quelli falliti per conflitto

### Audit Trail
Ogni correzione (riuscita o fallita) viene tracciata in `audit_log` con:
- `entity_type`: 'contact_phone'
- `action`: 'phone_corrected' | 'phone_corrected_merged'
- `old_value`: numero precedente
- `new_value`: nuovo numero
- `metadata`: contact_id, is_primary flag
