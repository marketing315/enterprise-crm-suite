import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  Percent, 
  Mail, 
  MessageCircle, 
  Archive, 
  Users, 
  AlertTriangle,
  Calendar,
  FileEdit,
  X,
  Check,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionSuggestion, SuggestionType } from "@/types/predictive";

interface DealSuggestionCardProps {
  suggestion: ActionSuggestion;
  onDismiss: () => void;
  onAct: () => void;
  compact?: boolean;
}

const suggestionConfig: Record<SuggestionType, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  label: string;
}> = {
  call_now: { 
    icon: Phone, 
    color: "text-green-700", 
    bg: "bg-green-100",
    label: "Chiama"
  },
  offer_discount: { 
    icon: Percent, 
    color: "text-purple-700", 
    bg: "bg-purple-100",
    label: "Sconto"
  },
  send_followup: { 
    icon: Mail, 
    color: "text-blue-700", 
    bg: "bg-blue-100",
    label: "Follow-up"
  },
  change_channel: { 
    icon: MessageCircle, 
    color: "text-cyan-700", 
    bg: "bg-cyan-100",
    label: "Canale"
  },
  archive: { 
    icon: Archive, 
    color: "text-gray-700", 
    bg: "bg-gray-100",
    label: "Archivia"
  },
  reassign: { 
    icon: Users, 
    color: "text-orange-700", 
    bg: "bg-orange-100",
    label: "Riassegna"
  },
  escalate: { 
    icon: AlertTriangle, 
    color: "text-red-700", 
    bg: "bg-red-100",
    label: "Escalation"
  },
  schedule_meeting: { 
    icon: Calendar, 
    color: "text-indigo-700", 
    bg: "bg-indigo-100",
    label: "Appuntamento"
  },
  update_notes: { 
    icon: FileEdit, 
    color: "text-amber-700", 
    bg: "bg-amber-100",
    label: "Note"
  },
};

export function DealSuggestionCard({ 
  suggestion, 
  onDismiss, 
  onAct,
  compact = false,
}: DealSuggestionCardProps) {
  const config = suggestionConfig[suggestion.suggestion_type];
  const Icon = config.icon;
  const confidencePercent = Math.round(suggestion.confidence * 100);

  if (compact) {
    return (
      <div className={cn(
        "flex items-center gap-3 p-2 rounded-lg border",
        config.bg, "border-transparent"
      )}>
        <div className={cn("p-1.5 rounded-full bg-background/50")}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{suggestion.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAct}>
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDismiss}>
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("border-l-4", `border-l-${config.color.replace('text-', '')}`)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-full", config.bg)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" />
                AI
              </Badge>
              <span className="text-xs text-muted-foreground">
                {confidencePercent}% sicurezza
              </span>
            </div>
            <h4 className="font-medium">{suggestion.title}</h4>
            {suggestion.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {suggestion.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={onAct} className="gap-1">
                <Check className="h-4 w-4" />
                {config.label}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                <X className="h-4 w-4 mr-1" />
                Ignora
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// List component for multiple suggestions
interface SuggestionListProps {
  suggestions: ActionSuggestion[];
  onDismiss: (id: string) => void;
  onAct: (id: string) => void;
  compact?: boolean;
  maxItems?: number;
}

export function SuggestionList({ 
  suggestions, 
  onDismiss, 
  onAct,
  compact = false,
  maxItems = 5,
}: SuggestionListProps) {
  const visibleSuggestions = suggestions.slice(0, maxItems);

  if (visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visibleSuggestions.map((suggestion) => (
        <DealSuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          onDismiss={() => onDismiss(suggestion.id)}
          onAct={() => onAct(suggestion.id)}
          compact={compact}
        />
      ))}
      {suggestions.length > maxItems && (
        <p className="text-xs text-muted-foreground text-center">
          +{suggestions.length - maxItems} altri suggerimenti
        </p>
      )}
    </div>
  );
}
