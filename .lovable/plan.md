## Microcopy: rinominare le voci tecniche del menu

Tutte le modifiche su `src/components/layout/MainLayout.tsx` (sezione `navSections` righe 125-186 e renderer voce). Nessuna modifica a path/route — solo etichette + tooltip esplicativi.

### Rinomine

| Oggi | Nuovo | Path (invariato) |
|---|---|---|
| Eventi | Lead in arrivo | `/events` |
| DLQ | Webhook in errore | `/admin/dlq` |
| CAPI Monitor | Eventi Facebook | `/admin/capi` |
| SLO Board | Stato del servizio | `/admin/slo-board` |
| Webhook Monitor | Stato webhook | `/admin/webhooks` |
| AI Metrics | Statistiche AI | `/admin/ai-metrics` |
| Gestione AI | Assistente AI | `/admin/ai` |
| KPI Venditori | Performance venditori | `/team/salespersons` |
| KPI Call Center | Performance call center | `/admin/callcenter-kpi` |
| Trend Ticket | Andamento ticket | `/admin/ticket-trend` |
| Security Review | Controlli sicurezza | `/admin/security-reviews` |
| Audit & Compliance | Storico modifiche | `/admin/audit` |

Restano invariati (già parlanti): Dashboard, Contatti, Pipeline, Appuntamenti, Ticket, Chat, Vendite, Prodotti, Azienda, Analytics, Dashboard CEO, Impostazioni, Team, Quick Backup.

### Tooltip esplicativi sulle voci ambigue

Aggiunto un campo opzionale `description?: string` all'interfaccia `NavItem`. Quando presente, viene passato al `tooltip` di `<SidebarMenuButton>` (sostituisce solo il fallback "Seleziona prima un brand", che resta prioritario).

Tooltip da aggiungere:

- **Pipeline** → "Le tue trattative in corso, divise per fase"
- **Lead in arrivo** → "Nuovi contatti acquisiti dai canali marketing"
- **Webhook in errore** → "Messaggi che non sono riusciti ad arrivare: vanno controllati e rimandati"
- **Eventi Facebook** → "Conversioni inviate a Meta (CAPI) per le campagne pubblicitarie"
- **Stato del servizio** → "Salute generale del sistema e affidabilità nel tempo"
- **Stato webhook** → "Connessioni in entrata: chi ci sta mandando dati e con quale qualità"
- **Statistiche AI** → "Quanto e come l'AI viene usata nel CRM"
- **Assistente AI** → "Configurazione del comportamento dell'assistente AI"
- **Storico modifiche** → "Chi ha cambiato cosa e quando, per audit e conformità"
- **Controlli sicurezza** → "Revisione periodica di accessi e permessi"

### Modifica al renderer

In `renderItem` (righe 318-341), passare `item.description` come `tooltip` quando `hasBrandSelected` è true:

```tsx
tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : item.description}
```

`SidebarMenuButton` di shadcn già accetta una stringa per `tooltip` e la mostra solo quando la sidebar è collassata. Per renderla visibile anche con sidebar espansa serve il pattern `tooltip={{ children: ..., hidden: false }}`. Useremo questo per le voci con `description`, così il tooltip compare in hover anche con sidebar aperta — esattamente quello che serve per i termini ambigui.

### File toccati

- **Modificato**: `src/components/layout/MainLayout.tsx` (etichette in `navSections`, interfaccia `NavItem`, render del tooltip).

Nessuna nuova dipendenza, nessuna migration, nessun cambio di route.