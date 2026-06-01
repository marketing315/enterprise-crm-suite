import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRightLeft, Plus, UserRound, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Segmented,
  MobileListItem,
  EmptyState,
  ErrorState,
  PullToRefresh,
  BottomSheet,
  MobileFab,
  MobileListSkeleton,
  type ChipOption,
} from "@/components/mobile";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import {
  useDeals,
  usePipelineStages,
  useUpdateDealStage,
  type DealWithBrand,
} from "@/hooks/usePipeline";
import { DealDetailSheet } from "@/components/pipeline/DealDetailSheet";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null | undefined): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `€ ${Math.round(value)}`;
  }
}

function contactDisplayName(deal: DealWithBrand): string {
  const c = deal.contact;
  if (!c) return "Senza contatto";
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || c.email || "Senza nome";
}

function contactInitials(deal: DealWithBrand): string {
  const c = deal.contact;
  if (!c) return "?";
  const a = (c.first_name || "").trim()[0];
  const b = (c.last_name || "").trim()[0];
  const initials = `${a ?? ""}${b ?? ""}`.trim();
  if (initials) return initials.toUpperCase();
  return (c.email || "?").trim()[0]?.toUpperCase() ?? "?";
}

export function MobilePipelineView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBrand, hasBrandSelected } = useBrand();
  const isSystemBrand = currentBrand?.id === SYSTEM_BRAND_ID;

  const { data: stages, isLoading: stagesLoading, isError: stagesError, refetch: refetchStages } =
    usePipelineStages();
  const {
    data: deals,
    isLoading: dealsLoading,
    isError: dealsError,
    refetch: refetchDeals,
    error: dealsErr,
  } = useDeals("open");

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [moveSheetDeal, setMoveSheetDeal] = useState<DealWithBrand | null>(null);

  const updateStage = useUpdateDealStage();

  const dealsByStage = useMemo(() => {
    const map: Record<string, DealWithBrand[]> = {};
    (deals ?? []).forEach((d) => {
      const sid = d.current_stage_id ?? "__no_stage__";
      (map[sid] ??= []).push(d);
    });
    return map;
  }, [deals]);

  const stageOptions: ChipOption<string>[] = useMemo(() => {
    if (!stages) return [];
    return stages.map((s) => ({
      value: s.id,
      label: s.name,
      count: dealsByStage[s.id]?.length ?? 0,
    }));
  }, [stages, dealsByStage]);

  // Default active stage = first stage with deals, else first stage
  const effectiveActiveStageId = useMemo(() => {
    if (activeStageId && stages?.some((s) => s.id === activeStageId)) {
      return activeStageId;
    }
    if (!stages || stages.length === 0) return null;
    const firstWithDeals = stages.find((s) => (dealsByStage[s.id]?.length ?? 0) > 0);
    return (firstWithDeals ?? stages[0]).id;
  }, [activeStageId, stages, dealsByStage]);

  const activeDeals = effectiveActiveStageId
    ? dealsByStage[effectiveActiveStageId] ?? []
    : [];

  const selectedDeal = useMemo(
    () => (deals ?? []).find((d) => d.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] }),
    ]);
  };

  const handleMoveStage = (deal: DealWithBrand, newStageId: string) => {
    if (deal.current_stage_id === newStageId) {
      setMoveSheetDeal(null);
      return;
    }
    const expectedVersion =
      (deal as unknown as { version?: number | null }).version ?? null;
    updateStage.mutate(
      {
        dealId: deal.id,
        stageId: newStageId,
        dealBrandId: deal.brand_id,
        expectedVersion,
      },
      {
        onSuccess: () => {
          toast.success("Deal spostato");
          setMoveSheetDeal(null);
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "STALE_DEAL") {
            toast.error("Deal aggiornato altrove. Ricarica e riprova.");
          } else {
            toast.error("Impossibile spostare il deal");
          }
        },
      },
    );
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare la pipeline.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalOpen = deals?.length ?? 0;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-3 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
              <p className="truncate text-xs text-muted-foreground">
                {isSystemBrand
                  ? "Vista globale di tutti i brand"
                  : currentBrand?.name}
                {" · "}
                <span className="tabular-nums">{totalOpen}</span>{" "}
                {totalOpen === 1 ? "deal aperto" : "deal aperti"}
              </p>
            </div>
          </div>

          {stages && stages.length > 0 && (
            <div className="mt-3">
              <Segmented<string>
                options={stageOptions}
                value={effectiveActiveStageId ?? stageOptions[0]?.value ?? ""}
                onChange={setActiveStageId}
                ariaLabel="Fase pipeline"
                asTabs
              />
            </div>
          )}
        </header>

        {/* States */}
        {stagesError || dealsError ? (
          <div className="px-4">
            <ErrorState
              title="Errore caricamento pipeline"
              description={
                dealsErr instanceof Error ? dealsErr.message : undefined
              }
              onRetry={() => {
                void refetchStages();
                void refetchDeals();
              }}
            />
          </div>
        ) : stagesLoading || dealsLoading ? (
          <div className="px-4">
            <MobileListSkeleton count={6} />
          </div>
        ) : !stages || stages.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={AlertCircle}
              title="Nessuna fase configurata"
              description="Configura le fasi della pipeline dal desktop."
            />
          </div>
        ) : activeDeals.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={UserRound}
              title="Nessun deal in questa fase"
              description="Sposta un deal qui o crea un nuovo deal."
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-3" aria-label="Deal in fase">
            {activeDeals.map((deal) => {
              const value = formatCurrency(deal.value);
              const owner =
                deal.assigned_user?.full_name ||
                deal.assigned_user?.email ||
                "Non assegnato";
              return (
                <li key={deal.id}>
                  <MobileListItem
                    leading={
                      <div
                        aria-hidden
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/80"
                      >
                        {contactInitials(deal)}
                      </div>
                    }
                    title={contactDisplayName(deal)}
                    subtitle={
                      <span className="truncate text-xs text-muted-foreground">
                        {owner}
                        {isSystemBrand && deal.brand?.name
                          ? ` · ${deal.brand.name}`
                          : ""}
                      </span>
                    }
                    trailing={
                      value ? (
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {value}
                        </span>
                      ) : null
                    }
                    onSelect={() => setSelectedDealId(deal.id)}
                    ariaLabel={`Apri deal ${contactDisplayName(deal)}`}
                    actions={[
                      {
                        id: "move-stage",
                        label: "Sposta fase",
                        icon: <ArrowRightLeft className="h-4 w-4" />,
                        variant: "primary",
                        onSelect: () => setMoveSheetDeal(deal),
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Move stage bottom sheet */}
      <BottomSheet
        open={!!moveSheetDeal}
        onOpenChange={(o) => !o && setMoveSheetDeal(null)}
        title="Sposta fase"
        description={
          moveSheetDeal
            ? `${contactDisplayName(moveSheetDeal)}${
                formatCurrency(moveSheetDeal.value)
                  ? ` · ${formatCurrency(moveSheetDeal.value)}`
                  : ""
              }`
            : undefined
        }
      >
        <ul className="flex flex-col gap-1 px-3 pb-4">
          {(stages ?? []).map((s) => {
            const isCurrent = moveSheetDeal?.current_stage_id === s.id;
            const count = dealsByStage[s.id]?.length ?? 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={isCurrent || updateStage.isPending}
                  onClick={() =>
                    moveSheetDeal && handleMoveStage(moveSheetDeal, s.id)
                  }
                  className={cn(
                    "press-scale flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3 text-left transition-colors",
                    "min-h-[52px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isCurrent
                      ? "opacity-60"
                      : "hover:bg-muted/60 active:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: s.color || "hsl(var(--primary))",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.name}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                  {isCurrent && (
                    <Check
                      aria-label="Fase attuale"
                      className="h-4 w-4 text-primary"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>

      {/* Deal detail sheet (riusa il desktop) */}
      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDealId}
        onOpenChange={(o) => !o && setSelectedDealId(null)}
      />

      {/* FAB: nuovo deal — il flusso parte dal contatto */}
      <MobileFab
        icon={<Plus className="h-6 w-6" />}
        label="Nuovo deal (scegli contatto)"
        onClick={() => navigate("/contacts")}
      />
    </PullToRefresh>
  );
}

export default MobilePipelineView;
