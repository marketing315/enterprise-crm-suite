
# Piano: Gestione Notifiche Avanzata

## Panoramica

Il sistema ha un'infrastruttura base per le notifiche (tabella `notifications`, `notification_preferences`, bell icon nel header). Questa implementazione aggiunge funzionalita avanzate per un'esperienza completa.

## Funzionalita da implementare

### 1. Pagina Centro Notifiche (`/notifications`)

Una pagina dedicata che mostra tutte le notifiche con:
- Filtri per tipo (Lead, Ticket, Appuntamento, Pipeline, ecc.)
- Filtro per stato (lette/non lette)
- Paginazione (caricamento infinito o cursore)
- Azioni bulk: "Segna tutto come letto", "Cancella notifiche lette"
- Deep-link: click sulla notifica naviga all'entita correlata (es. ticket, contatto, deal)

### 2. Preferenze Notifiche (in Impostazioni)

Una nuova tab nelle impostazioni utente per configurare:
- Toggle per ogni tipo di notifica (lead_event_created, ticket_assigned, ecc.)
- Opzione "Mute notifiche in-app" temporaneo
- Opzione "Solo toast, no badge"

### 3. Miglioramenti Backend

Nuove RPC per:
- `mark_all_notifications_read`: segna tutte le notifiche come lette
- `delete_notifications`: elimina notifiche specifiche
- `delete_read_notifications`: elimina tutte le notifiche lette
- `get_notification_preferences` / `upsert_notification_preferences`: gestione preferenze

### 4. Miglioramenti Frontend

- **NotificationBell**: link "Vedi tutte" che porta a `/notifications`
- **Routing**: aggiunta route `/notifications`
- **Deep-linking**: navigazione all'entita correlata (entity_type + entity_id)

---

## Architettura

```text
Header
  |
  +-- NotificationBell (popover con preview)
        |
        +-- "Vedi tutte" --> /notifications (pagina completa)
        
Settings
  |
  +-- Tab "Notifiche" --> NotificationPreferencesSettings
```

---

## Dettaglio Tecnico

### Migrazione Database

```sql
-- RPC: Segna tutte le notifiche come lette
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_brand_id uuid DEFAULT NULL)
RETURNS INTEGER;

-- RPC: Elimina notifiche
CREATE OR REPLACE FUNCTION delete_notifications(p_notification_ids uuid[])
RETURNS INTEGER;

-- RPC: Elimina notifiche lette
CREATE OR REPLACE FUNCTION delete_read_notifications(p_brand_id uuid DEFAULT NULL)
RETURNS INTEGER;

-- RPC: Ottieni preferenze notifiche
CREATE OR REPLACE FUNCTION get_notification_preferences(p_brand_id uuid)
RETURNS SETOF notification_preferences;

-- RPC: Upsert preferenza
CREATE OR REPLACE FUNCTION upsert_notification_preference(
  p_brand_id uuid,
  p_notification_type notification_type,
  p_enabled boolean
) RETURNS notification_preferences;
```

### Hook `useNotifications.ts` (estensione)

```typescript
// Nuovi hooks
export function useMarkAllNotificationsRead();
export function useDeleteNotifications();
export function useDeleteReadNotifications();

// Nuove funzionalita
export function useNotificationPreferences(brandId: string);
export function useUpsertNotificationPreference();
```

### Componenti UI

| Componente | Descrizione |
|------------|-------------|
| `NotificationsPage.tsx` | Pagina /notifications con lista filtrata |
| `NotificationFilters.tsx` | Barra filtri (tipo, stato) |
| `NotificationActions.tsx` | Azioni bulk (segna letto, cancella) |
| `NotificationPreferencesSettings.tsx` | Tab impostazioni preferenze |

### Deep-linking (mapping entity_type)

```typescript
const entityRoutes: Record<string, (id: string) => string> = {
  ticket: (id) => `/tickets?open=${id}`,
  contact: (id) => `/contacts?open=${id}`,
  deal: (id) => `/pipeline?deal=${id}`,
  appointment: (id) => `/appointments?open=${id}`,
  lead_event: (id) => `/events?event=${id}`,
};
```

---

## File da creare

| File | Descrizione |
|------|-------------|
| `src/pages/Notifications.tsx` | Pagina centro notifiche |
| `src/components/notifications/NotificationFilters.tsx` | Filtri per tipo/stato |
| `src/components/notifications/NotificationActions.tsx` | Azioni bulk |
| `src/components/settings/NotificationPreferencesSettings.tsx` | Tab preferenze |

## File da modificare

| File | Modifiche |
|------|-----------|
| `src/hooks/useNotifications.ts` | Nuovi hooks per azioni e preferenze |
| `src/components/notifications/NotificationBell.tsx` | Link "Vedi tutte", deep-link su click |
| `src/App.tsx` | Route `/notifications` |
| `src/pages/Settings.tsx` | Tab "Notifiche" per preferenze |
| Nuova migrazione SQL | RPC per mark all, delete, preferenze |

---

## Interfaccia Utente

### Pagina Centro Notifiche

```text
+--------------------------------------------------+
| Centro Notifiche                    [Segna tutte] |
+--------------------------------------------------+
| [Tutti] [Lead] [Ticket] [Pipeline] [Appuntamenti] |
| [x] Solo non lette    [Cancella lette]            |
+--------------------------------------------------+
| [●] Nuovo Lead                        2 min fa   |
|     Mario Rossi ha richiesto info...  [>]        |
+--------------------------------------------------+
| [ ] Ticket Assegnato                  15 min fa  |
|     #1234 assegnato a te              [>]        |
+--------------------------------------------------+
| [Carica altre...]                                 |
+--------------------------------------------------+
```

### Tab Preferenze Notifiche

```text
+------------------------------------------+
| Preferenze Notifiche                      |
+------------------------------------------+
| Ricevi notifiche per:                     |
|                                           |
| [x] Nuovi Lead                            |
| [x] Ticket assegnati a me                 |
| [x] Cambio stato ticket                   |
| [x] Nuovi appuntamenti                    |
| [ ] Decisioni AI pronte                   |
| [x] Messaggi chat                         |
+------------------------------------------+
```

---

## Risultato Atteso

1. Pagina `/notifications` con lista completa e filtri
2. Click su notifica naviga all'entita correlata
3. Azioni "Segna tutto come letto" e "Cancella lette"
4. Tab preferenze in Impostazioni per controllare quali notifiche ricevere
5. NotificationBell migliorato con link "Vedi tutte"
