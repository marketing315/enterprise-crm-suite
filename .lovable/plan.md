## Problema

Nello screenshot iOS PWA si vede che il contenuto dell'header (sidebar trigger, pill "Azienda Interaziendale", ricerca, icone) è ancora sovrapposto alla status bar di iOS (orario, 5G, batteria).

La fix precedente aveva aggiunto `pt-[env(safe-area-inset-top)]` direttamente sull'`<header>` con `flex items-center min-h-14`. Il padding cresce la box, ma `items-center` ricentra i figli sull'altezza totale (padding incluso) — quindi gli elementi rimangono ancora dentro la zona della status bar.

## Soluzione

Refactor minimo dell'header in `src/components/layout/MainLayout.tsx` (riga 591):

- Spostare `pt-[env(safe-area-inset-top)]` su un wrapper esterno che NON ha flex/items-center.
- Wrappare la riga corrente con i controlli in un `<div className="flex min-h-14 items-center gap-2 md:gap-4 px-3 md:px-6">` interno.
- Lasciare su `<header>` solo: `border-b bg-background shrink-0 sticky top-0 z-30 pt-[env(safe-area-inset-top)]`.

Risultato: la status bar iOS occupa la zona di padding (trasparente, dietro vede `bg-background`), e la barra dei comandi resta sotto a 56px piena, perfettamente leggibile.

### Verifica

Dopo l'edit:
1. Reload del preview / PWA installata.
2. Controllare su screenshot mobile che il pill brand, il search e l'avatar siano sotto la Dynamic Island / status bar.
3. Verificare desktop (env() = 0) che l'header resti identico a prima.

Nessuna modifica a logica, dati o altri componenti.
