import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverdueInstallments } from "@/hooks/useOverdueInstallments";
import { cn } from "@/lib/utils";

interface OverduePaymentsWidgetProps {
  className?: string;
  /** Limit visible rows (default 5) */
  limit?: number;
}

/**
 * Widget mobile-first che mostra rate scadute e in scadenza.
 * Usa get_overdue_installments RPC e filtra per stato.
 */
export function OverduePaymentsWidget({ className, limit = 5 }: OverduePaymentsWidgetProps) {
  const { data = [], isLoading } = useOverdueInstallments(7);

  const { overdue, upcoming } = useMemo(() => {
    return {
      overdue: data.filter((d) => d.status === "overdue").slice(0, limit),
      upcoming: data.filter((d) => d.status === "upcoming").slice(0, limit),
    };
  }, [data, limit]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (overdue.length === 0 && upcoming.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Pagamenti rateali
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nessuna rata in scadenza nei prossimi 7 giorni 🎉
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("h-4 w-4", overdue.length > 0 ? "text-destructive" : "text-muted-foreground")} />
            <span>Pagamenti rateali</span>
          </div>
          <div className="flex gap-2">
            {overdue.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {overdue.length} in ritardo
              </Badge>
            )}
            {upcoming.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {upcoming.length} in arrivo
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3 sm:p-6 sm:pt-0">
        {overdue.map((row) => (
          <InstallmentRow key={`o-${row.payment_id}-${row.installment_index}`} row={row} />
        ))}
        {upcoming.map((row) => (
          <InstallmentRow key={`u-${row.payment_id}-${row.installment_index}`} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}

function InstallmentRow({ row }: { row: ReturnType<typeof useOverdueInstallments>["data"] extends (infer T)[] | undefined ? T : never }) {
  const isOverdue = row.status === "overdue";
  return (
    <Link
      to={`/sales?order=${row.order_id}`}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border p-2.5 transition-colors hover:bg-accent/50 active:bg-accent",
        isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{row.contact_name}</span>
          <Badge variant={isOverdue ? "destructive" : "outline"} className="text-[10px] shrink-0">
            {isOverdue ? `${row.days_overdue}gg ritardo` : `tra ${Math.max(0, daysUntil(row.due_date))}gg`}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {row.order_number} • Rata #{row.installment_index + 1} •{" "}
          <span className="font-medium text-foreground">
            {row.installment_amount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
          </span>{" "}
          • {formatDate(row.due_date)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}
