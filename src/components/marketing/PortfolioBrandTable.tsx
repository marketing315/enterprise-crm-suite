import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";
import type { PortfolioBrandKpi } from "@/hooks/usePortfolioKpis";

interface Props {
  data: PortfolioBrandKpi[] | undefined;
  isLoading: boolean;
}

export function PortfolioBrandTable({ data, isLoading }: Props) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Portafoglio brand
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun brand con dati nel periodo selezionato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Brand</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Spesa</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Lead</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Vendite</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Fatturato</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">CPL</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.brand_id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 font-medium">{row.brand_name}</td>
                    <td className="py-2.5 text-right">€{Number(row.spend).toLocaleString("it-IT", { maximumFractionDigits: 0 })}</td>
                    <td className="py-2.5 text-right">{Number(row.leads).toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">{Number(row.deals_won).toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">€{Number(row.revenue).toLocaleString("it-IT", { maximumFractionDigits: 0 })}</td>
                    <td className="py-2.5 text-right">
                      {row.cpl != null ? `€${Number(row.cpl).toLocaleString("it-IT", { maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.roas != null ? (
                        <span
                          className={
                            Number(row.roas) >= 1
                              ? "font-semibold text-emerald-600 dark:text-emerald-400"
                              : "font-semibold text-rose-600 dark:text-rose-400"
                          }
                        >
                          {Number(row.roas).toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
