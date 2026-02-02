

# Piano: Creazione Documentazione QA End-to-End Completa

Creeremo un documento completo e operativo (`docs/platform-qa-checklist.md`) con tutte le istruzioni per testare la piattaforma CRM end-to-end.

---

## 1. Struttura del Documento

Il documento conterrà le seguenti sezioni:

```text
docs/platform-qa-checklist.md
├── 0. Obiettivo e Regole
├── 1. Setup Ambiente
│   ├── 1.1 Brand di Test (UUID reali)
│   └── 1.2 Prerequisiti tecnici
├── 2. Utenti di Test (10 utenti)
│   ├── 2.1 Tabella utenti con ruoli
│   ├── 2.2 Script creazione utenti (SQL + Edge Function)
│   └── 2.3 Validazioni post-creazione
├── 3. Dataset Minimo (Seed SQL)
│   ├── 3.1 Pipeline (contatti + deal)
│   ├── 3.2 Marketing (canali + campagne + costi)
│   ├── 3.3 Azienda (budget + spese)
│   └── 3.4 Tickets
├── 4. Matrice Permessi Completa
│   ├── 4.1 Navigazione Sidebar
│   ├── 4.2 Pipeline
│   ├── 4.3 Marketing
│   ├── 4.4 Team
│   ├── 4.5 Azienda
│   └── 4.6 Tickets
├── 5. Checklist Test per Modulo
│   ├── 5.1 Autenticazione
│   ├── 5.2 Brand Selector
│   ├── 5.3 Pipeline (30+ test)
│   ├── 5.4 Marketing (link a marketing-qa-checklist.md)
│   ├── 5.5 Team / Gestione Utenti
│   ├── 5.6 KPI Venditori
│   ├── 5.7 Azienda / Amministrazione
│   ├── 5.8 Tickets
│   └── 5.9 Chat/AI/Notifiche
├── 6. Test Tecnici
│   ├── 6.1 Console Errors
│   ├── 6.2 Network Sanity
│   ├── 6.3 RLS Attack Test
│   └── 6.4 Performance Base
├── 7. Smoke Test (10 critici)
├── 8. Regression Test (10 post-fix)
├── 9. Template Bug Report
└── 10. Deliverable QA
```

---

## 2. Contenuto Chiave

### 2.1 Brand di Test (con UUID reali dal DB)

| Brand | UUID | Scopo |
|-------|------|-------|
| Azienda Intera | `00000000-0000-0000-0000-000000000000` | Aggregazioni globali |
| Excell | `2dc052de-26b5-48ef-8dee-917ea591a681` | Test vendite |
| MyMed | `4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5` | Test call center |

### 2.2 Ruoli Enum Reali (verificati nel DB)

```text
admin, ceo, amministrazione, responsabile_venditori, 
responsabile_callcenter, venditore, operatore_callcenter, 
callcenter, sales
```

### 2.3 Utenti di Test (10)

| # | Email | Ruolo | Brand | Password |
|---|-------|-------|-------|----------|
| 1 | `admin.qa@test.local` | admin | Globale | Test!12345 |
| 2 | `ceo.qa@test.local` | ceo | Globale | Test!12345 |
| 3 | `amm.excell@test.local` | amministrazione | Excell | Test!12345 |
| 4 | `amm.mymed@test.local` | amministrazione | MyMed | Test!12345 |
| 5 | `resp.vendite@test.local` | responsabile_venditori | Excell | Test!12345 |
| 6 | `resp.callcenter@test.local` | responsabile_callcenter | MyMed | Test!12345 |
| 7 | `venditore1@test.local` | venditore | Excell | Test!12345 |
| 8 | `venditore2@test.local` | venditore | Excell | Test!12345 |
| 9 | `operatore1@test.local` | operatore_callcenter | MyMed | Test!12345 |
| 10 | `operatore2@test.local` | operatore_callcenter | MyMed | Test!12345 |

### 2.4 Metodo Creazione Utenti

Il documento includerà:

**Metodo A (Consigliato)**: Edge Function `admin-manage-team`
```json
{
  "action": "invite",
  "brand_id": "2dc052de-26b5-48ef-8dee-917ea591a681",
  "email": "venditore1@test.local",
  "role": "venditore",
  "full_name": "Venditore Test 1"
}
```

**Metodo B (Fallback)**: SQL diretto su `public.users` + `user_roles`

---

## 3. Matrice Permessi Completa

### 3.1 Navigazione Sidebar

| Menu | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|------|-------|-----|------|-----------|---------|-----------|-------|
| Dashboard | V | V | V | V | V | V | V |
| Contatti | V | V | V | V | V | V | V |
| Eventi | V | V | V | V | V | V | V |
| Pipeline | V | V | V | V | V | V | - |
| Vendite | V | V | V | V | V | V | - |
| Appuntamenti | V | V | V | V | V | V | V |
| Ticket | V | V | V | V | V | - | V |
| Chat | V | V | V | V | V | V | V |
| Azienda | V | V | V | - | - | - | - |
| Marketing | Full | Full | Sub | Dash | Dash | - | - |
| Analytics | V | V | - | - | - | - | - |
| Team | V | V | - | V | V | - | - |
| KPI Venditori | V | V | - | V | - | - | - |
| Settings | V | V | V | V | V | V | V |

