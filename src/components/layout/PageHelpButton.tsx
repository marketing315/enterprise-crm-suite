import { HelpCircle, ExternalLink, Lightbulb, Zap, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useLocation } from "react-router-dom";

interface QuickAction {
  label: string;
  steps: string[];
}

interface PageHelp {
  title: string;
  description: string;
  tips?: string[];
  quickActions?: QuickAction[];
  docsPath?: string; // file in docs/ (without leading slash)
}

const DOCS_BASE = "https://github.com/lovable-dev/ralph-hub/blob/main/docs/"; // best-effort link; ok se non risolve

const pageHelpContent: Record<string, PageHelp> = {
  // ─────────────────────── CORE ───────────────────────
  "/dashboard": {
    title: "Dashboard",
    description:
      "Vista personalizzata in base al ruolo (CEO, Admin, Responsabile Vendite/CallCenter, Venditore, Operatore). KPI live, prossime azioni e accesso rapido ai moduli di pertinenza.",
    quickActions: [
      { label: "Cambiare brand", steps: ["Apri il selettore brand in alto a sinistra", "Scegli il brand su cui operare", "Tutti i KPI, le viste e le notifiche si filtrano automaticamente"] },
      { label: "Rivedere il tour iniziale", steps: ["Menu utente (avatar in basso a sinistra)", "Clicca 'Rivedi il tour iniziale'", "Il walkthrough riparte da capo"] },
      { label: "Ricerca globale", steps: ["Premi ⌘K (Mac) o Ctrl+K (Windows)", "Cerca contatti, deal, ticket, appuntamenti", "Invio per aprire"] },
    ],
    tips: [
      "I KPI sono in realtime via Supabase Realtime",
      "Gli amministratori vedono anche il brand di sistema (vista aggregata)",
      "Le scorciatoie del menu sono ruolo-aware: vedi solo ciò che ti compete",
    ],
  },

  // ─────────────────────── CRM OPERATIVO ───────────────────────
  "/contacts": {
    title: "Contatti",
    description:
      "Database clienti con ricerca full-text, dedup automatico via telefono/email, soft-delete, tag, custom fields e timeline interazioni (chiamate, ticket, deal, eventi, trascrizioni).",
    quickActions: [
      { label: "Trovare un contatto", steps: ["Usa la barra di ricerca o ⌘K", "Filtra per stato, sorgente, tag, città", "Risultati paginati 1000 righe max"] },
      { label: "Chiamare via VoIP", steps: ["Apri il contatto", "Premi il pulsante telefono in alto", "Click-to-call VOIspeed se configurato; fallback tel:"] },
      { label: "Archiviare un contatto", steps: ["Apri il contatto", "Menu '...' → Archivia", "Soft-delete: nascosto a tutti tranne admin/CEO"] },
    ],
    tips: [
      "I duplicati vengono uniti per telefono normalizzato (E.164 IT)",
      "Le trascrizioni chiamate appaiono nella timeline con sentiment cliente/operatore",
      "Admin: gestisci unioni manuali da /admin/contacts-dedup",
    ],
  },
  "/pipeline": {
    title: "Pipeline (Kanban)",
    description:
      "Gestisci le trattative in vista Kanban con drag & drop, optimistic concurrency (no sovrascritture), tagging AI dei deal e audit completo dei cambi fase.",
    quickActions: [
      { label: "Spostare un deal", steps: ["Trascina la card nella colonna desiderata", "Su mobile usa il menu '...'", "Se vedi STALE_DEAL = qualcuno l'ha modificato prima di te, ricarica"] },
      { label: "Filtrare per venditore o sorgente", steps: ["Apri il filtro in alto", "Multi-select venditori/sorgenti/tag", "Salva la vista per riusarla"] },
      { label: "Aggiungere una nota", steps: ["Apri il deal", "Sezione 'Note e attività'", "Auto-save su blur, no bottone Salva"] },
    ],
    tips: [
      "Ogni contatto ha max 1 deal aperto per brand",
      "I tag AI sono generati da ai-tag-deals (override manuale possibile)",
      "Lo storico cambi fase è in /admin/audit",
    ],
  },
  "/sales": {
    title: "Vendite",
    description:
      "Registra vendite e ordini collegati a deal o crea vendite rapide. AI parser per documenti (PDF/foto ricevute) con output JSON validato.",
    tips: [
      "Vendita rapida: senza deal esistente",
      "Allega documenti e ricevute (storage cifrato)",
      "Parser AI: max 5MB per documento",
    ],
  },
  "/sales/performance-sheet": {
    title: "Foglio ESITO APPUNTAMENTI (Venditori)",
    description:
      "Vista 1:1 del foglio storico: Programmati / Eseguiti / % esecuzione / Ordini / % vendita / Lordo / Imponibile (lordo ÷ 1,22) / % consegne / Bonus tier versionato.",
    quickActions: [
      { label: "Cambiare periodo o venditore", steps: ["Filtri in alto: periodo + venditore", "Aggregato vs singolo via toggle", "Click su una riga venditore → drill-down"] },
      { label: "Configurare i bonus tier", steps: ["Pulsante 'Bonus tier' in toolbar", "Definisci soglie con valid_from/to", "Le versioni storiche restano consultabili"] },
      { label: "Export su Google Sheet", steps: ["Pulsante 'Google Sheet' in toolbar", "Imposta spreadsheet_id + tab", "Cron giornaliero 06:00 IT + on-demand"] },
    ],
    tips: [
      "IVA flat 22% scorporata sul lordo per ottenere l'imponibile",
      "Costi/CPL visibili solo a CEO + Admin + Amministrazione",
      "Cohort delivery in roadmap F5.8",
    ],
  },
  "/sales/performance-sheet/:userId": {
    title: "Drill-down Venditore",
    description:
      "Funnel Assegnati → Visitati → Ordini → Consegnati per singolo venditore, con trend rolling 12 mesi e dettaglio per fonte/canale.",
    tips: [
      "Grafici Recharts; hover per dettaglio",
      "I dati provengono da mv_salesperson_perf_daily (refresh ogni 15min)",
      "Badge freshness in alto a destra",
    ],
  },
  "/appointments": {
    title: "Appuntamenti",
    description:
      "Calendario + Ops Board con risk score AI, sales availability/capacità, audit timeline, saved filters, bulk reassign e CSV export 15 colonne.",
    quickActions: [
      { label: "Creare un appuntamento", steps: ["Clicca '+ Nuovo appuntamento'", "Scegli contatto, slot, tipo", "Assegna venditore (capacità verificata)"] },
      { label: "Riassegnare in massa", steps: ["Ctrl/Cmd + click su più righe", "Premi 'Riassegna'", "Scegli il nuovo venditore"] },
      { label: "Salvare filtri ricorrenti", steps: ["Imposta i filtri desiderati", "Pulsante 'Salva vista'", "Richiamabile dalla tendina"] },
    ],
    tips: [
      "Risk score: 0-100, evidenzia appuntamenti a rischio no-show",
      "Notifiche push automatiche su high-risk",
      "CSV con tutte le colonne marketing/attribution",
    ],
  },
  "/tickets": {
    title: "Ticket",
    description:
      "Ticketing con SLA, priorità AI, code, auto-escalation gerarchica, what-if simulator e audit completo.",
    quickActions: [
      { label: "Prendere in carico", steps: ["Apri coda 'Non assegnati'", "Clicca 'Prendi in carico'", "Diventi owner e ricevi le notifiche"] },
      { label: "Capire la priorità AI", steps: ["Hover su badge P. in tabella", "Combina urgenza + valore deal + SLA residuo", "Modificabile manualmente"] },
      { label: "Simulare escalation", steps: ["Apri /admin/ticket-escalation-simulator", "Carica un ticket o crea scenario", "Vedi chi viene notificato e quando"] },
    ],
    tips: [
      "STALE_TICKET = qualcuno l'ha modificato prima, ricarica",
      "SLA breach auto-marcati ogni 15min",
      "Audit escalation in /admin/ticket-escalation-audit",
    ],
    docsPath: "slo-sla.md",
  },
  "/chat": {
    title: "Chat Team",
    description: "Messaggistica interna: 1-to-1, gruppi e thread su deal/contatti, con quick actions AI.",
    tips: ["Crea gruppi per team o progetti", "Allega messaggi a deal/contatti", "Ricerca full-text sui messaggi"],
  },
  "/events": {
    title: "Eventi (Inbox Lead)",
    description: "Tutti i lead in ingresso (webhook, Meta Ads, Keplero, manuali). L'AI classifica e instrada automaticamente.",
    quickActions: [
      { label: "Filtrare i lead di oggi", steps: ["Filtro periodo → 'Oggi'", "Ordina per ora di arrivo", "Pinna sorgenti frequenti"] },
      { label: "Riprocessare un lead fallito", steps: ["Vai su /admin/dlq", "Identifica il motivo", "Premi 'Riprocessa' dopo aver corretto la sorgente"] },
      { label: "Capire la decisione AI", steps: ["Apri l'evento", "Sezione 'Decisione AI'", "Override manuale dal pulsante"] },
    ],
    docsPath: "inbound-webhooks.md",
  },

  // ─────────────────────── PERFORMANCE HUB (F0-F5) ───────────────────────
  "/performance": {
    title: "Performance Hub",
    description:
      "Suite C-Level con tutti i moduli sviluppati nelle fasi F0-F5: fondamenta dati, canali/costi, call center, trascrizioni AI, foglio venditori e rifiniture (alert, retention, export).",
    quickActions: [
      { label: "Aprire una sezione", steps: ["Scorri le 6 sezioni a tile", "Clicca la card per entrare", "Ogni tile mostra lo stato (live/cron/manuale)"] },
      { label: "Vedere la freschezza dati", steps: ["Badge MV in alto sulle pagine performance", "Mostra 'aggiornato N min fa'", "Trigger refresh manuale se admin"] },
    ],
    tips: [
      "Visibile a Admin, CEO, Amministrazione, Responsabili",
      "Le MV si aggiornano ogni 15min via cron",
      "Tutti gli alert finiscono anche in campanella notifiche",
    ],
  },

  // ─────────────────────── MARKETING ───────────────────────
  "/marketing": {
    title: "Marketing",
    description: "Hub marketing: campagne, costi, lead, report, performance multi-canale, integrazione Meta Lead Ads + CAPI.",
    tips: [
      "Per analisi performance approfondita usa /marketing/performance",
      "CPL visibile solo a ruoli finance (CEO, Admin, Amministrazione)",
      "Meta CAPI: configura dataset/token in Settings → Meta",
    ],
    docsPath: "meta-lead-ads.md",
  },
  "/marketing/performance": {
    title: "Marketing Performance",
    description:
      "Performance multi-canale con MV daily (cron 15min), CPL per sorgente, confronto A/B periodi, import costi CSV (giorno × cost_kind × emittente) e tree-picker fonte.",
    quickActions: [
      { label: "Confronto A/B", steps: ["Apri il pannello 'A/B Compare'", "Scegli sorgente e i due periodi", "Vedi delta % e significato"] },
      { label: "Importare costi", steps: ["Pulsante 'Import costi CSV'", "Schema: data, cost_kind, emittente, importo", "Validazione + preview prima del commit"] },
      { label: "Verificare freschezza dati", steps: ["Badge MV in alto", "Hover per dettaglio refresh", "Se admin: trigger manuale"] },
    ],
    tips: [
      "Attribuzione single-touch con precedenza specifica (vedi spec)",
      "Costi/CPL solo CEO + Admin + Amministrazione",
      "Telephony table integra DID enrichment (F2)",
    ],
  },

  // ─────────────────────── CALL CENTER ───────────────────────
  "/callcenter/wallboard": {
    title: "Wallboard Call Center",
    description:
      "KPI live operatori e tracking number: answer rate, AHT, inbound/outbound, breakdown per canale marketing. Filtri data con preset e refresh configurabile.",
    quickActions: [
      { label: "Cambiare il refresh", steps: ["Tendina in alto a destra", "Off / 15s / 30s / 60s / 5m", "Off per risparmiare risorse"] },
      { label: "Filtrare il periodo", steps: ["Preset: Oggi / 7g / 30g", "Custom: calendario popover", "I KPI si ricalcolano automaticamente"] },
      { label: "Drill-down per canale", steps: ["Scorri alla 'Inbound Channel Breakdown'", "Click sul canale per vedere i tracking number", "DID enrichment via voispeed-events-webhook"] },
    ],
    tips: ["Realtime parziale, full-realtime in roadmap F6", "DID non riconosciuti: vedi docs/dr/f2-did-enrichment-probe.sql"],
  },
  "/callcenter/transcripts": {
    title: "Trascrizioni Chiamate",
    description:
      "Trascrizioni Whisper + analisi Gemini: sentiment cliente/operatore separati (diarizzazione semantica), outcome, intent, obiezioni, qualità, keyword. Full-text search italiana.",
    quickActions: [
      { label: "Ricercare nelle trascrizioni", steps: ["Barra search full-text", "Filtri: sentiment, outcome, operatore", "Click sulla riga per dettaglio + turni colorati"] },
      { label: "Forzare trascrizione su una chiamata", steps: ["Apri il contatto → sezione Chiamate", "Pulsante 'Trascrivi ora'", "Cron sweeper ogni 5min altrimenti"] },
      { label: "Configurare retention audio", steps: ["Vai su /admin/data-retention", "Imposta giorni retention audio/transcripts per brand", "Cleanup giornaliero 03:30 IT"] },
    ],
    tips: [
      "STT: Whisper API (italiano nativo)",
      "Diarizzazione semantica con hint inbound/outbound",
      "DPIA: vedi docs/dpia-call-recordings.md",
    ],
  },

  // ─────────────────────── AZIENDA / TEAM / PRODOTTI ───────────────────────
  "/azienda": {
    title: "Azienda",
    description: "CEO Financial Governance M13: fatturato, spese, budget, ROI marketing su revenue attribuibile, trend mensili/annuali.",
    tips: [
      "Margini = Vendite − Spese",
      "Budget overlap mensile gestito correttamente (Sprint 2)",
      "Banner calc_version su variazioni metodologiche",
    ],
  },
  "/team": {
    title: "Team",
    description: "Gestione utenti, ruoli per brand (RBAC + gerarchia), MFA enforcement per Admin/CEO, performance e assegnazioni.",
    tips: [
      "Roles in tabella separata user_roles (no privilege escalation)",
      "MFA obbligatoria per Admin e CEO",
      "Utenti inattivi non possono accedere",
    ],
  },
  "/products": {
    title: "Prodotti",
    description: "Catalogo prodotti e servizi vendibili, riutilizzabili in vendite e preventivi.",
  },

  // ─────────────────────── SETTINGS ───────────────────────
  "/settings": {
    title: "Impostazioni",
    description:
      "Configurazione sistema: webhook sources, SLA, integrazioni (VOIspeed, Meta OAuth + CAPI, Google Sheets, Keplero), brand, custom fields, automation, sicurezza.",
    quickActions: [
      { label: "Connettere Meta (OAuth)", steps: ["Settings → Meta → Connect", "Login Facebook Business", "Seleziona Page (1 brand = 1 page)"] },
      { label: "Configurare CAPI", steps: ["Settings → Meta → CAPI", "Inserisci Dataset ID + Access Token", "Test connessione + abilita capi_enabled"] },
      { label: "Aggiungere sorgente webhook", steps: ["Settings → Webhook sources", "Definisci schema payload e mapping", "Token rate-limited per IP (H1)"] },
    ],
    tips: [
      "VOIspeed: click-to-call + ricezione eventi (HMAC + replay-guard)",
      "Google Sheets: connector OAuth, no API key richiesta",
      "Tutte le integrazioni sono per brand",
    ],
    docsPath: "voispeed-integration.md",
  },
  "/settings/security": {
    title: "Sicurezza Account",
    description: "MFA TOTP, sessioni attive, idle timeout configurabile, password policy runtime, audit accessi.",
    tips: [
      "MFA obbligatoria per Admin/CEO",
      "Idle timeout default 30 min, configurabile",
      "Password HIBP check attivo (no leaked passwords)",
    ],
  },

  // ─────────────────────── ADMIN ───────────────────────
  "/admin/ai": {
    title: "Gestione AI",
    description: "Prompt, regole di classificazione e modalità operativa dell'AI (lead-digest, ai-classify, ai-tag-deals).",
    docsPath: "mcp-server-runbook.md",
  },
  "/admin/ai-metrics": {
    title: "AI Metrics",
    description: "Accuratezza, latenza, override e feedback del sistema AI. Quota e budget token per utente/sistema.",
    docsPath: "mcp-server-runbook.md",
  },
  "/admin/ai-decisions-drilldown": {
    title: "AI Decisions Drill-down",
    description: "Investigazione granulare delle decisioni AI (input, reasoning, output, override umani).",
  },
  "/admin/dlq": {
    title: "Dead Letter Queue",
    description: "Lead non processabili: errori parsing, dati mancanti, problemi tecnici. Riprocessabili dopo correzione.",
    quickActions: [
      { label: "Capire un errore", steps: ["Filtra per motivo", "Click sull'entry → payload originale", "Identifica campo mancante o invalido"] },
      { label: "Riprocessare", steps: ["Correggi sorgente o payload", "Azione 'Riprocessa' nel dettaglio", "Verifica entrata in /events"] },
    ],
    docsPath: "inbound-webhooks.md",
  },
  "/admin/webhooks": {
    title: "Webhook Monitor",
    description: "Stato consegne webhook outbound: successi, errori, retry, circuit breaker, dead-letter.",
    docsPath: "inbound-webhooks.md",
  },
  "/admin/notification-webhooks": {
    title: "Notification Webhooks Outbox",
    description: "Outbox notifiche outbound con retry budget e auditing per ogni delivery.",
  },
  "/admin/ticket-trend": {
    title: "Trend Ticket",
    description: "Analisi storica volumi, tempi di risoluzione, SLA compliance.",
    docsPath: "slo-sla.md",
  },
  "/admin/ticket-escalation-audit": {
    title: "Audit Escalation Ticket",
    description: "Tracciamento completo delle escalation gerarchiche: chi, quando, perché, esito.",
  },
  "/admin/callcenter-kpi": {
    title: "KPI Call Center (Admin)",
    description: "Metriche aggregate operatori, durata, esiti, performance per periodo.",
  },
  "/admin/analytics": {
    title: "Analytics Avanzati",
    description: "Funnel, sorgenti, trend, velocità di conversione e cohort analysis.",
  },
  "/admin/performance-alerts": {
    title: "Performance Alerts (F5.5)",
    description:
      "Regole anomalie con soglie per CPL / Answer Rate / Delivery % / Sentiment negativo %. Cooldown anti-spam e mirror in campanella + observability.",
    quickActions: [
      { label: "Creare una regola", steps: ["Tab 'Regole' → Nuova", "Scegli metrica, soglia, finestra, cooldown", "Attiva: l'evaluator parte ogni 30min"] },
      { label: "Acknowledge eventi", steps: ["Tab 'Eventi recenti'", "Click 'Ack' sull'evento gestito", "Resta in audit ma non rumoreggia"] },
    ],
    tips: ["Visibile a admin / CEO / amministrazione", "Mirror su mcp_slo_alerts con prefisso perf:"],
  },
  "/admin/data-retention": {
    title: "Data Retention & DPIA (F5.7)",
    description:
      "Policy retention per brand: giorni per audio chiamate, transcripts, alert, log export. Dry-run + cleanup giornaliero 03:30 IT.",
    quickActions: [
      { label: "Configurare retention brand", steps: ["Seleziona brand", "Imposta giorni per ogni categoria", "Salva: cron applica automaticamente"] },
      { label: "Eseguire dry-run", steps: ["Pulsante 'Dry-run'", "Vedi quanti record verrebbero anonimizzati/cancellati", "Conferma per applicare"] },
    ],
    tips: ["Audio: recording_url → NULL (anonimizzato)", "DPIA: docs/dpia-call-recordings.md"],
  },
  "/admin/sheets-health": {
    title: "Sheets Export Health",
    description:
      "SLO export Google Sheets <15min, verify_critical_triggers, reconciliation 7 giorni con backfill automatico (post-mortem aprile 2026).",
    tips: ["Critical triggers registry obbligatorio", "Alert in campanella su breach SLO"],
  },
  "/admin/cron-jobs": {
    title: "Cron Jobs Registry (A10)",
    description: "Tutti i cron registrati con tenant-scope, drift detection (job non registrati), append-only run log.",
    tips: ["Lease TTL su cron concorrenti (C11)", "Audit completo su cron_run_log"],
  },
  "/admin/incidents": {
    title: "Incidents (F6)",
    description: "Error boundary report dal client (retry-budget 3) con rate-limit 30/h. Append-only.",
  },
  "/admin/slo-board": {
    title: "SLO Board",
    description: "Burn-rate monitor multi-finestra (rapido + lento) con alert configurabili.",
  },
  "/admin/observability": {
    title: "Observability",
    description: "Metriche operative: latenze, errori edge, salute pipeline dati, OTel tracing MCP.",
  },
  "/admin/siem-export": {
    title: "SIEM Export",
    description: "Export audit eventi verso SIEM esterno con redaction PII e shape stabile.",
  },
  "/admin/sessions": {
    title: "Sessioni Attive",
    description: "Sessioni utente con device fingerprint, last activity, revoke remoto.",
  },
  "/admin/quick-backup": {
    title: "Quick Backup",
    description: "Backup on-demand con doppia copia (Lovable Storage + Google Drive cartella 'Crm backup / {brand}').",
  },
  "/admin/contacts-dedup": {
    title: "Contacts Deduplication (A5)",
    description: "Trova e unisce contatti duplicati via telefono normalizzato (22 tabelle aggiornate + tombstone).",
    quickActions: [
      { label: "Trovare duplicati", steps: ["Filtri: brand, soglia similarità", "Lista coppie candidate", "Anteprima merge prima di confermare"] },
      { label: "Unire due contatti", steps: ["Select coppia", "Scegli record master", "Merge propagato a 22 tabelle + tombstone"] },
    ],
  },
  "/admin/data-quality": {
    title: "Data Quality (A6)",
    description: "Metriche qualità dati: completezza, validità, freschezza, duplicati. Trend storici.",
  },
  "/admin/changelog": {
    title: "Changelog & Runbook",
    description: "Tabs Changelog (rilasci) e Runbook (procedure operative). Bundla docs/ via Vite.",
  },
  "/admin/audit": {
    title: "Audit Log",
    description: "Audit unificato con hash chain SHA-256 (A3), append-only, masking PII, verify integrità.",
  },
  "/admin/capi-monitor": {
    title: "Meta CAPI Monitor",
    description: "Stato invii Conversions API: successi, errori, deduplicazione event_id, latenza.",
  },
  "/admin/setup": {
    title: "Admin Setup Wizard",
    description: "Wizard guidato per configurazione iniziale brand: integrazioni, ruoli, pipeline, default.",
  },
  "/admin/slow-queries": {
    title: "Slow Queries (Sprint 5)",
    description: "Top query lente da pg_stat_statements con badge severity e filtro. Admin-only.",
  },

  // ─────────────────────── MISC ───────────────────────
  "/notifications": {
    title: "Notifiche",
    description: "Centro notifiche unificato: lead, escalation, SLA, alert performance, push subscriptions.",
  },
  "/install": {
    title: "Installa App",
    description: "Installa il CRM come PWA per accesso rapido e offline.",
    tips: ["Chrome/Edge: pulsante Installa", "iOS: Condividi → Aggiungi a Home"],
  },
  "/select-brand": {
    title: "Selezione Brand",
    description: "Scegli il brand con cui lavorare. Ogni brand ha dati e configurazioni separate (multi-tenant).",
  },
};

