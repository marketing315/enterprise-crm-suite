# Sidebar cognitive load reduction

Refactor di `src/components/layout/MainLayout.tsx` (unico file toccato). Nessuna route nuova, solo riorganizzazione + collapsible + filtro audience.

## 1. Nuova tassonomia di gruppi

Sostituisco `baseMenuItems` + `adminMenuItems` con `NAV_SECTIONS`, una struttura tipata che mappa ogni voce al suo gruppo, ruolo richiesto e audience.

```text
Quotidiano        (sempre aperto, audience: daily)
  Dashboard, Contatti, Eventi, Pipeline, Appuntamenti, Ticket, Chat

Vendite & Clienti (sempre aperto, audience: daily)
  Vendite, Prodotti (admin/ceo), Azienda

Marketing         (collapsible, defaultOpen=false salvo route attiva)
  voci attuali invariate, gating useHasMarketingAccess

Insight           (collapsible, defaultOpen=false salvo route attiva, audience: weekly)
  Analytics, Dashboard CEO (admin/ceo), KPI Venditori, KPI Call Center,
  Trend Ticket, AI Metrics

Configurazione    (sempre aperto per admin, audience: daily)
  Impostazioni, Team, Gestione AI

Sistema           (admin/ceo, collapsible, defaultOpen=false, audience: rare)
  Webhook Monitor, DLQ, CAPI Monitor, SLO Board, Security Review,
  Audit & Compliance, Quick Backup
```

## 2. Audience filter

Ogni voce riceve `audience: 'daily' | 'weekly' | 'rare'`.

- Stato locale `showAdvanced` (persistito in `userScopedStorage` con chiave `sidebar.showAdvanced`, default `false`).
- Quando `showAdvanced=false`: filtro via solo le voci `weekly` e `rare`. Le sezioni `Insight` e `Sistema` diventano completamente nascoste (non solo collassate) finché l'utente non clicca il toggle, **salvo** se la route corrente cade dentro: in quel caso forziamo `showAdvanced=true` per non rompere la navigazione.
- In fondo alla sidebar (sopra al footer utente) un `SidebarMenuButton` ghost: "Mostra strumenti avanzati" / "Nascondi strumenti avanzati" con icona `Sliders`. Niente conferma, toggle istantaneo.

## 3. Collapsible sections

Estraggo un componente locale `<NavSection>` riusabile basato su `Collapsible` + `SidebarGroup` (stesso pattern già usato per Marketing nel file attuale). Props:

- `label`, `items`, `collapsible: boolean`, `defaultOpen: boolean`
- `defaultOpen` calcolato come `items.some(i => location.pathname.startsWith(i.path))`
- `Quotidiano`, `Vendite & Clienti`, `Configurazione`: `collapsible={false}` (resta sempre aperto, label visibile come oggi)
- `Marketing`, `Insight`, `Sistema`: `collapsible={true}`, `defaultOpen` come sopra

Le sezioni collassate mostrano un chevron rotante (riuso del pattern Marketing già presente alle righe 246-276).

## 4. Role gating raffinato

`requiresRole` resta come oggi sulle singole voci. In più, intere sezioni vengono nascoste se vuote dopo il filtro:

- `Sistema`: visibile solo se `isAdmin || isCeo`
- `Insight`: visibile per tutti i ruoli che hanno almeno una voce permessa (admin/ceo/responsabile_*)
- `Configurazione → Gestione AI / Team`: rimangono admin-only come oggi

## 5. Badge ticket

Resta sulla voce `Ticket` (sezione Quotidiano), stessa logica dei contatori `ticketActivityCount` + `slaBreachCount` invariata.

## 6. Memory

Aggiungo `mem://style/sidebar-information-architecture.md` con la tassonomia delle 6 sezioni e la regola "nuove voci admin → audience `rare` di default, vivono in `Sistema`". Linko nell'index.

## File modificati

- `src/components/layout/MainLayout.tsx` — refactor (no API change verso il resto dell'app)
- `mem://style/sidebar-information-architecture.md` — nuovo
- `mem://index.md` — riga aggiunta

## Cosa NON faccio

- Nessuna route rimossa o spostata: tutti i path attuali restano raggiungibili.
- Nessuna modifica a `RoleGuard` o RLS.
- Nessuna modifica responsive: l'offcanvas mobile eredita automaticamente la nuova struttura.
- Nessun A/B test o feature flag: il rollout è diretto.
