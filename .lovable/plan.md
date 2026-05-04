## Obiettivo

Migliorare l'accessibilità (a11y) con interventi globali ad alto leverage, evitando di toccare 50+ file. Focus su:

1. Reduced motion globale via CSS (copre tutte le animazioni esistenti).
2. Touch target minimi 44×44px su mobile per tutti i bottoni icon-only.
3. Contrasto: rinforzare il token `--muted-foreground` per garantire ≥ 4.5:1.
4. `aria-label` mirati sui bottoni icon-only delle aree più visibili (sidebar, header, NotificationBell, mobile cards).
5. Focus-visible ring più evidente su `SidebarMenuButton` e voci Collapsible.

Niente refactor strutturali, niente nuove dipendenze, niente migration.

---

## 1. Reduced motion globale

**Modifica** `src/index.css`: aggiungere alla fine
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Copre Collapsible, Sidebar, fade-in, hover-scale, e ogni altra animazione tailwind/Radix esistente.

## 2. Touch target 44×44 su mobile

**Modifica** `src/index.css`: aggiungere
```css
@media (max-width: 768px) and (pointer: coarse) {
  button[data-size="icon"],
  .h-7.w-7,
  .h-8.w-8,
  [role="button"][aria-label]:not([data-touch-ok]) {
    min-width: 44px;
    min-height: 44px;
  }
}
```
Approccio non invasivo: alza il min-size solo su touch mobile, lascia il padding interno invariato (l'icona resta visivamente piccola, ma l'area cliccabile è ≥44×44).

## 3. Contrasto su `--muted-foreground`

**Verifica** `src/index.css`: leggere i valori HSL attuali di `--muted-foreground` in `:root` e `.dark`. Se la luminosità in light mode è > 60% (testo grigio chiaro su sfondo bianco — sotto 4.5:1), portarla a circa 38–42%. In dark mode garantire L ≥ 64%.

Modifica solo i due token `--muted-foreground`, niente altro. Tutti i `text-muted-foreground` nel codice ne beneficiano automaticamente.

## 4. Aria-label mirati (sweep selettivo)

Aggiungere/rinforzare `aria-label` su:
- **`SidebarTrigger`** (`src/components/ui/sidebar.tsx`): cambiare `<span class="sr-only">` in `aria-label="Apri o chiudi la sidebar"` (in italiano + esplicito).
- **`NotificationBell`** già ha `aria-label="Notifiche"` ✓ — verificato.
- **`MainLayout`** header (Cerca, Menu utente, Cambia brand) — già presenti ✓.
- **Card mobile** `ContactCardMobile.tsx` e `TicketCardMobile.tsx`: aggiungere `aria-label` alle icone `MoreVertical`/`Phone` se mancanti.
- **`PageHelpButton`** e simili: sweep solo su `src/components/layout/*`.

Sweep limitato ai componenti di layout/global navigation. Le pagine admin/settings restano per un futuro audit.

## 5. Focus-visible su sidebar e Collapsible

**Modifica** `src/components/ui/sidebar.tsx` (className di `SidebarMenuButton`, riga ~415): la stringa esistente ha già `focus-visible:ring-2`. Aggiungere `focus-visible:ring-offset-2 focus-visible:ring-primary` per renderlo più visibile su sfondo chiaro.

Verificare che le voci Collapsible usate in `MainLayout.tsx` (Insight/Sistema) abbiano `<CollapsibleTrigger>` come `<button>` nativo (Radix lo è già) — se viene wrappato custom, assicurarsi che il focus arrivi al trigger e non al contenuto interno.

---

## File toccati

Modificati:
- `src/index.css` (reduced motion + touch target + token contrasto)
- `src/components/ui/sidebar.tsx` (aria-label SidebarTrigger + focus ring)
- `src/components/contacts/ContactCardMobile.tsx` (aria-label icone)
- `src/components/tickets/TicketCardMobile.tsx` (aria-label icone)

Nessun nuovo file, nessuna dipendenza npm, nessuna migration. Audit completo con axe-core/Lighthouse resta un'attività manuale post-deploy.
