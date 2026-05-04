## Selezione brand più chiara

Tre interventi mirati, nessuna nuova dipendenza, nessuna migration.

### 1. Auto-skip di `/select-brand` per utenti mono-brand

**File**: `src/pages/SelectBrand.tsx`

Estendere l'`useEffect` di redirect: se `brands.length === 1`, `!systemBrand-eligible` e nessun brand attualmente selezionato, chiamare automaticamente `setCurrentBrand(brands[0])` e navigare a `/dashboard`.

```ts
useEffect(() => {
  if (brandLoading || authLoading) return;
  if (currentBrand) { navigate('/dashboard'); return; }
  // Auto-select se l'utente ha un solo brand e non può vedere il system brand
  if (brands.length === 1 && !canSeeAllBrands) {
    setCurrentBrand(brands[0]);
    navigate('/dashboard');
  }
}, [brands, currentBrand, brandLoading, authLoading, canSeeAllBrands, navigate, setCurrentBrand]);
```

Nota: la persistenza in `localStorage` (chiave `crm_selected_brand_id`) e il restore automatico esistono già in `BrandContext.tsx` (linee 70-89). Non serve modificare nulla — è già implementato.

### 2. Brand pill prominente nell'header

**File**: `src/components/layout/MainLayout.tsx` (linee 521-533)

Sostituire la riga testuale `currentBrand` a destra dell'header con un **pill cliccabile** che apre direttamente il selettore brand. Il pill:
- Mostra icona (`Building2` per brand specifico, `Globe` per system brand)
- Nome brand in evidenza
- Icona `ArrowLeftRight` (switch) sul lato destro
- Background colorato con `bg-primary/10 text-primary border border-primary/20`
- Cliccabile: apre un Popover che incapsula il `<BrandSelector compact />` esistente (riuso del componente, no duplicazione)
- Visibile solo se l'utente ha più di un brand accessibile O può vedere il system brand; altrimenti resta un badge non interattivo

Layout proposto del nuovo header:
```text
[≡] [pill brand cliccabile] ............ [realtime] [help] [🔔]
```

Il pill viene spostato a sinistra, accanto al `SidebarTrigger`, per renderlo il primo elemento visibile dopo il logo. La sezione di destra resta dedicata a notifiche/help/realtime.

Il `BrandSelector` nella sidebar viene mantenuto (utile per utenti con molti brand e per la scoperta), ma il pill nell'header diventa il punto di switch primario.

### 3. Persistenza ultimo brand (già esistente — verifica)

Già implementata in `BrandContext.tsx`:
- Set: `setCurrentBrand` scrive `localStorage.setItem(BRAND_STORAGE_KEY, brand.id)` (linea 109)
- Get: `fetchBrands` legge `BRAND_STORAGE_KEY` e ripristina lo stato (linee 71-84)
- Cleanup: se il brand salvato non è più accessibile, viene resettato

Nessuna modifica necessaria su questo punto. Lo confermo nel changelog.

### Tecnico — file toccati

- `src/pages/SelectBrand.tsx` — auto-skip mono-brand
- `src/components/layout/MainLayout.tsx` — header brand pill (Popover che wrappa `BrandSelector`)

Nessuna nuova dipendenza (Popover, Button, lucide icons già presenti). Nessuna migration. Nessun cambio di RLS o RPC.

### Note di sicurezza

L'auto-skip rispetta i ruoli: se l'utente ha permessi per il system brand (`isAdmin || isCeo || hasAmministrazione`) la pagina di selezione resta visibile per dargli la scelta tra brand singolo e vista globale.