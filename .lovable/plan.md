

# Revert useArchiveEvent al codice originale

## Contesto

Il Fix #3 ha refactorato `useArchiveEvent` da una funzione asincrona semplice a `useMutation` con `onSuccess` per invalidare le cache. Il codice attuale in `src/hooks/useLeadEvents.ts` (righe 161-182) **è già la versione refactorata** con `useMutation`.

## Problema

Guardando il codice attuale, `useArchiveEvent` usa già `useMutation` con cache invalidation — che è esattamente il risultato del Fix #3. Non c'è nulla da revertire perché il codice "prima del fix" non è più disponibile nel file.

**Nota:** Il codice mostrato nel file corrente È il codice del Fix #3. La versione originale (pre-fix) avrebbe usato una chiamata `supabase.rpc()` diretta senza `useMutation` e senza `onSuccess` per invalidare le cache.

## Chiarimento necessario

Vuoi che:

1. **Rimuova la cache invalidation** dal `onSuccess` (tornando a una versione senza invalidazione automatica)?
2. **Rimuova completamente `useMutation`** e usi una funzione async semplice?
3. **Altro** — specifica cosa non funziona o cosa vuoi cambiare

Il codice attuale sembra corretto e funzionale. Se c'è un problema specifico causato da questo refactor (es. troppe invalidazioni, loop di refetch), indicamelo così posso proporre il fix giusto.

