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
  "/dashboard": {
    title: "Dashboard",
    description: "Panoramica delle attività: KPI principali, ticket urgenti, deal in pipeline e appuntamenti di oggi.",
    tips: [
      "I KPI si aggiornano in tempo reale",
      "Clicca su una card per andare alla sezione dettaglio",
      "La guida azione ti suggerisce la prossima mossa",
    ],
  },
  "/contacts": {
    title: "Contatti",
    description: "Database clienti con ricerca full-text, filtri avanzati e deduplicazione automatica via telefono/email.",
    quickActions: [
      { label: "Cercare un contatto", steps: ["Usa la barra di ricerca in alto", "Digita nome, telefono, email o città", "Filtra per stato o sorgente nel pannello laterale"] },
      { label: "Chiamare un contatto", steps: ["Apri il contatto", "Premi il pulsante telefono in alto", "La chiamata parte via VoIP (VOIspeed) se configurato, altrimenti via tel:"] },
      { label: "Vedere lo storico interazioni", steps: ["Apri il contatto", "Scorri alla sezione 'Timeline'", "Trovi chiamate, ticket, deal, eventi"] },
    ],
    tips: [
      "I contatti sono creati automaticamente dai lead in ingresso",
      "I duplicati vengono uniti per telefono normalizzato",
    ],
  },
  "/events": {
    title: "Eventi (Inbox Lead)",
    description: "Tutti i lead in ingresso: webhook, Meta Ads, manuali. L'AI li classifica automaticamente.",
    quickActions: [
      { label: "Filtrare i lead di oggi", steps: ["Clicca sul filtro periodo", "Seleziona 'Oggi'", "Ordina per ora di arrivo"] },
      { label: "Riprocessare un lead fallito", steps: ["Vai su Dead Letter Queue", "Identifica il motivo dell'errore", "Premi 'Riprocessa' dopo aver corretto la sorgente"] },
      { label: "Capire la classificazione AI", steps: ["Apri l'evento", "Leggi la sezione 'Decisione AI'", "Override manuale se necessario"] },
    ],
    docsPath: "inbound-webhooks.md",
  },
  "/pipeline": {
    title: "Pipeline (Kanban)",
    description: "Gestisci le trattative con la vista Kanban. Trascina i deal tra le fasi o scorri su mobile.",
    quickActions: [
      { label: "Spostare un deal di fase", steps: ["Trascina la card nella colonna desiderata", "Su mobile usa il menu '...'", "Lo storico viene loggato automaticamente"] },
      { label: "Filtrare per venditore", steps: ["Apri il filtro in alto", "Seleziona uno o più venditori", "Salva la vista per riusarla"] },
      { label: "Aggiungere una nota", steps: ["Apri il deal", "Scorri a 'Note e attività'", "Scrivi e salva (auto-save su blur)"] },
    ],
    tips: ["Ogni contatto ha max 1 deal aperto per brand"],
  },
  "/sales": {
    title: "Vendite",
    description: "Registra vendite e ordini. Collegali a deal esistenti o crea vendite rapide.",
    tips: [
      "Vendita rapida: senza deal esistente",
      "Puoi allegare documenti e ricevute",
    ],
  },
  "/appointments": {
    title: "Appuntamenti",
    description: "Calendario appuntamenti: visite, call, consulenze. Collegati a contatti e deal.",
    quickActions: [
      { label: "Creare un appuntamento", steps: ["Clicca '+ Nuovo appuntamento'", "Scegli contatto, data, tipo", "Assegna un venditore"] },
      { label: "Riassegnare in massa", steps: ["Tieni Ctrl/Cmd e clicca più appuntamenti", "Premi 'Riassegna'", "Scegli il nuovo venditore"] },
      { label: "Esportare in CSV", steps: ["Apri Calendar o Ops Board", "Premi il pulsante CSV", "Il file ha 15 colonne"] },
    ],
  },
  "/tickets": {
    title: "Ticket",
    description: "Sistema ticketing con SLA, priorità e code. Gestisci richieste e problemi clienti.",
    quickActions: [
      { label: "Prendere in carico un ticket", steps: ["Apri la coda 'Non assegnati'", "Clicca 'Prendi in carico' sul ticket", "Diventa l'owner e ricevi le notifiche"] },
      { label: "Capire la Priorità AI", steps: ["Hover sull'etichetta P. nella tabella", "Calcolata da urgenza + valore deal + SLA residuo", "Modificabile manualmente dal dettaglio"] },
      { label: "Risolvere uno SLA breach", steps: ["Filtra coda 'Scaduti SLA'", "Apri il ticket più urgente", "Chiama il contatto dal pulsante in alto"] },
    ],
    docsPath: "slo-sla.md",
  },
  "/chat": {
    title: "Chat Team",
    description: "Messaggistica interna: chat 1-to-1, gruppi e thread su deal/contatti.",
    tips: ["Crea gruppi per team o progetti", "Allega messaggi a deal specifici"],
  },
  "/azienda": {
    title: "Azienda",
    description: "Panoramica aziendale: fatturato, spese, budget e report finanziari.",
    tips: ["Visualizza trend mensili e annuali", "Margini = Vendite − Spese"],
  },
  "/marketing": {
    title: "Marketing",
    description: "Dashboard marketing: performance campagne, costi acquisizione e ROI.",
    docsPath: "meta-lead-ads.md",
    tips: ["Traccia costo per lead (CPL) per canale"],
  },
  "/settings": {
    title: "Impostazioni",
    description: "Configura il sistema: webhook, SLA, integrazioni, utenti e brand.",
    docsPath: "voispeed-integration.md",
    tips: ["Webhook: sorgenti lead e destinazioni", "VOIspeed: click-to-call VoIP"],
  },
  "/team": {
    title: "Team",
    description: "Gestisci il team: utenti, ruoli, assegnazioni e performance.",
    tips: ["Assegna ruoli per brand", "I ruoli inattivi non possono accedere"],
  },
  "/products": {
    title: "Prodotti",
    description: "Catalogo prodotti e servizi vendibili. Usali nelle vendite e preventivi.",
  },
  "/admin/ai": {
    title: "Gestione AI",
    description: "Configura il sistema AI: prompt, regole di classificazione e modalità operativa.",
    docsPath: "mcp-server-runbook.md",
  },
  "/admin/ai-metrics": {
    title: "AI Metrics",
    description: "Performance del sistema AI: accuratezza, latenza, override e feedback.",
    docsPath: "mcp-server-runbook.md",
  },
  "/admin/dlq": {
    title: "Dead Letter Queue",
    description: "Lead non processabili: errori parsing, dati mancanti o problemi tecnici.",
    quickActions: [
      { label: "Capire un errore", steps: ["Filtra per motivo (Per motivo)", "Clicca sull'entry per vedere il payload originale", "Identifica il campo mancante o non valido"] },
      { label: "Riprocessare un lead", steps: ["Correggi la sorgente o il payload", "Usa l'azione 'Riprocessa' nel dettaglio", "Verifica che entri in /events"] },
      { label: "Prevenire futuri errori", steps: ["Vai su Settings → Sorgenti webhook", "Aggiorna lo schema payload", "Aggiungi campi richiesti / mappature mancanti"] },
    ],
    docsPath: "inbound-webhooks.md",
  },
  "/admin/webhooks": {
    title: "Webhook Monitor",
    description: "Stato consegne webhook outbound: successi, errori e retry.",
    docsPath: "inbound-webhooks.md",
  },
  "/admin/ticket-trend": {
    title: "Trend Ticket",
    description: "Analisi storica ticket: volumi, tempi di risoluzione e SLA compliance.",
    docsPath: "slo-sla.md",
  },
  "/admin/callcenter-kpi": {
    title: "KPI Call Center",
    description: "Metriche del call center: chiamate, durata, esiti e performance operatori.",
  },
  "/admin/analytics": {
    title: "Analytics Avanzati",
    description: "Metriche strategiche: funnel, sorgenti, trend e velocità di conversione.",
  },
  "/notifications": {
    title: "Notifiche",
    description: "Centro notifiche: avvisi, assegnazioni, scadenze e aggiornamenti.",
  },
  "/install": {
    title: "Installa App",
    description: "Installa il CRM come app sul tuo dispositivo per accesso rapido e offline.",
    tips: ["Su Chrome/Edge: pulsante Installa", "Su iOS: Condividi → Aggiungi a Home"],
  },
  "/select-brand": {
    title: "Selezione Brand",
    description: "Scegli il brand con cui lavorare. Ogni brand ha dati e configurazioni separate.",
  },
};

export function PageHelpButton() {
  const location = useLocation();

  const getHelpContent = (): PageHelp | null => {
    if (pageHelpContent[location.pathname]) return pageHelpContent[location.pathname];
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
