import { Bot, MessageSquare, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatEmptyStateProps {
  type: "no-threads" | "no-selection" | "no-messages";
  onCreateGroup?: () => void;
  onNewAI?: () => void;
}

export function ChatEmptyState({ type, onCreateGroup, onNewAI }: ChatEmptyStateProps) {
  if (type === "no-selection") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in fade-in-0 duration-500">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <h3 className="text-base font-medium text-foreground/70">
          Seleziona una conversazione
        </h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-[260px] leading-relaxed">
          Scegli una chat dalla lista per iniziare a comunicare con il team
        </p>
      </div>
    );
  }

  if (type === "no-threads") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center flex-1 animate-in fade-in-0 duration-500">
        <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <MessageSquare className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-foreground/70 mb-1">
          Nessuna conversazione
        </p>
        <p className="text-xs text-muted-foreground mb-4 max-w-[220px]">
          Crea un gruppo o avvia una chat AI per iniziare
        </p>
        <div className="flex gap-2">
          {onCreateGroup && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onCreateGroup}>
              <Users className="h-3.5 w-3.5" />
              Nuovo gruppo
            </Button>
          )}
          {onNewAI && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onNewAI}>
              <Bot className="h-3.5 w-3.5" />
              Chat AI
            </Button>
          )}
        </div>
      </div>
    );
  }

  // no-messages
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/10">
        <Sparkles className="h-7 w-7 text-primary/40" />
      </div>
      <p className="text-sm font-medium text-foreground/70">
        Inizia la conversazione
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Scrivi un messaggio per avviare la discussione
      </p>
    </div>
  );
}
