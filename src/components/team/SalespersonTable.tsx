import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { User, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalespersonKpi } from "@/hooks/useSalespersonKpis";
import { onActivateKey } from "@/lib/a11y";

interface SalespersonTableProps {
  kpis: SalespersonKpi[];
  isLoading?: boolean;
  onRowClick?: (userId: string) => void;
}

export function SalespersonTable({ kpis, isLoading, onRowClick }: SalespersonTableProps) {
  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getWinRateBadge = (rate: number) => {
    if (rate >= 70) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <TrendingUp className="h-3 w-3 mr-1" />
          {rate.toFixed(1)}%
        </Badge>
      );
    }
    if (rate >= 50) {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <Minus className="h-3 w-3 mr-1" />
          {rate.toFixed(1)}%
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <TrendingDown className="h-3 w-3 mr-1" />
        {rate.toFixed(1)}%
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Nessun venditore trovato</p>
        <p className="text-sm">Non ci sono venditori attivi in questo brand</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venditore</TableHead>
              <TableHead className="text-center">Aperti</TableHead>
              <TableHead className="text-center">Vinti</TableHead>
              <TableHead className="text-center">Persi</TableHead>
              <TableHead className="text-right">Valore</TableHead>
              <TableHead className="text-center">Win Rate</TableHead>
              <TableHead className="text-right">Gg Medi</TableHead>
              <TableHead className="text-right">Ultima Attività</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map((kpi) => (
              <TableRow
                key={kpi.user_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick?.(kpi.user_id)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(kpi.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{kpi.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{kpi.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{kpi.deals_open}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-green-600 font-medium">{kpi.deals_won + kpi.deals_closed}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-red-600">{kpi.deals_lost}</span>
                </TableCell>
                <TableCell className="text-right font-medium text-green-700">
                  €{(kpi.total_value_won || 0).toLocaleString("it-IT")}
                </TableCell>
                <TableCell className="text-center">{getWinRateBadge(kpi.win_rate)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {kpi.avg_days_to_close > 0 ? `${kpi.avg_days_to_close}gg` : "—"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {kpi.last_activity_at
                    ? formatDistanceToNow(new Date(kpi.last_activity_at), {
                        locale: it,
                        addSuffix: true,
                      })
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.user_id}
            role="button"
            tabIndex={0}
            className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRowClick?.(kpi.user_id)}
            onKeyDown={onActivateKey(() => onRowClick?.(kpi.user_id))}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{getInitials(kpi.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{kpi.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {kpi.email}
                  </p>
                </div>
              </div>
              {getWinRateBadge(kpi.win_rate)}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Aperti</p>
                <p className="font-semibold">{kpi.deals_open}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vinti</p>
                <p className="font-semibold text-green-600">{kpi.deals_won + kpi.deals_closed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Persi</p>
                <p className="font-semibold text-red-600">{kpi.deals_lost}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valore</p>
                <p className="font-semibold text-green-700">
                  €{((kpi.total_value_won || 0) / 1000).toFixed(0)}k
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
