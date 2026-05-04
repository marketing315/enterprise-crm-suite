import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";
import {
  useAdminSetupProgress,
  useMarkSetupStep,
  isStepComplete,
  SETUP_STEPS,
} from "@/hooks/useAdminSetupProgress";
import { Step1CreateBrand } from "@/components/setup/steps/Step1CreateBrand";
import { Step2InviteUsers } from "@/components/setup/steps/Step2InviteUsers";
import { Step3WebhookSource } from "@/components/setup/steps/Step3WebhookSource";
import { Step4TicketSla } from "@/components/setup/steps/Step4TicketSla";
import { Step5Integrations } from "@/components/setup/steps/Step5Integrations";

export default function AdminSetup() {
  const navigate = useNavigate();
  const { data, isLoading } = useAdminSetupProgress();
  const markStep = useMarkSetupStep();

  const completedCount = useMemo(
    () => (data ? SETUP_STEPS.filter((s) => isStepComplete(data, s)).length : 0),
    [data]
  );
  const total = SETUP_STEPS.length;
  const pct = Math.round((completedCount / total) * 100);

  const isComplete = (key: typeof SETUP_STEPS[number]) => (data ? isStepComplete(data, key) : false);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Helmet>
        <title>Configurazione iniziale | Setup amministratore</title>
        <meta name="description" content="Wizard di setup iniziale per amministratori: brand, utenti, webhook, SLA, integrazioni." />
      </Helmet>

      <header className="mb-8 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>Configurazione iniziale</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Benvenuto. Configuriamo la tua piattaforma.</h1>
        <p className="text-muted-foreground">
          5 passi essenziali per essere operativo. Puoi tornare a questa pagina in qualsiasi momento.
        </p>
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{completedCount} di {total} completati</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          <Step1CreateBrand stepNumber={1} completed={isComplete("brand_created")} />
          <Step2InviteUsers stepNumber={2} completed={isComplete("users_invited")} />
          <Step3WebhookSource stepNumber={3} completed={isComplete("webhook_source_created")} />
          <Step4TicketSla stepNumber={4} completed={isComplete("ticket_sla_configured")} />
          <Step5Integrations stepNumber={5} completed={isComplete("integration_connected")} />
        </div>
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <Button
          variant="ghost"
          onClick={() => {
            markStep.mutate("dismissed");
            navigate("/dashboard");
          }}
        >
          Salta il setup
        </Button>
        <Button onClick={() => navigate("/dashboard")}>
          Vai alla dashboard <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </footer>
    </div>
  );
}
