import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Trophy, XCircle, Archive, Eye, Building2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DealWithBrand } from "@/hooks/usePipeline";
import type { DealStatus } from "@/types/database";

interface ClosedDealsTableProps {
  deals: DealWithBrand[] | undefined;
  isLoading?: boolean;
  onDealClick?: (dealId: string) => void;
  showBrand?: boolean;
  emptyMessage?: string;
  status: "won" | "lost" | "closed";
}

export function ClosedDealsTable({
  deals,
  isLoading,
  onDealClick,
  showBrand = false,
  emptyMessage = "Nessun deal trovato",
  status,
}: ClosedDealsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!deals || deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        {status === "won" && <Trophy className="h-12 w-12 mb-4 opacity-20" />}
        {status === "lost" && <XCircle className="h-12 w-12 mb-4 opacity-20" />}
        {status === "closed" && <Archive className="h-12 w-12 mb-4 opacity-20" />}
        <p className="text-lg">{emptyMessage}</p>
      </div>
    );
  }

  const getContactName = (deal: DealWithBrand) => {
    if (!deal.contact) return "—";
    const { first_name, last_name, email } = deal.contact;
    if (first_name || last_name) {
      return `${first_name || ""} ${last_name || ""}`.trim();
    }
    return email || "—";
  };

  const statusConfig: Record<DealStatus, { icon: React.ElementType; color: string; label: string }> = {
    won: { icon: Trophy, color: "text-green-600 bg-green-50", label: "Vinto" },
    lost: { icon: XCircle, color: "text-red-600 bg-red-50", label: "Perso" },
    closed: { icon: Archive, color: "text-muted-foreground bg-muted", label: "Archiviato" },
    open: { icon: Trophy, color: "text-primary bg-primary/10", label: "Aperto" },
    reopened_for_support: { icon: Trophy, color: "text-amber-600 bg-amber-50", label: "Riaperto" },
  };

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Contatto</TableHead>
            {showBrand && <TableHead className="w-[120px]">Brand</TableHead>}
            <TableHead className="w-[120px]">Valore</TableHead>
            <TableHead className="w-[100px]">Stato</TableHead>
            <TableHead className="w-[120px]">Chiuso il</TableHead>
            <TableHead className="w-[120px]">Durata</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => {
            const config = statusConfig[deal.status];
            const StatusIcon = config.icon;
            
            return (
              <TableRow key={deal.id}>
                <TableCell className="font-medium">{getContactName(deal)}</TableCell>
                {showBrand && (
                  <TableCell>
                    {deal.brand?.name ? (
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <Building2 className="h-3 w-3" />
                        {deal.brand.name}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {deal.value ? (
                    <span className="font-medium">€{deal.value.toLocaleString("it-IT")}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`flex items-center gap-1 w-fit ${config.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {deal.closed_at
                    ? format(new Date(deal.closed_at), "dd MMM yyyy", { locale: it })
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(deal.created_at), {
                    locale: it,
                  })}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDealClick?.(deal.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
