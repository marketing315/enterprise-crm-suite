# Smistamento lead Meta per modulo: MyMed / Centri MyMed

## Obiettivo
I lead che arrivano da uno o più **moduli Meta scelti** (quelli della nuova campagna) devono andare su **Centri MyMed**. Tutti gli altri lead della pagina MyMed devono continuare ad arrivare su **MyMed** esattamente come oggi.

## Come funzionerà
- Nella pagina Impostazioni → Meta Lead Ads, sulla riga della Meta App MyMed, compare una nuova sezione **"Regole di smistamento"**.
- Scegli il modulo (dall'elenco dei moduli della pagina oppure incollando il suo ID) e il brand di destinazione (Centri MyMed). Puoi attivare o disattivare la regola quando vuoi.
- Quando arriva un lead, il CRM controlla se il suo modulo ha una regola:
  - **sì**: contatto, trattativa e lead vengono creati su Centri MyMed;
  - **no**: tutto va su MyMed come oggi.
- Se il controllo fallisce per qualunque motivo, il lead va **sempre su MyMed** e non viene mai perso.

## Garanzie per i lead attuali
- Senza regole attive non cambia nulla: il comportamento resta identico a oggi.
- La pagina Facebook, il collegamento e la verifica dei lead restano invariati: non serve riconfigurare nulla su Meta.
- Le aggiunte sono solo nuove: nessun dato esistente viene modificato o cancellato.
- Il recupero automatico ogni 5 minuti e il recupero dello storico usano la stessa regola, così i lead recuperati finiscono sul brand giusto.

## Verifica prima del rilascio
1. Simulo un lead da un modulo qualsiasi e controllo che arrivi su MyMed.
2. Simulo un lead dal modulo con la regola e controllo che arrivi su Centri MyMed.
3. Controllo che nell'ultima ora i lead reali di MyMed continuino ad arrivare.

## Dettagli tecnici
- Nuova tabella `meta_form_brand_routes` (id, meta_app_id FK, form_id text, target_brand_id FK brands, is_active default true, created_by, timestamps), UNIQUE(meta_app_id, form_id). RLS: lettura e scrittura riservate ad admin/CEO sia del brand sorgente sia del brand di destinazione; service_role completo. Migrazione solo additiva.
- Helper condiviso `_shared/meta-form-routing.ts` `resolveTargetBrand(supabase, metaApp, formId)`: restituisce `target_brand_id` se esiste una regola attiva, altrimenti `metaApp.brand_id`. In caso di errore torna a `metaApp.brand_id` (fail-open verso MyMed) e scrive un log.
- `meta-leads-webhook`: usa il brand risolto nell'insert di `meta_lead_events` e in contatti, deal, `lead_events`, assegnazione e CAPI. HMAC, verify_token e il controllo `page_id` restano sul `metaApp`.
- `meta-leads-recover` / `meta-leads-backfill`: risolvono il brand con lo stesso helper (si basano su `meta_lead_events.brand_id`, già scritto corretto per i nuovi eventi; nel backfill si applica la regola durante la creazione degli stub). La deduplica `(brand_id, leadgen_id)` resta.
- UI: `MetaFormRoutesDialog` aperto dalla riga in `MetaAppsList`, con elenco moduli via Graph `/{page_id}/leadgen_forms` (se il token lo consente), altrimenti inserimento manuale dell'ID modulo. Hook `useMetaFormRoutes`.
- Registrare in AGENTS.md: il brand di un lead Meta = regola per modulo, se presente, altrimenti il brand della Meta App.
