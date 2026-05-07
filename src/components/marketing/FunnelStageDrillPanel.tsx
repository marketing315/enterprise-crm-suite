import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelStageDrill } from "@/hooks/useFunnelStageDrill";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  stageId: string | null;
  stageLabel: string | null;
  fromIso: string;
  toIso: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FunnelStageDrillPanel({ stageId, stageLabel, fromIso, toIso, open, onOpenChange }: Props) {
  const { data, isLoading } = useFunnelStageDrill(stageId, fromIso, toIso, open);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{stageLabel ?? "Dettaglio stage"}</SheetTitle>
          <SheetDescription>
            Ultimi {data?.length ?? 50} record nel periodo selezionato.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessun dato disponibile per questo stage.
            </p>
          ) : (
            data.map((row) => (
              <div
                key={row.item_id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{row.item_label}</p>
                  {row.item_subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{row.item_subtitle}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {row.item_value != null && (
                    <p className="text-sm font-semibold">€{Number(row.item_value).toLocaleString("it-IT")}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(row.item_at), "d MMM, HH:mm", { locale: it })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