**Legenda**: V = Visibile, Full = Submenu completo, Sub = Submenu, Dash = Solo dashboard, - = Nascosto

### 3.2 Pipeline (Azioni CRUD)

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Visualizza Kanban | CRUD | CRUD | Read | CRUD | Read | Own | - |
| Crea deal | V | V | - | V | - | V | - |
| Modifica deal | V | V | - | V | - | Own | - |
| Drag & Drop | V | V | - | V | - | Own | - |
| Assegna venditore | V | V | - | V | - | - | - |
| Elimina deal | V | V | - | - | - | - | - |

**Own** = Solo deal assegnati a sé

---

## 4. Dataset Seed SQL

Il documento includerà script SQL completi per:

### 4.1 Pipeline Excell
- 12 contatti
- 12 deal (8 open, 2 won, 2 lost)
- 4 deal assegnati a venditore1, 4 a venditore2
- closed_at valorizzato per won/lost

### 4.2 Pipeline MyMed
- 8 contatti  
- 8 deal per call center

### 4.3 Marketing
- 2 canali (Meta, Google)
- 4 campagne (2 per brand)
- 8 costi marketing
- Deal collegati a campagne

### 4.4 Azienda
- Budget mensile
- 10 spese con categorie

### 4.5 Tickets
- 20 ticket per MyMed
- Distribuzione: 10 assegnati, 5 SLA warning, 5 SLA breach

---

## 5. Test Funzionali per Modulo

Ogni test case nel formato:

```text
### PIPE-03 — Drag&drop persiste
- **Ruolo**: admin
- **Brand**: Excell
- **Precondizioni**: Esiste deal "Mario Rossi" in "Nuovo Lead"
- **Steps**:
  1. Apri /pipeline
  2. Trascina "Mario Rossi" in "In Lavorazione"
  3. Ricarica pagina
- **Expected**:
  - Deal resta nella nuova colonna
  - Nessun errore console
  - Nessuna 401/403/500 in Network
- **Esito**: [ ] PASS / [ ] FAIL
```

---

## 6. Test Tecnici

### 6.1 RLS Attack Test
```text
1. Login come venditore1 (Excell)
2. Aprire DevTools → Network
3. Copiare una richiesta GET deals
4. Modificare brand_id con UUID di MyMed
5. Eseguire richiesta
6. Expected: 0 record o 403
```

### 6.2 Performance Base
- Pipeline con 200 deal: load < 3s
- Nessun freeze UI durante scroll

---

## 7. Smoke Test (10 Critici)

1. Login admin → brand Excell → pipeline load
2. Drag&drop deal → refresh → persiste
3. Assegna venditore a deal → badge ok
4. KPI venditori caricano e numeri coerenti
5. Marketing dashboard: costi e ricavi coerenti
6. Crea costo marketing come "amministrazione" → visibile
7. Venditore: vede pipeline ma non pagine vietate
8. Operatore callcenter: non vede gestione venditori
9. Switch brand Excell↔MyMed: dati corretti e cache ok
10. "Tutti i brand" (CEO): aggregazione non duplicata

---

## 8. Template Bug Report

```markdown
## BUG-XXX: [Titolo breve]

**Severità**: [ ] Blocker [ ] Critical [ ] Major [ ] Minor
**Ambiente**: [ ] Staging [ ] Preview [ ] Local
**Ruolo**: [es. venditore]
**Brand**: [es. Excell]

### Passi per riprodurre
1. ...
2. ...

### Comportamento atteso
...

### Comportamento attuale
...

### Screenshot/Video
[Allegare]

### Console Log
```
[Errori dalla console]
```

### Network Log
- Request: ...
- Response: ...

### Possibile causa
File: ...
Funzione: ...

### Workaround
[Se esiste]
```

---

## 9. Deliverable Attesi dal QA

1. **`docs/platform-qa-checklist.md`** compilato con PASS/FAIL
2. **`docs/qa-run-report-YYYY-MM-DD.md`** con:
   - Utenti usati
   - Seed applicato
   - Bug trovati
   - Raccomandazione GO/NO GO
3. **Bug list** in formato ticket (Jira/Notion ready)

---

## 10. File da Creare

| File | Descrizione | Righe stimate |
|------|-------------|---------------|
| `docs/platform-qa-checklist.md` | Documento QA principale | ~800 |

Il documento includerà:
- UUID reali dei brand
- Script SQL completi e testati
- Riferimento a `docs/marketing-qa-checklist.md` esistente
- Template bug report pronto all'uso

---

## 11. Riferimenti a Documentazione Esistente

Il documento linkerà:
- `docs/marketing-qa-checklist.md` (già completo)
- `docs/decisions.md` (decisioni architetturali)
- `docs/troubleshooting.md` (problemi comuni)
- Edge Function `admin-manage-team` per inviti

