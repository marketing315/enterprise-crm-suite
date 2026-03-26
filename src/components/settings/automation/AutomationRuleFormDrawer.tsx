import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreateAutomationRule,
  useUpdateAutomationRule,
  type AutomationRule,
  type Action,
  type Conditions,
  type ConditionItem,
  type TriggerType,
} from "@/hooks/useAutomationRules";
import { AutomationWizardTrigger } from "./AutomationWizardTrigger";
import { AutomationWizardConditions } from "./AutomationWizardConditions";
import { AutomationWizardWorkflow } from "./AutomationWizardWorkflow";
import { AutomationWizardReview } from "./AutomationWizardReview";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: AutomationRule | null;
  defaultEventType?: string;
  defaultSource?: string;
}

const STEPS = [
  { key: "trigger", label: "Trigger", shortLabel: "Quando" },
  { key: "conditions", label: "Filtri", shortLabel: "Se" },
  { key: "workflow", label: "Workflow", shortLabel: "Cosa" },
  { key: "review", label: "Riepilogo", shortLabel: "Rivedi" },
] as const;

export function AutomationRuleFormDrawer({
  open,
  onOpenChange,
  editingRule,
  defaultEventType,
  defaultSource,
}: Props) {
  const createMutation = useCreateAutomationRule();
  const updateMutation = useUpdateAutomationRule();

  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("webhook_event");
  const [triggerEventType, setTriggerEventType] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [priority, setPriority] = useState(100);
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    if (open) {
      if (editingRule) {
        setName(editingRule.name);
        setDescription(editingRule.description || "");
        setTriggerType((editingRule.trigger_type as TriggerType) || "webhook_event");
        setTriggerEventType(editingRule.trigger_event_type || "");
        setCronExpression(editingRule.cron_expression || "");
        setIsActive(editingRule.is_active);
        setStopOnFailure(editingRule.stop_on_failure);
        setPriority(editingRule.priority);
        setConditions(editingRule.conditions?.all || []);
        setActions(editingRule.actions || []);
        setCurrentStep(0);
      } else {
        setName("");
        setDescription("");
        setTriggerType("webhook_event");
        setTriggerEventType(defaultEventType || "");
        setCronExpression("");
        setIsActive(true);
        setStopOnFailure(true);
        setPriority(100);
        setConditions([]);
        setActions([]);
        setCurrentStep(0);
      }
    }
  }, [open, editingRule, defaultEventType]);

  const handleAIGenerated = (automation: any) => {
    setName(automation.name || "");
    setDescription(automation.description || "");
    setTriggerType(automation.trigger_type || "webhook_event");
    setTriggerEventType(automation.trigger_event_type || "");
    setCronExpression(automation.cron_expression || "");
    setConditions(automation.conditions?.all || []);
    setActions(automation.actions || []);
    setStopOnFailure(automation.stop_on_failure ?? true);
    setPriority(automation.priority || 100);
    // Jump to review
    setCurrentStep(3);
  };

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 0:
        if (!name.trim()) return "Inserisci un nome per l'automazione";
        if (triggerType === "webhook_event" && !triggerEventType) return "Seleziona un evento trigger";
        if (triggerType === "cron" && !cronExpression) return "Inserisci un'espressione cron";
        return null;
      case 1:
        return null; // conditions are optional
      case 2:
        if (actions.length === 0) return "Aggiungi almeno un'azione al workflow";
        return null;
      case 3:
        return null;
      default:
        return null;
    }
  };

  const canGoNext = validateStep(currentStep) === null;

  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
      toast.error(error);
      return;
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    // Validate all steps
    for (let i = 0; i < STEPS.length; i++) {
      const error = validateStep(i);
      if (error) {
        toast.error(error);
        setCurrentStep(i);
        return;
      }
    }

    const conditionsObj: Conditions = conditions.length > 0 ? { all: conditions } : {};

    try {
      if (editingRule) {
        await updateMutation.mutateAsync({
          id: editingRule.id,
          name,
          description: description || undefined,
          trigger_type: triggerType,
          trigger_event_type: triggerType === "webhook_event" ? triggerEventType : undefined,
          trigger_source: defaultSource || undefined,
          cron_expression: triggerType === "cron" ? cronExpression : undefined,
          conditions: conditionsObj,
          actions,
          stop_on_failure: stopOnFailure,
          priority,
          is_active: isActive,
        });
        toast.success("Regola aggiornata");
      } else {
        await createMutation.mutateAsync({
          name,
          description: description || undefined,
          trigger_type: triggerType,
          trigger_event_type: triggerType === "webhook_event" ? triggerEventType : "cron.scheduled",
          trigger_source: defaultSource || undefined,
          cron_expression: triggerType === "cron" ? cronExpression : undefined,
          conditions: conditionsObj,
          actions,
          stop_on_failure: stopOnFailure,
          priority,
          is_active: isActive,
        });
        toast.success("Workflow creato!");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 gap-0">
        {/* Header with stepper */}
        <div className="px-6 pt-6 pb-4 border-b bg-card/50">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg">
              {editingRule ? "Modifica Workflow" : "Nuovo Workflow"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {STEPS[currentStep].label} — Step {currentStep + 1} di {STEPS.length}
            </SheetDescription>
          </SheetHeader>

          {/* Stepper */}
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => {
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;
              const isClickable = editingRule || i <= currentStep;

              return (
                <div key={step.key} className="flex items-center flex-1">
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && setCurrentStep(i)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all w-full",
                      isCurrent && "bg-primary/10",
                      isClickable && !isCurrent && "hover:bg-accent/50",
                      !isClickable && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold transition-colors",
                      isCompleted && "bg-primary text-primary-foreground",
                      isCurrent && "bg-primary text-primary-foreground",
                      !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden sm:block",
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {step.shortLabel}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "h-px w-4 shrink-0",
                      i < currentStep ? "bg-primary" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStep === 0 && (
            <AutomationWizardTrigger
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              triggerType={triggerType}
              setTriggerType={setTriggerType}
              triggerEventType={triggerEventType}
              setTriggerEventType={setTriggerEventType}
              cronExpression={cronExpression}
              setCronExpression={setCronExpression}
              isEditing={!!editingRule}
              onAIGenerated={handleAIGenerated}
            />
          )}
          {currentStep === 1 && (
            <AutomationWizardConditions
              conditions={conditions}
              setConditions={setConditions}
            />
          )}
          {currentStep === 2 && (
            <AutomationWizardWorkflow
              actions={actions}
              setActions={setActions}
            />
          )}
          {currentStep === 3 && (
            <AutomationWizardReview
              name={name}
              description={description}
              triggerType={triggerType}
              triggerEventType={triggerEventType}
              cronExpression={cronExpression}
              conditions={conditions}
              actions={actions}
              isActive={isActive}
              setIsActive={setIsActive}
              stopOnFailure={stopOnFailure}
              setStopOnFailure={setStopOnFailure}
              priority={priority}
              setPriority={setPriority}
            />
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t bg-card/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={currentStep === 0 ? () => onOpenChange(false) : handleBack}
            disabled={isLoading}
            className="gap-1.5"
          >
            {currentStep === 0 ? (
              "Annulla"
            ) : (
              <><ChevronLeft className="h-4 w-4" /> Indietro</>
            )}
          </Button>

          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              size="lg"
              className="min-w-[180px] gap-2"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio...</>
              ) : (
                <><Check className="h-4 w-4" /> {editingRule ? "Salva Modifiche" : "Crea Workflow"}</>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canGoNext}
              className="gap-1.5"
            >
              Avanti <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
