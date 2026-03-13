import { Bot, MessageSquare, Plus, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatEmptyStateProps {
  type: "no-threads" | "no-selection" | "no-messages";
  onCreateGroup?: () => void;
  onNewAI?: () => void;
}

export function ChatEmptyState({ type, onCreateGroup, onNewAI }: ChatEmptyStateProps) {
  if (type === "no-selection") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-medium text-foreground/70">
          Seleziona una conversazione
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">
          Scegli una chat dalla lista per iniziare a comunicare
        </p>
      </div>
    );
  }

  if (type === "no-threads") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
        <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Nessuna conversazione
        </p>
        <div className="flex gap-2">
          {onCreateGroup && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateGroup}>
              <Users className="h-3.5 w-3.5" />
              Nuovo gruppo
            </Button>
          )}
          {onNewAI && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onNewAI}>
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
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center mb-3">
        <Sparkles className="h-6 w-6 text-primary/40" />
      </div>
      <p className="text-sm text-muted-foreground">
        Inizia la conversazione
      </p>
    </div>
  );
}
