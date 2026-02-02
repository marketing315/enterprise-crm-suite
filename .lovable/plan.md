

# Piano M2 - KPI Venditori + Assegnazione Deal (Versione Finale)

## Riepilogo Decisioni Business

| Regola | Scelta |
|--------|--------|
| Definizione vendita | WON + CLOSED (entrambi contano come "chiusura positiva") |
| Visibilità deal | Restrittiva: venditore vede solo deal assegnati |
| Deal archiviati | Contano nei KPI come "chiusi" |

---

## Fase 1: Database Migration

### 1.1 Aggiunta colonna assegnazione

La tabella `deals` ha già `closed_at`. Serve solo aggiungere `assigned_user_id`:

```sql
ALTER TABLE deals 
ADD COLUMN assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Indice per query KPI ottimizzate
CREATE INDEX idx_deals_assigned_kpi 
ON deals(brand_id, assigned_user_id, status, closed_at DESC);

-- Indice parziale per deal aperti
CREATE INDEX idx_deals_assigned_open 
ON deals(brand_id, assigned_user_id) 
WHERE status IN ('open', 'reopened_for_support');
```

### 1.2 RLS Policy per visibilità restrittiva

Aggiungere policy che limita i venditori ai propri deal:

```sql
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view deals in their brands" ON deals;

-- New policy with assignment restriction for venditori
CREATE POLICY "Users can view deals based on role"
ON deals FOR SELECT
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    -- Admin, CEO, Responsabili vedono tutti i deal del brand
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'ceo')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_callcenter')
    -- Venditori vedono solo deal assegnati a loro o non assegnati
    OR (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore')
      AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL)
    )
    -- Operatori callcenter: stesso pattern
    OR (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'operatore_callcenter')
      AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL)
    )
  )
);
```

### 1.3 RPC per KPI Venditori

Funzione SQL che calcola metriche per venditore:

```sql
CREATE OR REPLACE FUNCTION get_salesperson_kpis(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Validate brand access
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Default to last 30 days if no range
  IF p_from IS NULL THEN p_from := now() - interval '30 days'; END IF;
  IF p_to IS NULL THEN p_to := now(); END IF;

  SELECT json_agg(row_to_json(kpi))
  INTO v_result
  FROM (
    SELECT 
      u.id as user_id,
      u.full_name,
      u.email,
      ur.role,
      -- Conteggi deal
      COUNT(*) FILTER (WHERE d.status = 'open' OR d.status = 'reopened_for_support') as deals_open,
      COUNT(*) FILTER (WHERE d.status = 'won' AND d.closed_at >= p_from AND d.closed_at < p_to) as deals_won,
      COUNT(*) FILTER (WHERE d.status = 'lost' AND d.closed_at >= p_from AND d.closed_at < p_to) as deals_lost,
      COUNT(*) FILTER (WHERE d.status = 'closed' AND d.closed_at >= p_from AND d.closed_at < p_to) as deals_closed,
      -- Valore vinto (won + closed)
      COALESCE(SUM(d.value) FILTER (
        WHERE d.status IN ('won', 'closed') 
        AND d.closed_at >= p_from AND d.closed_at < p_to
      ), 0) as total_value_won,
      -- Win rate: (won + closed) / totale chiusure con esito
      CASE 
        WHEN COUNT(*) FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= p_from AND d.closed_at < p_to) = 0 
        THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE d.status IN ('won', 'closed') AND d.closed_at >= p_from AND d.closed_at < p_to)::numeric * 100 
          / COUNT(*) FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= p_from AND d.closed_at < p_to),
          1
        )
      END as win_rate,
      -- Tempo medio chiusura (giorni)
      COALESCE(
        ROUND(
          AVG(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400) 
          FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= p_from AND d.closed_at < p_to),
          1
        ),
        0
      ) as avg_days_to_close,
      -- Ultima attività
      MAX(d.updated_at) as last_activity_at
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id 
      AND ur.brand_id = p_brand_id 
      AND ur.role = 'venditore'
      AND ur.is_active = true
    LEFT JOIN deals d ON d.assigned_user_id = u.id 
      AND d.brand_id = p_brand_id
    GROUP BY u.id, u.full_name, u.email, ur.role
    ORDER BY total_value_won DESC, deals_won DESC
  ) kpi;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
```

---

## Fase 2: Frontend - Hook e Tipi

### 2.1 Nuovo hook `useSalespersonKpis.ts`

```typescript
// src/hooks/useSalespersonKpis.ts
interface SalespersonKpi {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  deals_closed: number;
  total_value_won: number;
  win_rate: number;
  avg_days_to_close: number;
  last_activity_at: string | null;
}

// useQuery per fetch KPI con date range
```

### 2.2 Aggiornamento tipi Deal

Estendere `DealWithContact` con `assigned_user_id` e info venditore assegnato.

---

## Fase 3: Frontend - Nuove Pagine e Componenti

