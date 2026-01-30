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
    id: 'contacts',
    icon: Users,
    title: 'Contatti',
    description: 'Gestisci il tuo database clienti con ricerca avanzata e deduplicazione automatica.',
    steps: [
      'Vai alla sezione "Contatti" dalla sidebar',
      'Usa la barra di ricerca per trovare contatti esistenti',
      'Clicca "Nuovo Contatto" per aggiungere manualmente',
      'Il sistema verifica automaticamente i duplicati tramite telefono/email',
      'Clicca su un contatto per vedere tutti i dettagli e lo storico',
    ],
    tips: [
      'I contatti vengono creati automaticamente dai lead in ingresso',
      'Puoi esportare i contatti in CSV dalla tabella',
    ],
  },
  {
    id: 'events',
    icon: Inbox,
    title: 'Eventi (Inbox Lead)',
    description: 'Monitora tutti gli eventi in ingresso da webhook, Meta Ads e inserimenti manuali.',
    steps: [
      'Accedi alla sezione "Eventi" per vedere tutti i lead',
      'Filtra per sorgente, periodo o stato di archiviazione',
      'Ogni evento mostra il contatto associato e i dati grezzi',
      'Usa le azioni rapide per taggare o archiviare',
      'Clicca sull\'icona contatto per aprire la scheda dettaglio',
    ],
    tips: [
      'Gli eventi vengono processati dall\'AI per classificazione automatica',
      'I lead qualificati generano automaticamente ticket se necessario',
    ],
  },
  {
    id: 'pipeline',
    icon: Kanban,
    title: 'Pipeline (Deal)',
    description: 'Visualizza e gestisci le opportunità di vendita con la vista Kanban.',
    steps: [
      'Apri "Pipeline" per vedere la board Kanban',
      'Trascina le card tra le colonne per aggiornare lo stage',
      'Clicca su una card per vedere i dettagli del deal',
      'Usa il menu contestuale per Won/Lost/Archivia',
      'Su mobile, scorri orizzontalmente tra gli stage',
    ],
    tips: [
      'Ogni contatto può avere massimo un deal aperto per brand',
      'I nuovi lead creano automaticamente deal se non esistono',
    ],
  },
  {
    id: 'appointments',
    icon: Calendar,
    title: 'Appuntamenti',
    description: 'Pianifica e gestisci appuntamenti con i tuoi contatti.',
    steps: [
      'Vai su "Appuntamenti" per vedere la lista',
      'Clicca "Nuovo Appuntamento" per programmarne uno',
      'Seleziona contatto, data/ora e tipo (visita, call, ecc.)',
      'Gli appuntamenti sono collegati ai deal quando presenti',
      'Aggiorna lo stato (confermato, completato, cancellato)',
    ],
    tips: [
      'Gli appuntamenti oggi sono visibili anche nella Dashboard',
    ],
  },
  {
    id: 'tickets',
    icon: Ticket,
    title: 'Sistema Ticketing',
    description: 'Gestisci le richieste di supporto con SLA, priorità e assegnazione automatica.',
    steps: [
      'Accedi a "Ticket" per vedere tutte le code',
      'Usa i tab: Miei Ticket, Non assegnati, Scaduti SLA',
      'Cerca per nome, email, telefono o contenuto ticket',
      'Clicca "Prendi in carico" per auto-assegnarti un ticket',
      'Cambia stato, priorità e categoria dalla scheda dettaglio',
    ],
    tips: [
      'I ticket vengono creati automaticamente dall\'AI quando necessario',
      'Le SLA sono configurabili per priorità nelle Impostazioni',
      'Badge rosso in sidebar segnala breach SLA in tempo reale',
    ],
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics & Admin',
    description: 'Monitora le performance con dashboard dedicate (solo Admin/CEO).',
    steps: [
      'AI Metrics: monitora qualità classificazione AI',
      'KPI Call Center: performance operatori e tempi risposta',
      'Trend Ticket: volume ticket nel tempo per analisi',
      'Webhook Monitor: stato consegne webhook outbound',
      'Tutti i report sono esportabili in CSV',
    ],
    tips: [
      'I filtri per brand e periodo sono persistenti',
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Impostazioni',
    description: 'Configura il sistema: webhook, SLA, utenti e brand.',
    steps: [
      'Webhook Inbound: gestisci sorgenti lead con chiavi API',
      'Webhook Outbound: configura endpoint per eventi',
      'SLA: imposta soglie per priorità P1-P5',
      'Google Sheets: abilita export automatico lead',
      'Admin: gestisci brand e utenti (solo Admin)',
    ],
    tips: [
      'Le chiavi API vengono mostrate solo una volta alla creazione',
      'Ruota le chiavi periodicamente per sicurezza',
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
            <Lightbulb className="h-5 w-5 text-amber-500" />
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
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
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
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
                Versione 1.0 – M10 in corso
              </Badge>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
