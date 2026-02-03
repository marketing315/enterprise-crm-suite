import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Zap, 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  HelpCircle,
  Target,
  Clock,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  path?: string;
  description?: string;
}

interface ActionGuideProps {
  openDeals?: number;
  newDeals?: number;
  openTickets?: number;
  slaBreaches?: number;
}

export function ActionGuide({ 
  openDeals = 0, 
  newDeals = 0, 
  openTickets = 0,
  slaBreaches = 0 
}: ActionGuideProps) {
  const navigate = useNavigate();
  const { isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  
  const [completedItems, setCompletedItems] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("crm_action_guide_completed");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Determine user role for personalized CTA
  const isResponsabile = currentBrand && (
    hasRole('responsabile_venditori', currentBrand.id) || 
    hasRole('responsabile_callcenter', currentBrand.id)
  );
  const isVenditore = currentBrand && hasRole('venditore', currentBrand.id);
  const isOperatore = currentBrand && hasRole('operatore_callcenter', currentBrand.id);

  // Loss aversion messaging based on stale data
  const lossMessage = useMemo(() => {
    if (newDeals > 5) {
      return {
        text: `⚠️ ${newDeals} lead stanno raffreddandosi — ogni ora di attesa riduce del 10% la probabilità di chiusura`,
        severity: "high" as const,
      };
    }
    if (newDeals > 2) {
      return {
        text: `${newDeals} lead in attesa — i contatti tempestivi convertono 7x di più`,
        severity: "medium" as const,
      };
    }
    if (slaBreaches > 0) {
      return {
        text: `${slaBreaches} ticket hanno superato l'SLA — rischio perdita cliente`,
        severity: "high" as const,
      };
    }
    return null;
  }, [newDeals, slaBreaches]);

  // Dynamic primary CTA based on role and data with urgency copy
  const primaryCta = useMemo(() => {
    if (slaBreaches > 0) {
      return {
        label: `🔴 ${slaBreaches} ticket scaduti — intervieni ora`,
        path: "/tickets?queue=breached",
        icon: Clock,
        variant: "destructive" as const,
        urgency: "Ogni minuto conta per la soddisfazione cliente",
      };
    }
    
    if (isAdmin || isCeo || isResponsabile) {
      if (newDeals > 3) {
        return {
          label: `Riassegna ${Math.min(newDeals, 5)} deal prima che si raffreddino`,
          path: "/pipeline",
          icon: Target,
          variant: "default" as const,
          urgency: "Lead non gestiti = opportunità perse",
        };
      }
    }
    
    if (isVenditore) {
      return {
        label: "🔥 Lavora i tuoi deal più caldi",
        path: "/pipeline",
        icon: TrendingUp,
        variant: "default" as const,
        urgency: "Chi aggiorna oggi, chiude domani",
      };
    }
    
    if (isOperatore) {
      if (openTickets > 0) {
        return {
          label: `📞 ${Math.min(openTickets, 5)} clienti aspettano te`,
          path: "/tickets",
          icon: Zap,
          variant: "default" as const,
          urgency: "Risposta veloce = cliente fedele",
        };
      }
    }

    return {
      label: "Controlla la pipeline",
      path: "/pipeline",
      icon: Target,
      variant: "default" as const,
      urgency: "Inizia con un'azione veloce",
    };
  }, [slaBreaches, newDeals, openTickets, isAdmin, isCeo, isResponsabile, isVenditore, isOperatore]);

  // Checklist items with Zeigarnik effect (incomplete tasks create tension)
  const checklistItems: ChecklistItem[] = useMemo(() => [
    {
      id: "brand",
      label: "✓ Seleziona il brand di lavoro",
      completed: hasBrandSelected && !isAllBrandsSelected,
      description: "Focus = risultati. Un brand alla volta.",
    },
    {
      id: "new_deals",
      label: newDeals > 0 
        ? `⏳ ${newDeals} lead nuovi da gestire` 
        : "✓ Nessun lead in attesa",
      completed: completedItems.has("new_deals") || newDeals === 0,
      path: "/pipeline",
      description: newDeals > 0 
        ? "Ogni ora che passa, la probabilità di conversione cala del 10%"
        : "Ottimo! Pipeline pulita",
    },
    {
      id: "move_deal",
      label: "🎯 Sposta almeno 1 deal oggi",
      completed: completedItems.has("move_deal"),
      path: "/pipeline",
      description: "Chi muove 1 deal al giorno, chiude 5x di più al mese",
    },
    {
      id: "won_deal",
      label: "🏆 Registra una vittoria",
      completed: completedItems.has("won_deal"),
      path: "/pipeline",
      description: "Ogni deal chiuso rafforza la tua pipeline futura",
    },
    {
      id: "quick_sale",
      label: "💰 Registra una vendita",
      completed: completedItems.has("quick_sale"),
      path: "/sales",
      description: "Traccia subito = report accurati = bonus giusto",
    },
  ], [hasBrandSelected, isAllBrandsSelected, completedItems, newDeals]);

  const completedCount = checklistItems.filter(i => i.completed).length;
  const progress = (completedCount / checklistItems.length) * 100;

  const toggleItem = (id: string) => {
    setCompletedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem("crm_action_guide_completed", JSON.stringify([...next]));
      return next;
    });
  };

  const handleItemClick = (item: ChecklistItem) => {
    if (item.path) {
      navigate(item.path);
    }
    if (!item.completed && item.id !== "brand") {
      toggleItem(item.id);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              La tua prossima mossa vincente
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              2 minuti ora = ore risparmiate domani. Inizia con una sola azione.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="font-medium mb-1">Perché questa guida?</p>
                <p className="text-sm text-muted-foreground mb-2">
                  I venditori top completano queste azioni ogni giorno. 
                  Non è fortuna: è metodo.
                </p>
                <p className="font-medium mb-1">Cos'è un deal?</p>
                <p className="text-sm text-muted-foreground">
                  Una trattativa con valore e fase. Pipeline ordinata = più chiusure.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Loss aversion alert */}
        {lossMessage && (
          <div className={`text-sm p-3 rounded-lg flex items-start gap-2 ${
            lossMessage.severity === "high" 
              ? "bg-destructive/10 text-destructive border border-destructive/20" 
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
          }`}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{lossMessage.text}</span>
          </div>
        )}

        {/* Primary CTA with urgency subtitle */}
        <div className="space-y-1">
          <Button 
            className="w-full justify-between group"
            variant={primaryCta.variant}
            size="lg"
            onClick={() => navigate(primaryCta.path)}
          >
            <span className="flex items-center gap-2">
              <primaryCta.icon className="h-5 w-5" />
              {primaryCta.label}
            </span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
          <p className="text-xs text-muted-foreground text-center italic">
            {primaryCta.urgency}
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progresso giornaliero</span>
            <Badge variant="secondary">{completedCount}/{checklistItems.length}</Badge>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Checklist */}
        <div className="space-y-1">
          {checklistItems.map((item) => (
            <TooltipProvider key={item.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors hover:bg-muted/50 ${
                      item.completed ? "text-muted-foreground" : ""
                    }`}
                    onClick={() => handleItemClick(item)}
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={`flex-1 text-sm ${item.completed ? "line-through" : ""}`}>
                      {item.label}
                    </span>
                    {item.path && !item.completed && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </TooltipTrigger>
                {item.description && (
                  <TooltipContent side="right">
                    <p className="text-sm">{item.description}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Motivational tips - rotating */}
        <div className="pt-2 border-t">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lightbulb className="h-3 w-3 mt-0.5 text-primary shrink-0" />
            <p className="italic">
              {progress === 100 
                ? "🎉 Giornata completata! Sei nel top 10% dei performer."
                : progress >= 60
                ? "Ottimo ritmo! Ancora qualche spunta e la giornata è tua."
                : "Piccoli passi ogni giorno = grandi risultati ogni mese."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}