import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, MailOpen, MousePointerClick, AlertTriangle } from "lucide-react";
import type { EmailCampaignKpi } from "@/hooks/useEmailCampaignKpis";

interface Props {
  data: EmailCampaignKpi[] | undefined;
  isLoading: boolean;
}

function maskEmail(e: string): string {
  // helper kept here for future detail modal — not used in summary table
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return `${e[0]}***${e.slice(at)}`;
}

export function EmailCampaignsCard({ data, isLoading }: Props) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Performance Email
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun invio email nel periodo selezionato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Template</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Inviati</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Consegnati</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MailOpen className="h-3 w-3" /> Open
                    </span>
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" /> Click
                    </span>
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Bounce
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.template_name} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 font-medium truncate max-w-[260px]">{row.template_name}</td>
                    <td className="py-2.5 text-right">{row.sent.toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">{row.delivered.toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.open_rate.toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground text-xs ml-1">({row.opened})</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {row.click_rate.toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground text-xs ml-1">({row.clicked})</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {row.bounced > 0 ? (
                        <span className="text-rose-500 dark:text-rose-400">{row.bounced}</span>
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

export { maskEmail };
