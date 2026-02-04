import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Clock, SkipForward } from "lucide-react";
import type { AutomationLog } from "@/hooks/useAutomationRules";

interface Props {
  logs: AutomationLog[];
}

export function AutomationLogsTable({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nessuna esecuzione registrata.
            <br />
            Le esecuzioni appariranno qui quando le regole vengono attivate.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Successo
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Fallito
          </Badge>
        );
      case "skipped":
        return (
          <Badge variant="secondary">
            <SkipForward className="h-3 w-3 mr-1" />
            Saltato
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ScrollArea className="h-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Azione</TableHead>
            <TableHead>Durata</TableHead>
            <TableHead>Entità Create</TableHead>
            <TableHead>Errore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-sm">
                {new Date(log.created_at).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TableCell>
              <TableCell>{getStatusBadge(log.status)}</TableCell>
              <TableCell className="text-sm font-mono">{log.action_taken}</TableCell>
              <TableCell className="text-sm">
                {log.duration_ms ? `${log.duration_ms}ms` : "-"}
              </TableCell>
              <TableCell className="text-xs">
                {log.created_entities && Object.keys(log.created_entities).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(log.created_entities).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {String(value).slice(0, 8)}...
                      </Badge>
                    ))}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                {log.error_message || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
