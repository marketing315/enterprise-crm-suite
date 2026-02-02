# Marketing Module - QA Checklist

Questa è la procedura operativa per il QA del modulo Marketing.

---

## 1. Matrice Permessi Marketing (DEFINITIVA)

| Ruolo | Vede Menu | Dashboard | Campagne | Costi | Report | Note |
|-------|-----------|-----------|----------|-------|--------|------|
| **Admin** | ✅ | ✅ lettura | ✅ CRUD | ✅ CRUD | ✅ + export | Accesso completo |
| **CEO** | ✅ | ✅ lettura | ✅ CRUD | ✅ CRUD | ✅ + export | Accesso completo |
| **Amministrazione** | ✅ | ✅ lettura | ❌ solo lettura | ✅ CRUD | ✅ + export | Può solo inserire costi |
| **Responsabile Venditori** | ✅ | ✅ solo KPI | ❌ | ❌ | ❌ | Solo dashboard aggregata |
| **Responsabile Callcenter** | ✅ | ✅ solo KPI | ❌ | ❌ | ❌ | Solo dashboard aggregata |
| **Venditore** | ❌ | - | - | - | - | Nessun accesso |
| **Operatore Callcenter** | ❌ | - | - | - | - | Nessun accesso |

### Legenda
- **CRUD**: Create, Read, Update, Delete
- **Lettura**: può vedere ma non modificare
- **Solo KPI**: vede solo le card con metriche aggregate (Ricavi, Costi, ROI, ecc.)

---

## 2. Preparazione Utenti (RBAC)

### Creare 6 utenti "puliti" per un brand test (es. "Excell"):

| # | Email | Ruolo | Brand |
|---|-------|-------|-------|
| 1 | `admin.test@example.com` | admin | Globale o Excell |
| 2 | `ceo.test@example.com` | ceo | Globale o Excell |
| 3 | `amm.test@example.com` | amministrazione | Excell |
| 4 | `resp.venditori@example.com` | responsabile_venditori | Excell |
| 5 | `resp.callcenter@example.com` | responsabile_callcenter | Excell |
| 6 | `venditore.test@example.com` | venditore | Excell |

### Verifiche RBAC da eseguire:

- [ ] Admin/CEO: vede menu Marketing con sottomenu completo
- [ ] Admin/CEO: può creare/modificare/eliminare campagne e canali
- [ ] Admin/CEO: può creare/modificare/eliminare costi
- [ ] Amministrazione: vede menu Marketing
- [ ] Amministrazione: NON vede pulsante "Nuova campagna" 
- [ ] Amministrazione: NON può editare campagne esistenti
- [ ] Amministrazione: PUÒ inserire/modificare/eliminare costi
- [ ] Responsabili: vedono solo Dashboard Marketing (no sottomenu)
- [ ] Responsabili: NON vedono link a Campagne/Costi/Report
- [ ] Venditore/Operatore: menu Marketing NON compare nella sidebar

---

## 3. Dataset Minimo (per KPI sensati)

### ⚠️ IMPORTANTE: tutti i dati devono essere nel MESE CORRENTE!

#### 3.1 Canali (2 record)
```sql
INSERT INTO marketing_channels (brand_id, name, type, is_active)
VALUES 
  ('UUID_BRAND', 'Meta Ads', 'social', true),
  ('UUID_BRAND', 'Google Ads', 'search', true);
```

#### 3.2 Campagne (2 record, una per canale)
```sql
INSERT INTO marketing_campaigns (brand_id, channel_id, name, status, external_id)
VALUES 
  ('UUID_BRAND', 'UUID_META_CHANNEL', 'Black Friday Meta', 'active', 'meta_bf_2024'),
  ('UUID_BRAND', 'UUID_GOOGLE_CHANNEL', 'Lead Gen Google', 'active', 'google_lg_2024');
```

#### 3.3 Costi Marketing (4 righe distribuite)
```sql
INSERT INTO marketing_costs (brand_id, campaign_id, cost_date, amount, description)
VALUES 
  ('UUID_BRAND', 'UUID_META_CAMPAIGN', CURRENT_DATE - 7, 1500, 'Settimana 1'),
  ('UUID_BRAND', 'UUID_META_CAMPAIGN', CURRENT_DATE - 1, 1800, 'Settimana 2'),
  ('UUID_BRAND', 'UUID_GOOGLE_CAMPAIGN', CURRENT_DATE - 5, 1200, 'CPC'),
  ('UUID_BRAND', 'UUID_GOOGLE_CAMPAIGN', CURRENT_DATE - 2, 1000, 'Display');
-- Totale atteso: €5500
```

#### 3.4 Deal con campagne (3 record)
```sql
-- 1. Deal WON con valore (DEVE avere closed_at valorizzato!)
INSERT INTO deals (brand_id, contact_id, marketing_campaign_id, status, value, closed_at)
VALUES ('UUID_BRAND', 'UUID_CONTACT1', 'UUID_META_CAMPAIGN', 'won', 8500, NOW());

-- 2. Deal OPEN (in lavorazione)
INSERT INTO deals (brand_id, contact_id, marketing_campaign_id, status, value)
VALUES ('UUID_BRAND', 'UUID_CONTACT2', 'UUID_GOOGLE_CAMPAIGN', 'open', 5000);

-- 3. Deal LOST
INSERT INTO deals (brand_id, contact_id, marketing_campaign_id, status, value, closed_at)
VALUES ('UUID_BRAND', 'UUID_CONTACT3', 'UUID_META_CAMPAIGN', 'lost', 3000, NOW());
```

