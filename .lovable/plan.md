

# Mostrare tutti i dati importanti nella scheda contatto

Attualmente molti dati del contatto e degli eventi lead vengono salvati nel database ma non vengono mai mostrati nella UI della scheda contatto. Ecco il piano per risolvere.

## Cosa manca attualmente

### Dati contatto non visualizzati
- **Indirizzo completo** (address, province, country) -- visibile solo in modifica, non in lettura
- **Dati aziendali**: ragione sociale, indirizzo azienda, P.IVA, codice fiscale
- **Dati lead**: tipo lead, costo lead, validita lead, note lead, motivo lead
- **Consenso marketing**: visibile solo in modifica
- **Callback richiesta** e **esito chiamata**
- **Fax**

### Dati evento lead non visualizzati
- **Tipo lead** (lead_type)
- **Confidenza AI** (ai_confidence)
- **Motivazione AI** (ai_rationale)
- **Riepilogo conversazione AI** (ai_conversation_summary)

---

## Modifiche previste

### 1. Sezione "Informazioni" -- aggiungere indirizzo completo
Aggiungere la visualizzazione dell'indirizzo (address), provincia e paese quando presenti, sotto citta/CAP.

### 2. Nuova sezione "Dati Aziendali"
Mostrare company_name, company_address, company_city, company_province, company_zip, vat_number, fiscal_code, fax -- solo quando almeno uno di questi campi e valorizzato.

### 3. Nuova sezione "Dati Lead"
Mostrare lead_type, lead_cost, lead_valid, lead_note, lead_reason -- solo quando almeno uno di questi campi e valorizzato. Include anche callback_requested e esito_chiamata.

### 4. Consenso Marketing in lettura
Aggiungere un badge o indicatore del consenso marketing nella sezione informazioni (quando attivo).

### 5. Arricchire la card evento lead
Nella lista eventi, aggiungere:
- Badge con lead_type
- Confidenza AI (percentuale)
- Motivazione AI (testo espandibile)
- Riepilogo conversazione AI (se presente)

---

## Dettaglio tecnico

### File da modificare
**`src/components/contacts/ContactDetailSheet.tsx`**

1. **Sezione Informazioni (righe 371-423)**: aggiungere visualizzazione indirizzo completo e marketing consent badge

2. **Nuova sezione "Dati Aziendali" (dopo riga 437)**: blocco condizionale che mostra i dati aziendali solo se almeno un campo e valorizzato. Usa icona `Building` da lucide-react.

3. **Nuova sezione "Dati Lead" (dopo sezione aziendali)**: blocco condizionale per tipo lead, costo, validita, note lead, esito chiamata e callback. Usa icona `Tag` o `FileText`.

4. **Card eventi lead (righe 540-588)**: aggiungere dentro ogni card evento:
   - Badge lead_type (se presente)
   - ai_confidence come percentuale accanto a ai_priority
   - ai_rationale in un blocco espandibile
   - ai_conversation_summary se presente

### Accesso ai dati
Tutti i campi sono gia disponibili: la query `useContact` usa `select(*)` quindi tutti i campi del contatto sono caricati. I lead_events usano anch'essi `select(*)`. Non servono modifiche al backend. Dove il tipo TypeScript non include il campo, si usa il cast `(contact as any).campo` coerente con il pattern esistente.

### Importazioni aggiuntive
Aggiungere `Building, FileText, Shield, PhoneForwarded` alle icone importate da lucide-react.