### 3.1 Pagina `/team/salespersons` (o tab in Team)

Componenti:

| Componente | Funzione |
|------------|----------|
| `SalespersonKpiCards` | 4 card aggregate: Totale Venditori, Valore Totale, Win Rate Medio, Deal Aperti |
| `SalespersonTable` | Tabella con colonne: Nome, Deal Open, Won, Lost, Valore Vinto, Win Rate, Ultimo Aggiornamento |
| `SalespersonDetailSheet` | Drawer con dettaglio: lista deal assegnati, storico performance |

### 3.2 Struttura UI

```text
+-----------------------------------------------+
| 📊 Performance Venditori    [Periodo: 30gg ▼] |
+-----------------------------------------------+
| [Card] Venditori  [Card] Valore   [Card] Win  |
|    5 attivi       €125.000        68%         |
+-----------------------------------------------+
| Tabella Venditori                             |
| Nome      | Open | Won | Lost | Valore | Win% |
|-----------|------|-----|------|--------|------|
| Mario R.  |  12  |  8  |  3   | €45.000| 73%  |
| Giulia S. |   8  |  5  |  4   | €32.000| 56%  |
| ...       |      |     |      |        |      |
+-----------------------------------------------+
```

### 3.3 Mobile UX

- Tabella trasformata in card list verticale
- Ogni card mostra: Nome + KPI principali (valore, win rate)
- Tap → apre detail sheet
- Filtri periodo in header sticky

---

## Fase 4: Integrazione Pipeline

### 4.1 Modifica `DealDetailSheet.tsx`

Aggiungere sezione assegnazione:

```text
+---------------------------+
| Assegnato a               |
| [Dropdown venditori    ▼] |
| • Mario Rossi             |
| • Giulia Sala             |
| • Non assegnato           |
+---------------------------+
```

### 4.2 Modifica `KanbanCard.tsx`

Badge visivo con iniziali venditore assegnato:

```text
+-------------------+
| Deal ABC Corp     |
| €15.000           |
| [MR] ← badge      |
+-------------------+
```

### 4.3 Mutation assegnazione

Aggiungere `useAssignDealToUser` mutation in `usePipeline.ts`.

---

## Fase 5: Navigazione e Permessi UI

### 5.1 Voce menu (MainLayout)

Aggiungere sotto "Team":
- "Performance Venditori" (visibile solo a: admin, ceo, responsabile_venditori)

### 5.2 Condizioni visibilità

```typescript
const canViewSalespersonKpis = userRole && 
  ['admin', 'ceo', 'responsabile_venditori'].includes(userRole);
```

---

## Fase 6: Test E2E

| File | Scenario |
|------|----------|
| `salesperson-assignment.e2e.spec.ts` | Assegna deal a venditore → visibile in DB e UI |
| | Venditore vede solo propri deal (policy restrittiva) |
| | Manager vede tutti i deal |
| `salesperson-kpis.e2e.spec.ts` | KPI aggiornati dopo chiusura deal |
| | Win rate calcolato correttamente |
| | Filtro periodo funziona |

---

## Riepilogo File

### Nuovi file
- `src/pages/SalespersonKpi.tsx`
- `src/components/team/SalespersonTable.tsx`
- `src/components/team/SalespersonKpiCards.tsx`
- `src/components/team/SalespersonDetailSheet.tsx`
- `src/components/team/SalespersonAssignmentSelect.tsx`
- `src/hooks/useSalespersonKpis.ts`
- `e2e/salesperson-kpis.e2e.spec.ts`

### File da modificare
- `supabase/migrations/[new].sql` - Schema + RPC + RLS
- `src/App.tsx` - Route `/team/salespersons`
- `src/components/layout/MainLayout.tsx` - Voce menu
- `src/components/pipeline/DealDetailSheet.tsx` - Dropdown assegnazione
- `src/components/pipeline/KanbanCard.tsx` - Badge venditore
- `src/hooks/usePipeline.ts` - Mutation assegnazione + tipo esteso
- `src/types/database.ts` - Tipo Deal aggiornato

---

## Note Implementative

### Formula Win Rate
```
win_rate = (won + closed) / (won + lost + closed) × 100
```

### Calcolo Tempo Chiusura
```
avg_days = AVG(closed_at - created_at) in giorni
```
Solo per deal con `closed_at` valorizzato.

### Policy Visibilità
I venditori vedono:
- Deal assegnati a loro
- Deal non ancora assegnati (per permettere auto-assegnazione)

Manager/Admin vedono tutti i deal del brand.

---

## Effort Stimato

| Fase | Tempo |
|------|-------|
| Migration + RPC + RLS | ~45 min |
| Hook + Tipi | ~20 min |
| UI Dashboard | ~1.5 ore |
| Integrazione Pipeline | ~45 min |
| Mobile responsive | ~30 min |
| Test E2E | ~30 min |
| **Totale** | **~4 ore** |

