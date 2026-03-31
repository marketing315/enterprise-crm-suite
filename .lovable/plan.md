

## Piano: Eliminazione 7 contatti di test

### Contatti da eliminare

| # | Nome | Telefono | ID |
|---|------|----------|----|
| 1 | TEST TEST | 3333333333 | `73c6c2cf-...` |
| 2 | Test Lovable | 3330000000 | `d28be152-...` |
| 3 | TEST3 TEST3 | 3333453432 | `cad7245b-...` |
| 4 | test test | 381464599 | `b94fe1a5-...` |
| 5 | Marco Rossi | 3331234567 | `965fdb54-...` |
| 6 | Test Meta Lead | 31234278168 | `a1e5bfa9-...` |
| 8 | Test Test | 3393635044 | `335152fa-...` |

**Escluso:** Samuele Bolis (`8a2ca199-...`)

### Operazioni

Le tabelle con `ON DELETE CASCADE` su `contact_id` verranno pulite automaticamente (es. `contact_phones`, `lead_event_clinical_topics` via `lead_events`). Eseguirò nell'ordine:

1. **DELETE `lead_events`** dove `contact_id` è uno dei 7 ID
2. **DELETE `deals`** dove `contact_id` è uno dei 7 ID
3. **DELETE `contacts`** per i 7 ID (cascade elimina `contact_phones` e altri riferimenti FK)

Tutto tramite lo strumento di inserimento/delete dati (non migration, perché si tratta di dati, non schema).

