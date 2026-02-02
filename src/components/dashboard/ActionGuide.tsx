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
  ArrowRight
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
    // Load from localStorage
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

  // Dynamic primary CTA based on role and data
  const primaryCta = useMemo(() => {
    if (slaBreaches > 0) {
      return {
        label: `Gestisci ${slaBreaches} ticket scaduti`,
        path: "/tickets?queue=breached",
        icon: Clock,
        variant: "destructive" as const,
      };
    }
    
    if (isAdmin || isCeo || isResponsabile) {
      if (newDeals > 3) {
        return {
          label: `Riassegna ${Math.min(newDeals, 5)} deal nuovi`,
          path: "/pipeline",
          icon: Target,
          variant: "default" as const,
        };
      }
    }
    
    if (isVenditore) {
      return {
        label: "Aggiorna i tuoi deal più caldi",
        path: "/pipeline",
        icon: TrendingUp,
        variant: "default" as const,
      };
    }
    
    if (isOperatore) {
      if (openTickets > 0) {
        return {
          label: `Smaltisci ${Math.min(openTickets, 5)} ticket`,
          path: "/tickets",
          icon: Zap,
          variant: "default" as const,
        };
      }
    }

    return {
      label: "Controlla la pipeline",
      path: "/pipeline",
      icon: Target,
      variant: "default" as const,
    };
  }, [slaBreaches, newDeals, openTickets, isAdmin, isCeo, isResponsabile, isVenditore, isOperatore]);

  // Checklist items
  const checklistItems: ChecklistItem[] = useMemo(() => [
    {
      id: "brand",
      label: "Seleziona il brand giusto",
      completed: hasBrandSelected && !isAllBrandsSelected,
      description: "Un brand specifico ti dà focus sulle tue attività",
    },
    {
      id: "new_deals",
      label: "Controlla i deal in 'Nuovo'",
      completed: completedItems.has("new_deals") || newDeals === 0,
      path: "/pipeline",
      description: "I deal nuovi si raffreddano: agisci oggi!",
    },
    {
      id: "move_deal",
      label: "Sposta 1 deal in lavorazione",
      completed: completedItems.has("move_deal"),
      path: "/pipeline",
      description: "Aggiungi una nota per non dimenticare il prossimo passo",
    },
    {
      id: "won_deal",
      label: "Segna un deal come 'Vinto'",
      completed: completedItems.has("won_deal"),
      path: "/pipeline",
      description: "Celebra ogni vittoria, anche piccola!",
    },
    {
      id: "quick_sale",
      label: "Registra una vendita",
      completed: completedItems.has("quick_sale"),
      path: "/sales",
      description: "Se hai chiuso oggi, registralo subito",
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
              Oggi puoi chiudere più velocemente
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Inizia da una sola cosa. 2 minuti qui = pipeline più pulita.
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
                <p className="font-medium mb-1">Cos'è un deal?</p>
                <p className="text-sm text-muted-foreground">
                  Un deal è una trattativa: valore, fase e prossimo passo. 
                  Se la pipeline è ordinata, prevedi e chiudi prima.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Primary CTA */}
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

        {/* Soft tips */}
        <div className="pt-2 border-t">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lightbulb className="h-3 w-3 mt-0.5 text-primary" />
            <p>
              I deal fermi in "Nuovo" si raffreddano: aggiornarli oggi ti evita di rincorrerli domani.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}