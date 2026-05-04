import { Plug, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SetupStepCard } from "../SetupStepCard";
import { useMarkSetupStep } from "@/hooks/useAdminSetupProgress";

export function Step5Integrations({ completed, stepNumber }: { completed: boolean; stepNumber: number }) {
  const navigate = useNavigate();
  const markStep = useMarkSetupStep();

  return (
    <SetupStepCard
      step={stepNumber}
      icon={Plug}
      title="Collega Meta o Google"
      description="Sincronizza spese pubblicitarie e attribuzione lead da Meta Ads e Google Ads. Puoi farlo anche più tardi dalle impostazioni."
      completed={completed}
      optional
    >
      {!completed && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/settings?section=meta-apps")}>
            Collega Meta Ads <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
          <Button variant="outline" onClick={() => navigate("/settings?section=oauth-channels")}>
            Collega Google Ads <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={() => markStep.mutate("integration_connected")}>
            Salta questo passo
          </Button>
        </div>
      )}
    </SetupStepCard>
  );
}
