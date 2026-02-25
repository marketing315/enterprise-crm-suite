import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  HelpCircle,
  Users,
  Inbox,
  Kanban,
  Calendar,
  Ticket,
  Settings,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Lightbulb,
  Zap,
  Shield,
  ShoppingCart,
  Megaphone,
  Smartphone,
  MessageCircle,
  Building2,
  Crown,
  TrendingUp,
  Package,
} from 'lucide-react';

interface TutorialSection {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  steps: string[];
  tips?: string[];
}

const tutorialSections: TutorialSection[] = [
  {
    id: 'dashboard',
    icon: BarChart3,
    title: 'Dashboard',
    description: 'Panoramica operativa con KPI, trend a 7 giorni e stato sistema in tempo reale.',
    steps: [
      'La dashboard si adatta al tuo ruolo (Admin, CEO, Sales Manager, Operatore, Venditore)',
      'Le KPI card mostrano Lead Oggi, Deal Aperti, Contatti, Appuntamenti e Ticket',
      'Il grafico "Andamento 7 Giorni" mostra Lead, Ticket e CPL giornaliero (se ci sono costi marketing)',
      '"Stato Sistema" monitora lo stato di Webhook, AI, SLA Checker in tempo reale',
      'Usa "Cambia Vista" per passare tra le dashboard disponibili per il tuo ruolo',
    ],
    tips: [
      'Il CPL nel grafico appare solo se hai costi marketing registrati (manuali o da Ads)',
      'L\'auto-refresh è configurabile (30s, 60s, 120s) dal selettore in alto',
      'La Guida Azioni suggerisce le prossime mosse in base ai dati reali',
    ],
  },
  {
    id: 'contacts',
    icon: Users,
    title: 'Contatti',
    description: 'Gestisci il tuo database clienti con ricerca avanzata, viste personalizzate e deduplicazione.',
    steps: [
      'Vai alla sezione "Contatti" dalla sidebar',
      'Usa la barra di ricerca per trovare contatti per nome, telefono o email',
      'Clicca "Nuovo Contatto" per aggiungerne uno manualmente',
      'Il sistema verifica automaticamente i duplicati tramite telefono/email',
      'Clicca su un contatto per vedere dettagli, storico chiamate, deal e tag',
    ],
    tips: [
      'I contatti vengono creati automaticamente dai lead in ingresso via webhook',
      'Puoi creare e salvare "Viste" personalizzate con colonne e filtri preferiti',
      'Esporta i contatti in CSV dalla tabella',
      'I campi personalizzati si configurano in Impostazioni → Campi Custom',
      'Usa le azioni bulk per taggare o assegnare più contatti contemporaneamente',
    ],
  },
  {
    id: 'events',
    icon: Inbox,
    title: 'Eventi (Inbox Lead)',
    description: 'Monitora tutti gli eventi in ingresso da webhook, Meta Ads e inserimenti manuali.',
    steps: [
      'Accedi alla sezione "Eventi" per vedere tutti i lead ricevuti',
      'Filtra per sorgente, periodo o stato di archiviazione',
      'Ogni evento mostra il contatto associato, sorgente e dati grezzi',
      'Usa le azioni rapide per taggare o archiviare singoli eventi',
      'Clicca sull\'icona contatto per aprire la scheda dettaglio completa',
    ],
    tips: [
      'L\'AI classifica automaticamente ogni lead (priorità, tag, pipeline stage)',
      'I lead qualificati generano ticket o appuntamenti se necessario',
      'I topic clinici vengono estratti automaticamente dal testo del lead',
      'Puoi sovrascrivere le decisioni AI con un click e motivare il cambio',
    ],
  },
  {
    id: 'pipeline',
    icon: Kanban,
    title: 'Pipeline (Deal)',
    description: 'Visualizza e gestisci le opportunità di vendita con vista Kanban drag-and-drop.',
    steps: [
      'Apri "Pipeline" per vedere la board Kanban con gli stage personalizzabili',
      'Trascina le card tra le colonne per aggiornare lo stage del deal',
      'Clicca su una card per vedere dettagli, storico stage, contatto e suggerimenti AI',
      'Usa il menu contestuale per Won/Lost/Archivia',
      'Filtra per venditore, campagna marketing, tag o valore deal',
    ],
    tips: [
      'Ogni contatto può avere massimo un deal aperto per brand',
      'I nuovi lead creano automaticamente deal se non esistono',
      'Lo score del deal viene calcolato dall\'AI per prioritizzare le opportunità',
      'Gli stage sono personalizzabili da Impostazioni → Stage Pipeline',
      'Su mobile, scorri orizzontalmente tra gli stage',
    ],
  },
  {
    id: 'appointments',
    icon: Calendar,
    title: 'Appuntamenti',
    description: 'Pianifica e gestisci appuntamenti con i tuoi contatti, collegati ai deal.',
    steps: [
      'Vai su "Appuntamenti" per vedere la lista completa',
      'Clicca "Nuovo Appuntamento" per programmarne uno',
      'Seleziona contatto, data/ora, tipo (visita, call, videochiamata)',
      'Gli appuntamenti sono collegati ai deal quando presenti',
      'Aggiorna lo stato: confermato, visitato, completato o cancellato',
    ],
    tips: [
      'Gli appuntamenti oggi sono visibili nel KPI della Dashboard',
      'Puoi specificare indirizzo, CAP e città per visite a domicilio',
      'I topic clinici aiutano a preparare la visita',
      'L\'AI può creare appuntamenti automaticamente dai lead in ingresso',
    ],
  },
  {
    id: 'tickets',
    icon: Ticket,
    title: 'Sistema Ticketing',
    description: 'Gestisci richieste di supporto con SLA, priorità, code e assegnazione automatica.',
    steps: [
      'Accedi a "Ticket" per vedere tutte le code',
      'Usa i tab: Miei Ticket, Non assegnati, Tutti, Scaduti SLA',
      'Cerca per nome, email, telefono o contenuto del ticket',
      'Clicca "Prendi in carico" per auto-assegnarti un ticket',
      'Cambia stato, priorità e categoria dalla scheda dettaglio',
    ],
    tips: [
      'I ticket vengono creati automaticamente dall\'AI quando necessario',
      'Le SLA sono configurabili per priorità (P1-P5) nelle Impostazioni',
      'Badge rosso nella sidebar segnala breach SLA in tempo reale',
      'Usa le azioni bulk per chiudere o riassegnare più ticket insieme',
      'La timeline audit mostra ogni cambio di stato e assegnazione',
    ],
  },
  {
    id: 'sales',
    icon: ShoppingCart,
    title: 'Vendite & Ordini',
    description: 'Registra vendite, crea ordini e monitora il fatturato con piani di pagamento.',
    steps: [
      'Vai su "Vendite" per vedere tutti gli ordini di vendita',
      'Usa "Vendita Rapida" per registrare una vendita senza deal',
      'Collega vendite a deal esistenti per tracking completo',
      'Aggiungi prodotti dal catalogo con quantità e sconti',
      'Configura metodo di pagamento: singolo, a rate o noleggio',
    ],
    tips: [
      'I totali e i valori deal si aggiornano automaticamente',
      'Per pagamenti a rate/noleggio devi specificare tutti i metadati obbligatori',
      'Le vendite aggiornano i KPI venditori in tempo reale',
      'Puoi allegare documenti e ricevute usando il parsing OCR',
    ],
  },
  {
    id: 'chat',
    icon: MessageCircle,
    title: 'Chat Interna',
    description: 'Comunicazione interna del team con chat dirette, di gruppo e assistente AI.',
    steps: [
      'Apri "Chat" dalla sidebar per vedere tutte le conversazioni',
      'Avvia una chat diretta con un membro del team',
      'Crea un gruppo con "Nuovo Gruppo" per team o progetti',
      'Usa la chat AI integrata per domande rapide sui dati CRM',
      'Le chat possono essere collegate a contatti o deal specifici',
    ],
    tips: [
      'L\'assistente AI può rispondere a domande sui tuoi dati (contatti, deal, ticket)',
      'Le notifiche di nuovi messaggi appaiono nella campanella',
      'I gruppi hanno impostazioni configurabili (nome, membri, admin)',
    ],
  },
  {
    id: 'company',
    icon: Building2,
    title: 'Azienda',
    description: 'Panoramica finanziaria e operativa dell\'azienda con budget, costi e report.',
    steps: [
      'Vai su "Azienda" per la panoramica finanziaria',
      'Overview: KPI chiave dell\'azienda aggregati per tutti i brand',
      'Budget: imposta e monitora il budget annuale/mensile',
      'Spese: registra e categorizza le spese operative',
      'Report: genera report finanziari e di performance',
    ],
    tips: [
      'Accessibile solo a ruoli Admin, CEO e Amministrazione',
      'I dati si aggregano automaticamente da tutti i brand',
      'Il budget baseline permette di confrontare previsioni vs. realtà',
    ],
  },
  {
    id: 'ceo-dashboard',
    icon: Crown,
    title: 'Dashboard CEO',
    description: 'Supervisione strategica con KPI finanziari, pipeline breakdown e controllo operativo.',
    steps: [
      'Accedi da "Dashboard CEO" nella sezione Amministrazione',
      'Usa il selettore di periodo (1A, 6M, 3M, 1M, 7G o date custom)',
      'Le KPI card mostrano revenue, costi, margine e conversioni',
      'Il breakdown pipeline mostra il valore per ogni fase',
      'Le card operative danno accesso rapido a Contatti, Ticket, Deal e Appuntamenti',
    ],
    tips: [
      'Tutti i KPI sono calcolati via RPC ottimizzata per performance',
      'Supporta la vista multi-brand o singolo brand',
      'I pannelli Costi e Budget sono editabili inline',
      'Ogni sezione ha un tasto "Dettagli" per navigare al modulo specifico',
    ],
  },
  {
    id: 'marketing',
    icon: Megaphone,
    title: 'Marketing & Campagne',
    description: 'Gestisci campagne, monitora costi, CPL e analizza il ROI per canale.',
    steps: [
      'Dashboard: panoramica performance e KPI marketing',
      'Campagne: crea e gestisci campagne con gruppi e tag',
      'Costi: registra spese manuali per canale e campagna',
      'Statistiche ADV: importa automaticamente dati Meta/Google Ads',
      'Report: analisi CPL effettivo, conversion rate e attribuzione lead',
    ],
    tips: [
      'Integra Meta Ads per import automatico di statistiche e creatività',
      'Il CPL effettivo si calcola incrociando spesa reale e lead attribuiti via webhook',
      'La tabella CPL mostra il dettaglio per campagna con match type (Exact/Group/Unmapped)',
      'Usa il Date Range Picker per filtrare per periodo specifico',
      'Le campagne senza spesa nel periodo vengono nascoste automaticamente',
    ],
  },
  {
    id: 'team',
    icon: Users,
    title: 'Team & Ruoli',
    description: 'Gestisci utenti, ruoli, assegnazioni e permessi per brand.',
    steps: [
      'Vai su "Team" nella sezione Amministrazione',
      'Visualizza tutti i membri del team con ruolo e brand assegnato',
      'Invita nuovi utenti con "Invita Utente" specificando ruolo e brand',
      'Resetta la password di un utente dal menu azioni',
      'Configura la visibilità dei dati per ogni utente',
    ],
    tips: [
      'I ruoli disponibili: Admin, CEO, Sales Manager, Venditore, Operatore, Amministrazione',
      'Ogni utente può avere ruoli diversi per brand diversi',
      'Gli Admin vedono tutti i dati, gli operatori solo quelli del proprio brand',
    ],
  },
  {
    id: 'salesperson-kpi',
    icon: TrendingUp,
    title: 'KPI Venditori',
    description: 'Monitora le performance individuali dei venditori con metriche dettagliate.',
    steps: [
      'Vai su "KPI Venditori" nella sezione Amministrazione',
      'Seleziona il periodo da analizzare',
      'Le KPI card mostrano deal chiusi, valore totale, conversion rate',
      'La tabella confronta i venditori tra loro',
      'Clicca su un venditore per il dettaglio completo',
    ],
    tips: [
      'I dati si aggiornano in tempo reale con ogni vendita o cambio deal',
      'Utile per review settimanali e coaching',
      'I venditori vedono solo i propri KPI, i manager vedono tutto il team',
    ],
  },
  {
    id: 'products',
    icon: Package,
    title: 'Prodotti',
    description: 'Gestisci il catalogo prodotti e servizi utilizzati negli ordini di vendita.',
    steps: [
      'Vai su "Prodotti" nella sezione Amministrazione',
      'Aggiungi prodotti con nome, prezzo, descrizione e categoria',
      'I prodotti sono disponibili nella creazione ordini di vendita',
      'Modifica prezzo e dettagli in qualsiasi momento',
      'I prodotti sono associati al brand selezionato',
    ],
    tips: [
      'Crea un catalogo completo per velocizzare la creazione ordini',
      'I prezzi nei prodotti sono i prezzi di listino, applicabili con sconti negli ordini',
    ],
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics Avanzati',
    description: 'Dashboard strategiche per Admin con funnel, AI metrics, trend e webhook monitor.',
    steps: [
      'Analytics: funnel marketing a 7 stadi, perdite e velocità deal',
      'AI Metrics: qualità classificazione, latenza, override e feedback',
      'KPI Call Center: performance operatori, tempi risposta, ricontatti',
      'Trend Ticket: volume ticket nel tempo per analisi stagionale',
      'Webhook Monitor: stato consegne, errori e DLQ',
    ],
    tips: [
      'Tutti i report sono esportabili in CSV (separatore ; per Excel)',
      'I filtri per brand e periodo sono persistenti tra sessioni',
      'Il CAPI Monitor traccia gli eventi inviati a Meta Conversions API',
      'DLQ Dashboard: controlla i lead non processati e ritenta l\'invio',
    ],
  },
  {
    id: 'pwa',
    icon: Smartphone,
    title: 'App Mobile (PWA)',
    description: 'Installa il CRM come app per accesso rapido da smartphone e tablet.',
    steps: [
      'Vai su /install per le istruzioni dettagliate',
      'Chrome/Edge: clicca "Installa" nella barra indirizzi',
      'iOS Safari: Condividi → Aggiungi a schermata Home',
      'L\'app si aggiorna automaticamente ad ogni rilascio',
      'I dati recenti sono disponibili anche offline',
    ],
    tips: [
      'La pipeline usa lo swipe orizzontale su mobile',
      'Le notifiche push arrivano anche con l\'app chiusa',
      'L\'esperienza è ottimizzata per schermi touch',
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Impostazioni',
    description: 'Configura webhook, SLA, automazioni, integrazioni e governance del sistema.',
    steps: [
      'Webhook Inbound: gestisci sorgenti lead con chiavi API dedicate',
      'Webhook Outbound: configura endpoint per eventi in uscita',
      'Automazioni: regole automatiche per notifiche, tag e azioni',
      'SLA: imposta soglie di risposta per priorità P1-P5',
      'Meta Apps: configura l\'integrazione con Meta Lead Ads',
      'Google Sheets: abilita export automatico lead su fogli',
      'VOIspeed: configura click-to-call VoIP',
      'Admin: gestisci brand, utenti e governance moduli',
    ],
    tips: [
      'Le chiavi API vengono mostrate solo una volta alla creazione',
      'Ruota le chiavi periodicamente per sicurezza',
      'Le automazioni supportano azioni multiple in sequenza',
      'I campi personalizzati sono configurabili per brand',
      'I moduli possono essere congelati (frozen) per impedire modifiche',
    ],
  },
];
export function TutorialSheet() {
  const [openSections, setOpenSections] = useState<string[]>(['contacts']);

  const toggleSection = (id: string) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Guida CRM</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Tutorial CRM Enterprise
          </SheetTitle>
          <SheetDescription>
            Guida completa per utilizzare tutte le funzionalità del sistema.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)] pr-4">
          <div className="space-y-3">
            {/* Quick Start Card */}
            <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Quick Start</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    1. Seleziona un brand dalla sidebar<br />
                    2. I lead arrivano automaticamente via webhook<br />
                    3. Gestisci ticket e deal dalle rispettive sezioni
                  </p>
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong>Nota sicurezza:</strong> Tutti i dati sono isolati per brand. 
                  Gli operatori vedono solo i dati dei brand a cui sono assegnati.
                </p>
              </div>
            </div>

            {/* Tutorial Sections */}
            {tutorialSections.map((section) => {
              const Icon = section.icon;
              const isOpen = openSections.includes(section.id);

              return (
                <Collapsible
                  key={section.id}
                  open={isOpen}
                  onOpenChange={() => toggleSection(section.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-primary/10 p-2">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-medium text-sm">{section.title}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {section.description}
                            </p>
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-lg border bg-muted/30 p-4 space-y-4">
                      {/* Steps */}
                      <div>
                        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Come fare
                        </h5>
                        <ol className="space-y-2">
                          {section.steps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                                {idx + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Tips */}
                      {section.tips && section.tips.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                            Suggerimenti
                          </h5>
                          <ul className="space-y-1.5">
                            {section.tips.map((tip, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {/* Footer */}
            <div className="pt-4 pb-2 text-center">
              <Badge variant="secondary" className="text-xs">
                Versione 2.0 – Guida Completa
              </Badge>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
