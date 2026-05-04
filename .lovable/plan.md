## Obiettivo

Trasformare `PageHelpButton` da popover statico a **drawer di aiuto contestuale** che include: descrizione, suggerimenti, **3 azioni rapide** della pagina, **link alla documentazione** giusta in `docs/`. Aggiungere un helper `<FieldHelp>` riutilizzabile per i tooltip sui campi non ovvi.

Niente video/GIF reali (non abbiamo asset hostati): predispongo lo slot `videoUrl?` per il futuro, mostrando per ora una placeholder visiva pulita.

---

## 1. Drawer di aiuto + docs links

**Modifica** `src/components/layout/PageHelpButton.tsx`:
- Sostituire `Popover` con `Sheet` (drawer laterale destra, larghezza ~420px).
- Estendere `PageHelp` con:
  ```ts
  interface PageHelp {
    title: string;
    description: string;
    tips?: string[];
    quickActions?: { label: string; steps: string[] }[]; // top 3
    docsPath?: string;   // es. "inbound-webhooks.md"
    videoUrl?: string;   // riservato futuro
  }
  ```
- Layout drawer:
  - Header: titolo + descrizione.
  - Sezione "Cosa puoi fare" con 3 quick actions (accordion o cards numerate).
  - Sezione "Suggerimenti" (lista esistente).
  - Footer: link "Apri documentazione completa →" che apre `https://github.com/<repo>/blob/main/docs/<docsPath>` in nuova tab. Per evitare hard-coding del repo, usare `staticFile`-style fallback: se `docsPath` esiste, link a `/docs/${docsPath}` (servito futuro) + se nessun docs disponibile, mostrare solo nota "Documentazione in arrivo".

**Mappatura iniziale `docsPath`** (solo route con doc esistente):
- `/events`, `/admin/dlq`, `/admin/webhooks` → `inbound-webhooks.md`
- `/tickets`, `/admin/ticket-trend` → `slo-sla.md`
- `/marketing*` → `meta-lead-ads.md`
- `/settings` → `voispeed-integration.md`
- `/admin/ai`, `/admin/ai-metrics` → `mcp-server-runbook.md`
- altre rotte: nessun docsPath.

**Quick actions iniziali** (3 per pagina chiave): Contatti, Pipeline, Tickets, Eventi, Appuntamenti, DLQ, Webhooks. Le altre route mantengono solo `tips`.

## 2. Helper `<FieldHelp>` per tooltip

**Creare** `src/components/ui/FieldHelp.tsx`:
```tsx
// piccolo wrapper su Tooltip + icona Info, accessibile (aria-label).
// Uso: <Label>Priorità AI <FieldHelp text="Calcolata su urgenza, valore deal, SLA residuo." /></Label>
```
- Usa `TooltipProvider`/`Tooltip`/`TooltipContent` esistenti.
- Icona `Info` 14px, `text-muted-foreground`, `aria-label="Aiuto: {text}"`.
- `delayDuration={150}`.

## 3. Applicare `<FieldHelp>` ai campi citati

Sweep mirato (niente refactor massivo):
- **"Priorità AI"** / "AI Priority": cercare in `src/components/tickets/*` e `src/components/pipeline/*` e wrappare la label.
- **"SLA breach"** badge: in `src/components/tickets/TicketsTable.tsx`, `TicketCardMobile.tsx`, `TicketDetailSheet.tsx`.
- **"DLQ reason"** / "Motivo DLQ": in `src/pages/admin/DLQ*.tsx` o componenti dlq.

Per ognuno, una sola riga aggiunta accanto alla label/header. Test: `rg -n "Priorità AI|SLA breach|DLQ" src/` per individuare.

---

## File modificati

- `src/components/layout/PageHelpButton.tsx` (esteso a drawer + docs + actions)
- `src/components/ui/FieldHelp.tsx` (nuovo, ~25 righe)
- 2-4 file in `src/components/tickets/` e `src/pages/admin/` per applicare `<FieldHelp>` sui 3 campi citati

Nessuna nuova dipendenza, nessuna migration. Sheet, Tooltip, e Popover sono già disponibili in `src/components/ui/`.

---

## Note pragmatiche

- I video/GIF non sono inclusi: lascio `videoUrl?` come campo opzionale e non lo renderizzo finché non viene popolato. Aggiungerli sarà additivo.
- I docs sono in `docs/` (markdown) ma non sono attualmente servite dal frontend. Il link punterà a una rotta `/docs/<file>` come placeholder; se non vuoi una rotta dedicata adesso, posso linkare direttamente al GitHub o nascondere il link. Default proposto: link interno `/docs/<file>` con apertura futura — me lo confermi nella prossima iterazione.