export function PageHelpButton() {
  const location = useLocation();

  const getHelpContent = (): PageHelp | null => {
    // 1) match esatto
    if (pageHelpContent[location.pathname]) return pageHelpContent[location.pathname];

    // 2) match con pattern :param (es. /sales/performance-sheet/:userId)
    for (const [pattern, help] of Object.entries(pageHelpContent)) {
      if (!pattern.includes(":")) continue;
      const regex = new RegExp(
        "^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$"
      );
      if (regex.test(location.pathname)) return help;
    }

    // 3) fallback su parent path
    const pathParts = location.pathname.split("/");
    while (pathParts.length > 1) {
      pathParts.pop();
      const parentPath = pathParts.join("/") || "/";
      if (pageHelpContent[parentPath]) return pageHelpContent[parentPath];
    }
    return null;
  };

  const help = getHelpContent();
  if (!help) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Aiuto pagina"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{help.title}</SheetTitle>
          <SheetDescription className="text-sm leading-relaxed">
            {help.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {help.quickActions && help.quickActions.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Azioni più frequenti
              </h4>
              <ol className="space-y-4">
                {help.quickActions.slice(0, 3).map((action, idx) => (
                  <li key={idx} className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium">{action.label}</span>
                    </div>
                    <ul className="ml-7 space-y-1 list-disc text-sm text-muted-foreground marker:text-muted-foreground/60">
                      {action.steps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {help.tips && help.tips.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                Suggerimenti
              </h4>
              <ul className="space-y-1.5">
                {help.tips.map((tip, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5" aria-hidden="true">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {help.docsPath && (
            <section className="pt-4 border-t">
              <a
                href={`${DOCS_BASE}${help.docsPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Documentazione completa
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <p className="text-xs text-muted-foreground mt-1">
                Apre <code className="text-xs">docs/{help.docsPath}</code> in una nuova scheda.
              </p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
