

## Riorganizzazione logica delle Impostazioni

### Analisi dello stato attuale

Dopo aver esaminato tutto il progetto (routes, moduli, componenti settings), ho identificato:

**Problemi attuali:**
- "Attribution" (CampaignGroupsManager) è un componente marketing, non ha senso sotto "Lead & Automazioni"
- "Webhook" contiene già le sorgenti inbound (InboundSourceList) al suo interno — le sorgenti inbound meritano visibilità propria dato che ora hanno la configurazione pipeline stage
- VoIP e VOIspeed sono due componenti separati ma logicamente sono lo stesso dominio
- "Canali OAuth" e "Meta Ads" sono concettualmente la stessa area (connessioni esterne)
- "Keplero Lookup" è un'integrazione, non un'automazione
- Manca una sezione per i Prodotti/Catalogo (la pagina /products esiste ma non è configurabile da settings)

### Piano di riorganizzazione

Nuova struttura a 5 gruppi:

```text
CRM & Dati
  ├── Pipeline              (fasi pipeline)
  ├── Campi personalizzati  (custom fields)
  ├── Tag                   (tag manager)
  ├── Ticketing & SLA       (regole SLA)
  └── Sorgenti Inbound      ← NUOVO: estratto da Webhook, con pipeline stage mapping

Lead & Automazioni
  ├── Automazioni           (regole automatiche)
  ├── Lead Digest           (report digest)
  └── Attribution           (gruppi campagne — resta qui ma rinominato)

Integrazioni
  ├── Webhook               (outbound + monitor, senza inbound)
  ├── Telefonia VoIP        (VoIP + VOIspeed — invariato)
  ├── Google Sheets         (export sheets)
  ├── Meta Ads              (meta apps)
  ├── Canali OAuth          (token OAuth)
  └── Keplero Lookup        ← SPOSTATO da Lead & Automazioni

Notifiche
  └── Preferenze notifiche  (invariato, ma in gruppo proprio)

Sistema (solo super admin)
  ├── Governance moduli
  ├── MCP Server
  └── Gestione utenti
```

### Modifiche concrete

**File: `src/pages/Settings.tsx`**

1. **Aggiungere** voce "Sorgenti Inbound" (id: `inbound-sources`, icon: `Download`) nel gruppo "CRM & Dati" — renderizza `InboundSourceList` direttamente
2. **Spostare** "Keplero Lookup" da "Lead & Automazioni" a "Integrazioni"
3. **Spostare** "Notifiche" in un gruppo proprio chiamato "Notifiche"
4. **Riordinare** il gruppo "Generale" → rinominato "CRM & Dati" con ordine logico: Pipeline, Campi personalizzati, Tag, Ticketing, Sorgenti Inbound
5. **Aggiungere import** di `Download` da lucide-react e di `InboundSourceList`
6. **Aggiungere case** `inbound-sources` nel switch `SettingsContent`

Nessuna nuova tabella, nessuna migration, nessun componente nuovo — solo riorganizzazione della navigazione e un nuovo case nel router interno.

