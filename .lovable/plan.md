

# Piano Aggiornato: CEO Dashboard Completa
## Con le 3 modifiche obbligatorie integrate

---

## Modifica 1: Filtro Appuntamenti per Status

La RPC `get_ceo_operational_kpis` contera' gli appuntamenti solo con status validi:

```text
WHERE status IN ('scheduled', 'confirmed', 'visited')
```

Esclusi: `cancelled`, `rescheduled`, `no_show`.

Questo allineamento usa l'enum `AppointmentStatus` gia' definito in `src/types/database.ts`.

---

## Modifica 2: System Brand / Vista Globale con `p_brand_ids`

La RPC accettera' due parametri brand (pattern gia' usato nel funnel):

- `p_brand_id UUID` - per singolo brand
- `p_brand_ids UUID[] DEFAULT NULL` - per aggregazione globale

Logica interna:

```text
IF p_brand_ids IS NOT NULL THEN
  -- Vista globale: filtra su array di brand
  -- Validazione: check che brand_ids siano accessibili all'utente
  v_brand_filter = brand_id = ANY(p_brand_ids)
ELSE
  v_brand_filter = brand_id = p_brand_id
END IF
```

L'hook `useCeoOperationalKpis` passera' `allBrandIds` quando `isAllBrandsSelected`, esattamente come fa `useCeoDashboard` con `COMPANY_BRAND_ID` ma usando l'array.

---

## Modifica 3: Permessi CRUD Costi/Budget espliciti

Il CRUD inline dalla dashboard usa gli hook esistenti (`useCreateExpense`, `useDeleteExpense`, `useCreateBudget`, ecc.) che operano tramite RLS sulle tabelle `expenses` e `budgets`.

**Regola esplicita**: Admin + CEO + Amministrazione possono tutti modificare costi/budget (come gia' implementato da `useHasFinanceAccess`). Non si aggiungono restrizioni ulteriori a UI o RPC. Se in futuro si vuole limitare solo ad Admin/CEO, si interverra' su `useHasFinanceAccess` e sulle RLS policies.

In UI, i pulsanti CRUD (aggiungi, modifica, elimina) saranno visibili solo se `useHasFinanceAccess()` ritorna `true`.

---

## Riepilogo Componenti e File

| Azione | File |
|--------|------|
| Crea | Migrazione SQL: `get_ceo_operational_kpis(p_brand_id, p_brand_ids[], p_from, p_to)` |
| Crea | `src/hooks/useCeoOperationalKpis.ts` |
| Crea | `src/components/ceo/CeoPeriodSelector.tsx` |
| Crea | `src/components/ceo/CeoOperationalCards.tsx` |
| Crea | `src/components/ceo/CeoPipelineOverview.tsx` |
| Crea | `src/components/ceo/CeoExpensesPanel.tsx` |
| Crea | `src/components/ceo/CeoBudgetPanel.tsx` |
| Modifica | `src/pages/CeoDashboard.tsx` |
| Modifica | `src/pages/dashboard/CeoDashboardView.tsx` |
| Modifica | `src/components/ceo/CeoKpiCards.tsx` |

---

## Dettaglio Tecnico: RPC `get_ceo_operational_kpis`

```text
PARAMETRI:
  p_brand_id   UUID
  p_brand_ids  UUID[] DEFAULT NULL
  p_from       DATE
  p_to         DATE

RETURNS JSON:
  total_contacts        -- COUNT(*) contacts nel/i brand
  new_contacts_period   -- contacts creati tra p_from e p_to
  open_tickets          -- tickets con status IN ('open','in_progress','reopened_for_support')
  tickets_created       -- tickets creati nel periodo
  appointments_period   -- appointments con status IN ('scheduled','confirmed','visited')
                           AND scheduled_at BETWEEN p_from AND p_to
  deals_by_stage        -- JSON array [{stage_name, stage_order, count, total_value}]
                           per deal con status='open'
  total_open_deals      -- SUM dei deal aperti
  won_deals_period      -- deal con status='won' AND closed_at nel periodo
  won_deals_revenue     -- SUM(value) dei deal won

BRAND FILTER:
  IF p_brand_ids IS NOT NULL THEN
    WHERE brand_id = ANY(p_brand_ids)
  ELSE
    WHERE brand_id = p_brand_id
  END IF
```

---

## Selettore Periodo

Il componente `CeoPeriodSelector` espone `{ from, to, presetLabel }` e supporta:

- Preset: 1 Anno, 6 Mesi, 3 Mesi, 1 Mese, 7 Giorni
- Custom: due DatePicker (Da / A)
- Default iniziale: 1 Mese (mese corrente)

---

## Layout Dashboard Finale

```text
+-----------------------------------------------------+
| Header + CeoPeriodSelector                           |
|  [1A] [6M] [3M] [1M] [7G] [Da...] [A...]            |
+-----------------------------------------------------+
| TaxDisclaimer                                        |
+-----------------------------------------------------+
| CeoOperationalCards (4 cards)                        |
|  Contatti | Ticket | Appuntamenti | Deal Aperti      |
|  [->]       [->]      [->]          [->]             |
+-----------------------------------------------------+
| CeoKpiCards (finanziari esistenti + link rapidi)     |
|  Fatturato [->] | Costi [->] | Utile | Budget [->]  |
+-----------------------------------------------------+
| CeoPipelineOverview                                  |
|  Barre orizzontali per fase + conteggi + valori      |
|  [Vai alla Pipeline ->]                              |
+-----------------------------------------------------+
| Grid 2 colonne                                       |
| CeoExpensesPanel          | CeoBudgetPanel           |
| Lista + [+Aggiungi]       | Lista + [+Aggiungi]      |
| [Modifica] [Elimina]      | [Modifica] [Elimina]     |
| [Vedi tutti ->]           | [Gestisci budget ->]     |
+-----------------------------------------------------+
| CeoCostBreakdown (grafico esistente)                 |
+-----------------------------------------------------+
| BudgetBaselineCard (esistente)                       |
+-----------------------------------------------------+
| CeoAlertsPanel (esistente)                           |
+-----------------------------------------------------+
```

Ogni card operativa ha un pulsante icona per navigare alla pagina di dettaglio (`/contacts`, `/tickets`, `/appointments`, `/pipeline`, `/azienda/costi`, `/azienda/budget`).

