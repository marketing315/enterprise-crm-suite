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

## 2026-05-04 — Dashboard RPC consolidation (rifiutato)

**Segnalazione audit**: "useCeoDashboard / useSalespersonKpis / useCallcenterKpis fanno molte query parallele, consolidare in materialized view o RPC singole `dashboard_for_role()` per ridurre roundtrip."

**Decisione**: NON actionable. Archiviato.

**Evidenza** (`extensions.pg_stat_statements`, snapshot prod):
- `get_ceo_dashboard_kpis`: mean 3.5ms (1 call) → già consolidato
- `get_callcenter_kpis_overview`: mean 2.2ms (1 call)
- `get_salesperson_kpis`: mean 19.3ms (1 call)
- Top-6 RPC dashboard via PostgREST: mean 18–58ms, max p95 ~173ms (1 outlier su 2 chiamate)
- Carico totale dashboard ≈ 2 secondi cumulati su ~50 chiamate misurate

**Razionale**: gli RPC `get_*_kpis` aggregano già server-side (CTE multi-tabella). I 130+ hook custom NON significano 130+ query: la maggior parte è già fan-in su pochi RPC. Materialized view introdurrebbe lag di freschezza (KPI real-time è il valore principale del CRM) senza beneficio misurabile.

**Trigger per riaprire**: se un singolo RPC dashboard supera p95 500ms o mean 200ms su 50+ call/giorno.