#### Valori attesi:
| KPI | Valore |
|-----|--------|
| Costi totali | €5500 |
| Ricavi (won) | €8500 |
| Deal won | 1 |
| ROI | (8500-5500)/5500 × 100 = **54.5%** |

---

## 4. Test Funzionali (per pagina)

### 4.1 `/marketing` (Dashboard)

| Test | Atteso | ✓/✗ |
|------|--------|-----|
| KPI cards caricano senza errori | Nessun spinner infinito | |
| Costi = somma costi nel periodo | €5500 | |
| Ricavi = somma value dei deal won | €8500 | |
| ROI calcolato correttamente | 54.5% | |
| Se leads=0 → CPL mostra "—" | Non mostra €0 o -100% | |
| Se deals_won=0 → CAC mostra "—" | Non mostra €0 | |
| Se costi=0 → ROI mostra "—" | Non mostra -100% | |
| Cambio mese funziona | KPI si aggiornano | |
| Tabella canali mostra dati coerenti | ROI per canale corretto | |

### 4.2 `/marketing/campagne`

| Test | Atteso | ✓/✗ |
|------|--------|-----|
| Lista campagne carica | 2 campagne visibili | |
| **Admin/CEO**: pulsante "Nuova campagna" visibile | ✅ | |
| **Admin/CEO**: può editare campagna | Form si apre | |
| **Admin/CEO**: può cambiare status | Status si aggiorna | |
| **Admin/CEO**: può eliminare campagna | Conferma + rimozione | |
| **Amministrazione**: "Nuova campagna" NON visibile | ❌ nascosto | |
| **Amministrazione**: click su riga NON apre edit | Read-only | |
| KPI per campagna coerenti | Mese corrente | |
| Filtro per canale funziona | Solo campagne del canale | |

### 4.3 `/marketing/costi`

| Test | Atteso | ✓/✗ |
|------|--------|-----|
| Lista costi carica | 4 righe visibili | |
| **Admin/CEO/Amm**: pulsante "Nuovo costo" visibile | ✅ | |
| **Admin/CEO/Amm**: può modificare costo | Form si apre | |
| **Admin/CEO/Amm**: può eliminare costo | Conferma + rimozione | |
| **Responsabili**: pagina NON accessibile | Redirect o 403 | |
| Filtro date funziona | Mostra solo costi nel range | |
| Totale costi aggiornato dopo inserimento | Somma corretta | |

### 4.4 `/marketing/report`

| Test | Atteso | ✓/✗ |
|------|--------|-----|
| Grafico trend 6 mesi carica | Non è "Coming soon" | |
| Trend mostra dati REALI (non random) | Coerente con DB | |
| Tabella campagne coerente con dashboard | Stessi valori | |
| Export CSV funziona | File scaricato | |
| CSV contiene dati corretti | CPL/CAC/ROI sensati | |
| CPL/CAC nulli → "—" nel CSV | Non "0" o "NaN" | |

---

## 5. Test Integrazione Pipeline

| Test | Atteso | ✓/✗ |
|------|--------|-----|
| Aprire un deal con `marketing_campaign_id` | Deal creato | |
| Badge campagna visibile su KanbanCard | Nome campagna | |
| Chiudere deal come "won" | `closed_at` si valorizza | |
| Ricaricare dashboard marketing | Ricavi aumentati | |
| Deal senza campagna | Badge campagna assente | |

---

## 6. Checklist Finale Pre-Release

- [ ] Fix #1: Trigger `set_deal_closed_at` attivo
- [ ] Fix #2: RPC `get_marketing_monthly_trend` implementata
- [ ] Fix #3: Divisione per zero gestita (NULLIF)
- [ ] Fix #4: Sottomenu Marketing nella sidebar
- [ ] RLS: `has_marketing_access()` funziona per tutti i ruoli
- [ ] RLS: `amministrazione` può CRUD su `marketing_costs`
- [ ] RLS: `amministrazione` NON può UPDATE `marketing_campaigns`
- [ ] UI: Responsabili vedono SOLO dashboard (no link sottopagine)
- [ ] UI: Venditore/Operatore NON vedono menu Marketing

---

## 7. Note Aggiuntive

### RLS Functions coinvolte:
- `has_marketing_access(user_id, brand_id)` → SELECT su tabelle marketing
- `useCanEditCampaigns()` → Admin/CEO only (frontend)
- `useCanEditMarketingCosts()` → Admin/CEO/Amministrazione (frontend)

### Query di verifica rapida:
```sql
-- Verifica costi mese corrente
SELECT SUM(amount) FROM marketing_costs 
WHERE cost_date >= date_trunc('month', CURRENT_DATE)
  AND cost_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

-- Verifica ricavi mese corrente
SELECT SUM(value) FROM deals 
WHERE status = 'won' 
  AND closed_at >= date_trunc('month', CURRENT_DATE)
  AND marketing_campaign_id IS NOT NULL;
```
