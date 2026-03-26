import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Webhook, Clock, Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRIGGER_TYPES,
  COMMON_CRON_EXPRESSIONS,
  type TriggerType,
} from "@/hooks/useAutomationRules";
import { useAutomationEventTypes } from "@/hooks/useInboundSources";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  triggerType: TriggerType;
  setTriggerType: (v: TriggerType) => void;
  triggerEventType: string;
  setTriggerEventType: (v: string) => void;
  cronExpression: string;
  setCronExpression: (v: string) => void;
  isEditing: boolean;
  onAIGenerated: (automation: any) => void;
}

// Group events by category prefix
function groupEvents(events: { value: string; label: string }[]) {
  const groups: Record<string, { value: string; label: string; shortLabel: string }[]> = {};
  for (const e of events) {
    const prefix = e.value.split(".")[0];
    const categoryMap: Record<string, string> = {
      keplero: "Keplero",
      meta: "Meta Ads",
      voispeed: "VOIspeed",
      inbound: "Inbound",
    };
    const category = categoryMap[prefix] || prefix;
    if (!groups[category]) groups[category] = [];
    groups[category].push({
      ...e,
      shortLabel: e.label.replace(/^[^-–]+ [-–] /, ""),
    });
  }
  return groups;
}

export function AutomationWizardTrigger({
  name,
  setName,
  description,
  setDescription,
  triggerType,
  setTriggerType,
  triggerEventType,
  setTriggerEventType,
  cronExpression,
  setCronExpression,
  isEditing,
  onAIGenerated,
}: Props) {
  const { eventTypes: AUTOMATION_EVENT_TYPES } = useAutomationEventTypes();
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAI, setShowAI] = useState(false);

  const groupedEvents = groupEvents(AUTOMATION_EVENT_TYPES);

  const handleGenerateFromAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-automation", {
        body: { prompt: aiPrompt, eventTypes: AUTOMATION_EVENT_TYPES },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      onAIGenerated(data.automation);
      toast.success("Automazione generata! Rivedi e personalizza.");
      setShowAI(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore generazione AI");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Banner */}
      {!isEditing && (
        <div className="relative">
          {!showAI ? (
            <button
              type="button"
              onClick={() => setShowAI(true)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 hover:from-primary/10 hover:to-primary/10 transition-all group"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Genera con AI</p>
                <p className="text-xs text-muted-foreground">Descrivi cosa vuoi automatizzare in linguaggio naturale</p>
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-4 space-y-3">
              <Textarea
                placeholder="Es: Quando arriva un ricontatto da Keplero, crea il contatto, taggalo come 'ricontatto' e imposta la richiesta di callback"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                className="resize-none bg-background/80 backdrop-blur-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAI(false)}
                >
                  Annulla
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerateFromAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                >
                  {isGenerating ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generando...</>
                  ) : (
                    <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Genera</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nome e Descrizione */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome dell'automazione</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es: Keplero Ricontatto → Crea Contatto"
            className="text-base font-medium h-12"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrizione (opzionale)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descrizione..."
            className="h-10"
          />
        </div>
      </div>

      {/* Tipo Trigger — Card selezionabili */}
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quando si attiva?</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTriggerType("webhook_event")}
            className={cn(
              "relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-center group",
              triggerType === "webhook_event"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/40 hover:bg-accent/50"
            )}
          >
            {triggerType === "webhook_event" && (
              <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
              triggerType === "webhook_event" ? "bg-primary/15" : "bg-muted"
            )}>
              <Webhook className={cn("h-6 w-6", triggerType === "webhook_event" ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="text-sm font-semibold">Evento Webhook</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Si attiva quando arriva un webhook</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTriggerType("cron")}
            className={cn(
              "relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-center group",
              triggerType === "cron"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/40 hover:bg-accent/50"
            )}
          >
            {triggerType === "cron" && (
              <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
              triggerType === "cron" ? "bg-primary/15" : "bg-muted"
            )}>
              <Clock className={cn("h-6 w-6", triggerType === "cron" ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="text-sm font-semibold">Schedulato</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Si attiva su schedule temporale</p>
            </div>
          </button>
        </div>
      </div>

      {/* Webhook Event Picker — categorized grid */}
      {triggerType === "webhook_event" && (
        <div className="space-y-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quale evento?</Label>
          <div className="space-y-4">
            {Object.entries(groupedEvents).map(([category, events]) => (
              <div key={category}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{category}</p>
                <div className="grid grid-cols-2 gap-2">
                  {events.map((event) => (
                    <button
                      key={event.value}
                      type="button"
                      onClick={() => setTriggerEventType(event.value)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all text-sm",
                        triggerEventType === event.value
                          ? "border-primary bg-primary/5 shadow-sm font-medium"
                          : "border-border hover:border-primary/30 hover:bg-accent/50"
                      )}
                    >
                      <Zap className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        triggerEventType === event.value ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className="truncate text-xs">{event.shortLabel}</span>
                      {triggerEventType === event.value && (
                        <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cron Picker */}
      {triggerType === "cron" && (
        <div className="space-y-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Frequenza</Label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_CRON_EXPRESSIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCronExpression(c.value)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all",
                  cronExpression === c.value
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 hover:bg-accent/50"
                )}
              >
                <Clock className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  cronExpression === c.value ? "text-primary" : "text-muted-foreground"
                )} />
                <span className="text-xs font-medium">{c.label}</span>
                {cronExpression === c.value && (
                  <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 pt-2">
            <Label className="text-xs text-muted-foreground">Oppure espressione personalizzata</Label>
            <Input
              className="font-mono text-sm"
              placeholder="* * * * * (min hour day month weekday)"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
