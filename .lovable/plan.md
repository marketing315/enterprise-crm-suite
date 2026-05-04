## Obiettivo

Aggiungere a `NotificationBell` e Dashboard tre miglioramenti di "attenzione utente":

1. Suono opzionale su nuove notifiche critiche (default: ticket SLA breach + appuntamenti a rischio), con preferenza salvata per utente.
2. Badge nel `document.title` del browser (`(3) Ralph CRM`) quando la tab è in background e ci sono notifiche non lette.
3. Riassunto giornaliero in cima alla Dashboard ("Oggi hai X nuovi lead, Y ticket SLA in scadenza, Z appuntamenti").

Nessuna nuova dipendenza, nessuna migration: riusiamo `user_push_preferences` (già esistente) per la preferenza suono e i dati già forniti da `useDashboardData`.

---

## 1. Suono opzionale su notifiche critiche

**Nuovo file** `src/hooks/useNotificationSound.ts`:
- Espone `{ soundEnabled, setSoundEnabled, playSound }`.
- Legge/scrive una riga in `user_push_preferences` con `notification_type = 'sound_critical'` (riusa la tabella esistente, niente migration).
- `playSound()` usa Web Audio API (`AudioContext` + `OscillatorNode`, due beep brevi 880Hz/660Hz) — zero asset, zero file mp3.
- Espone wrapper sicuro: niente errori se l'utente non ha mai interagito con la pagina (browser autoplay policy → catch & ignore).

**Modifica** `src/components/notifications/NotificationBell.tsx`:
- Lista tipi "critici": `['ticket_created', 'appointment_risk_alert', 'slo_alert', 'ticket_escalated']` (quelli SLA-related già presenti nei type label / memory).
- In `handleNewNotification`: se `soundEnabled === true` e `notification.type` è critico → `playSound()`.
- Aggiungere nel popover header un piccolo toggle icon (`Volume2`/`VolumeX`) con `Tooltip` "Suono notifiche critiche".

## 2. Badge sul title della tab

**Nuovo file** `src/hooks/useDocumentTitleBadge.ts`:
- Hook montato una sola volta (in `MainLayout`).
- Legge `useUnreadNotificationCount()` + `document.visibilityState`.
- Quando la tab è `hidden` e `unread > 0`: imposta `document.title = "(N) <titolo originale>"`.
- Quando torna `visible` o `unread === 0`: ripristina il titolo originale memorizzato in un ref.
- Listener su `visibilitychange`; cleanup ripristina sempre il titolo.

**Modifica** `src/components/layout/MainLayout.tsx`:
- Chiamata `useDocumentTitleBadge()` (insieme al resto degli hook globali già presenti).

## 3. Riassunto giornaliero in Dashboard

**Nuovo componente** `src/components/dashboard/DailyBriefing.tsx`:
- Card glassmorphism in cima alla dashboard (sopra ai KPI primari).
- Saluto contestuale ora-del-giorno: "Buongiorno" (<12), "Buon pomeriggio" (<18), "Buonasera" — usa `preferred_name` da `users` se disponibile via `useAuth().userProfile`, fallback al nome generico.
- Frase a una riga, costruita componendo solo i numeri ≠ 0 da `useDashboardData()`:
  - `leadsToday` → "X nuovi lead"
  - `slaBreachedTickets` → "Y ticket SLA in scadenza"  
  - `appointmentsToday` → "Z appuntamenti oggi"
- Se tutti zero: "Nessuna emergenza in vista. Buon lavoro!".
- Mini-CTA inline (link a `/events`, `/tickets?slaBreach=true`, `/appointments/calendar`) per ogni numero > 0.
- Scheletro skeleton durante `isLoading`.

**Modifica** `src/pages/Dashboard.tsx`:
- Importare e renderizzare `<DailyBriefing />` subito dopo l'header (riga ~123), prima del check empty-state. Mostrato solo quando `hasBrandSelected` è true e non siamo in puro empty state (dato che tutti i numeri saranno comunque zero, mostrerà la frase "Nessuna emergenza").

---

## File toccati

Nuovi:
- `src/hooks/useNotificationSound.ts`
- `src/hooks/useDocumentTitleBadge.ts`
- `src/components/dashboard/DailyBriefing.tsx`

Modificati:
- `src/components/notifications/NotificationBell.tsx` (toggle suono + play su tipi critici)
- `src/components/layout/MainLayout.tsx` (1 riga: hook title badge)
- `src/pages/Dashboard.tsx` (1 riga: render `<DailyBriefing />`)

Nessuna migration, nessun edge function, nessuna dipendenza npm. Tutta la persistenza preferenza usa la tabella `user_push_preferences` esistente.
