

## Obiettivo

Nella mail di riepilogo lead, distinguere i lead provenienti da Keplero con appuntamento fissato: non sono "nuovi lead" ma lead passati da "Nuovo Lead" → "Appuntamento Fissato". Devono apparire in una sezione separata o con un'etichetta chiara.

## Modifiche

### Edge Function `lead-digest-dispatch/index.ts`

1. **Arricchire la query `lead_events`** — aggiungere il join su `deals` con la pipeline stage:
   ```
   deals(id, current_stage_id, pipeline_stages(name))
   ```

2. **Nella funzione `mapLead`** — aggiungere un campo `tipo` al lead mappato:
   - Se `source_name === "keplero"` e il deal è nello stage "Fissato" → `tipo = "appuntamento_fissato"`
   - Altrimenti → `tipo = "nuovo_lead"`

3. **Separare i lead nel body HTML/testo** in due sezioni:
   - **Sezione 1: "Nuovi Lead"** — lead con `tipo = "nuovo_lead"`
   - **Sezione 2: "Appuntamenti Fissati (da Keplero)"** — lead con `tipo = "appuntamento_fissato"`, con una nota che indica la transizione di stato

4. **Aggiornare il subject** per includere entrambi i conteggi, es:
   ```
   Aggiornamento Lead (12 nuovi, 3 fissati) - 07/03 16:30
   ```

5. **Aggiornare la tabella HTML** — aggiungere una colonna "Tipo" o separare in due tabelle con intestazioni diverse. La sezione "fissati" avrà uno sfondo leggermente diverso (es. verde chiaro) per distinguerla visivamente.

6. **Aggiornare il payload JSON** — aggiungere i conteggi separati (`new_leads_count`, `fissati_count`) e il campo `tipo` per ogni lead nell'array.

