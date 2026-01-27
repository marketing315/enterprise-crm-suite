import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { TopError, TopWebhook } from "@/hooks/useWebhookMetrics";

interface WebhookErrorsTableProps {
  errors: TopError[];
  webhooks: TopWebhook[];
}

export function WebhookErrorsTable({ errors, webhooks }: WebhookErrorsTableProps) {
  // Filter webhooks with failures
  const failingWebhooks = webhooks.filter((w) => w.failed_count > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="webhooks-dashboard-errors">
      {/* Top Errors */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle>Top Errori (24h)</CardTitle>
              <CardDescription>Errori più frequenti raggruppati</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {errors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Errore</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Ultimo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((err, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="destructive" className="text-xs">
                          {err.error}
                        </Badge>
                        {err.raw_error && err.raw_error !== err.error && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {err.raw_error}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {err.count}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(err.last_occurrence), "HH:mm", { locale: it })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 opacity-20 mb-2" />
              <p>Nessun errore nelle ultime 24h</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks with Failures */}
      <Card>
        <CardHeader>
          <CardTitle>Endpoint con Fallimenti</CardTitle>
          <CardDescription>Webhook ordinati per fail rate</CardDescription>
        </CardHeader>
        <CardContent>
          {failingWebhooks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Webhook</TableHead>
                  <TableHead className="text-right">Fail Rate</TableHead>
                  <TableHead className="text-right">Falliti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failingWebhooks.map((wh) => (
                  <TableRow key={wh.webhook_id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{wh.webhook_name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {wh.webhook_url}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={wh.fail_rate > 20 ? "destructive" : "secondary"}
                      >
                        {wh.fail_rate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {wh.failed_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p>Nessun webhook con fallimenti</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
