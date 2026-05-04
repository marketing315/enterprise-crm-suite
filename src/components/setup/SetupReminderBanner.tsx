import { useNavigate } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAdminSetupProgress,
  useMarkSetupStep,
  isStepComplete,
  SETUP_STEPS,
} from "@/hooks/useAdminSetupProgress";

export function SetupReminderBanner() {
  const navigate = useNavigate();
  const { data } = useAdminSetupProgress();
  const markStep = useMarkSetupStep();

  if (!data) return null;
  if (data.manual.dismissed_at) return null;

  const completed = SETUP_STEPS.filter((s) => isStepComplete(data, s)).length;
  const remaining = SETUP_STEPS.length - completed;
  if (remaining === 0) return null;
  // Only show banner when meaningful gap (≥2 missing) to avoid noise
  if (remaining < 2) return null;

  return (
    <div className="border-b bg-primary/[0.04] px-4 py-2">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1">
          Hai <strong>{remaining}</strong> {remaining === 1 ? "passo rimanente" : "passi rimanenti"} per completare la configurazione.
        </span>
        <Button size="sm" variant="default" onClick={() => navigate("/setup")}>
          Continua il setup
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Nascondi"
          onClick={() => markStep.mutate("dismissed")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
