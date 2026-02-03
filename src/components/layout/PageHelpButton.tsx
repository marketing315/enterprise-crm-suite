import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocation } from "react-router-dom";

interface PageHelp {
  title: string;
  description: string;
  tips?: string[];
}

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
    tips: [
      "Usa la ricerca per nome, telefono, email o città",
      "I contatti sono creati automaticamente dai lead",
      "Clicca su un contatto per vedere lo storico completo",
    ],
  },
  "/events": {
    title: "Eventi (Inbox Lead)",
    description: "Tutti i lead in ingresso: webhook, Meta Ads, manuali. L'AI li classifica automaticamente.",
    tips: [
      "Filtra per sorgente o periodo",
      "L'AI analizza ogni evento e decide le azioni",
      "Gli eventi qualificati generano ticket o deal",
    ],
  },
  "/pipeline": {
    title: "Pipeline (Kanban)",
    description: "Gestisci le trattative con la vista Kanban. Trascina i deal tra le fasi o scorri su mobile.",
    tips: [
      "Ogni contatto ha max 1 deal aperto per brand",
      "Clicca su un deal per vedere note e storico",
      "Usa i filtri per venditore o campagna",
    ],
  },
  "/sales": {
    title: "Vendite",
    description: "Registra vendite e ordini. Collegali a deal esistenti o crea vendite rapide.",
    tips: [
      "Vendita rapida: senza deal esistente",
      "Puoi allegare documenti e ricevute",
      "I totali si aggiornano automaticamente",
    ],
  },
  "/appointments": {
    title: "Appuntamenti",
    description: "Calendario appuntamenti: visite, call, consulenze. Collegati a contatti e deal.",
    tips: [
      "Gli appuntamenti di oggi appaiono in dashboard",
      "Puoi assegnare appuntamenti ai venditori",
      "Tipi: prima visita, follow-up, consulenza",
    ],
  },
  "/tickets": {
    title: "Ticket",
    description: "Sistema ticketing con SLA, priorità e code. Gestisci richieste e problemi clienti.",
    tips: [
      "SLA: tempi massimi di risposta per priorità",
      "Badge rosso = ticket in breach SLA",
      "Usa 'Prendi in carico' per auto-assegnarti",
    ],
  },
  "/chat": {
    title: "Chat Team",
    description: "Messaggistica interna: chat 1-to-1, gruppi e thread su deal/contatti.",
    tips: [
      "Crea gruppi per team o progetti",
      "Allega messaggi a deal specifici",
      "Le notifiche sono in tempo reale",
    ],
  },
  "/azienda": {
    title: "Azienda",
    description: "Panoramica aziendale: fatturato, spese, budget e report finanziari.",
    tips: [
      "Visualizza trend mensili e annuali",
      "Confronta budget vs spese effettive",
      "Esporta report per la contabilità",
    ],
  },
  "/azienda/budget": {
    title: "Budget Aziendale",
    description: "Pianifica e monitora il budget per categoria e periodo.",
    tips: [
      "Crea budget mensili o annuali",
      "Confronta pianificato vs effettivo",
      "Imposta alert per sforamenti",
    ],
  },
  "/azienda/spese": {
    title: "Spese Aziendali",
    description: "Registra e categorizza le spese operative.",
    tips: [
      "Allega ricevute e fatture",
      "Categorizza per tipo di spesa",
      "Esporta per la contabilità",
    ],
  },
  "/azienda/report": {
    title: "Report Aziendali",
    description: "Analisi finanziarie: margini, cash flow e trend.",
    tips: [
      "Genera report su misura",
      "Confronta periodi diversi",
      "Esporta in PDF o Excel",
    ],
  },
  "/marketing": {
    title: "Marketing",
    description: "Dashboard marketing: performance campagne, costi acquisizione e ROI.",
    tips: [
      "Collega campagne ai lead in ingresso",
      "Traccia costo per lead (CPL)",
      "Analizza performance per canale",
    ],
  },
  "/marketing/campagne": {
    title: "Campagne Marketing",
    description: "Gestisci le campagne pubblicitarie: budget, target e creatività.",
    tips: [
      "Crea campagne per canale (Meta, Google, ecc.)",
      "Traccia i lead generati per campagna",
      "Monitora il ROI di ogni campagna",
    ],
  },
  "/marketing/costi": {
    title: "Costi Marketing",
    description: "Traccia tutte le spese marketing: ads, creatività, tool.",
    tips: [
      "Registra spese giornaliere o mensili",
      "Collega costi a campagne specifiche",
      "Analizza CPL e CAC",
    ],
  },
  "/marketing/report": {
    title: "Report Marketing",
    description: "Analisi dettagliate: funnel, conversioni e attribuzione.",
    tips: [
      "Analizza il funnel completo",
      "Confronta performance tra campagne",
      "Esporta per presentazioni",
    ],
  },
  "/settings": {
    title: "Impostazioni",
    description: "Configura il sistema: webhook, SLA, integrazioni, utenti e brand.",
    tips: [
      "Webhook: sorgenti lead e destinazioni",
      "SLA: soglie per priorità P1-P5",
      "VOIspeed: click-to-call VoIP",
    ],
  },
  "/team": {
    title: "Team",
    description: "Gestisci il team: utenti, ruoli, assegnazioni e performance.",
    tips: [
      "Assegna ruoli per brand",
      "Monitora le performance individuali",
      "Invita nuovi membri via email",
    ],
  },
  "/team/salespersons": {
    title: "KPI Venditori",
    description: "Performance dettagliate dei venditori: deal chiusi, revenue e conversion rate.",
    tips: [
      "Confronta venditori per periodo",
      "Analizza conversion rate individuale",
      "Identifica top performer",
    ],
  },
  "/products": {
    title: "Prodotti",
    description: "Catalogo prodotti e servizi vendibili. Usali nelle vendite e preventivi.",
    tips: [
      "Crea categorie per organizzare",
      "Imposta prezzi e sconti",
      "Collega ai deal per preventivi",
    ],
  },
  "/admin/ai": {
    title: "Gestione AI",
    description: "Configura il sistema AI: prompt, regole di classificazione e modalità operativa.",
    tips: [
      "Modalità: auto, suggerimento, off",
      "Personalizza i prompt per il tuo business",
      "Monitora le decisioni AI",
    ],
  },
  "/admin/ai-metrics": {
    title: "AI Metrics",
    description: "Performance del sistema AI: accuratezza, latenza, override e feedback.",
    tips: [
      "Analizza i casi di override",
      "Monitora la latenza media",
      "Identifica pattern di errore",
    ],
  },
  "/admin/analytics": {
    title: "Analytics Avanzati",
    description: "Metriche strategiche: funnel, sorgenti, trend e velocità di conversione.",
    tips: [
      "Analizza il funnel di vendita",
      "Confronta performance sorgenti",
      "Monitora trend temporali",
    ],
  },
  "/admin/callcenter-kpi": {
    title: "KPI Call Center",
    description: "Metriche del call center: chiamate, durata, esiti e performance operatori.",
    tips: [
      "Monitora volume chiamate per ora",
      "Analizza durata media conversazioni",
      "Confronta performance operatori",
    ],
  },
  "/admin/ticket-trend": {
    title: "Trend Ticket",
    description: "Analisi storica ticket: volumi, tempi di risoluzione e SLA compliance.",
    tips: [
      "Visualizza trend per periodo",
      "Analizza distribuzione priorità",
      "Monitora SLA compliance nel tempo",
    ],
  },
  "/admin/webhooks": {
    title: "Webhook Monitor",
    description: "Stato consegne webhook outbound: successi, errori e retry.",
    tips: [
      "Monitora delivery rate",
      "Analizza errori per endpoint",
      "Riprova manualmente i falliti",
    ],
  },
  "/admin/dlq": {
    title: "Dead Letter Queue",
    description: "Lead non processabili: errori parsing, dati mancanti o problemi tecnici.",
    tips: [
      "Analizza la causa dell'errore",
      "Riprocessa manualmente se possibile",
      "Correggi le sorgenti problematiche",
    ],
  },
  "/notifications": {
    title: "Notifiche",
    description: "Centro notifiche: avvisi, assegnazioni, scadenze e aggiornamenti.",
    tips: [
      "Configura le preferenze in Impostazioni",
      "Le notifiche critiche sono sempre visibili",
      "Clicca per andare al contesto",
    ],
  },
  "/install": {
    title: "Installa App",
    description: "Installa il CRM come app sul tuo dispositivo per accesso rapido e offline.",
    tips: [
      "Su Chrome/Edge: pulsante Installa",
      "Su iOS: Condividi → Aggiungi a Home",
      "L'app funziona anche offline",
    ],
  },
  "/select-brand": {
    title: "Selezione Brand",
    description: "Scegli il brand con cui lavorare. Ogni brand ha dati e configurazioni separate.",
    tips: [
      "Puoi cambiare brand in qualsiasi momento",
      "I dati sono isolati per brand",
      "Admin e CEO vedono tutti i brand",
    ],
  },
};

export function PageHelpButton() {
  const location = useLocation();
  
  // Find the matching help content
  const getHelpContent = (): PageHelp | null => {
    // Try exact match first
    if (pageHelpContent[location.pathname]) {
      return pageHelpContent[location.pathname];
    }
    
    // Try prefix match for nested routes
    const pathParts = location.pathname.split('/');
    while (pathParts.length > 1) {
      pathParts.pop();
      const parentPath = pathParts.join('/') || '/';
      if (pageHelpContent[parentPath]) {
        return pageHelpContent[parentPath];
      }
    }
    
    return null;
  };

  const helpContent = getHelpContent();

  if (!helpContent) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Aiuto pagina"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="bottom" 
        align="end" 
        className="w-80"
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm">{helpContent.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {helpContent.description}
            </p>
          </div>
          
          {helpContent.tips && helpContent.tips.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Suggerimenti
              </p>
              <ul className="space-y-1">
                {helpContent.tips.map((tip, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
