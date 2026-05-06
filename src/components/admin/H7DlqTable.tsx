import { useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useH7Dlq, useH7Replay, type H7DlqKind } from "@/hooks/useH7Dlq";

const TITLE: Record<H7DlqKind, string> = {
  outbound_webhook: "Outbound webhook deliveries",
  sheets_export: "Sheets export",
  lead_digest: "Lead digest",
  notification_webhook: "Notification webhook outbox",
};

export function H7DlqTable({ kind }: { kind: H7DlqKind }) {
  const { data, isLoading, refetch } = useH7Dlq(kind);
  const replay = useH7Replay(kind);
  const [batchBusy, setBatchBusy] = useState(false);

  const rows = data ?? [];

  const handleReplay = async (id: string) => {
    try {
      await replay.mutateAsync(id);
      toast.success("Replay schedulato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay fallito");
    }
  };

  const handleBatch = async () => {
    setBatchBusy(true);
    try {
      const slice = rows.slice(0, 100);
      let ok = 0;
      let fail = 0;
      for (const row of slice) {
        try {
          await replay.mutateAsync(String((row as { id?: string }).id));
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(`Replay batch: ${ok} ok, ${fail} falliti`);
    } finally {
      setBatchBusy(false);
    }
  };

  const cols = Object.keys(rows[0] ?? { id: "" }).slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{TITLE[kind]}</span>
          <Badge variant={rows.length > 0 ? "destructive" : "secondary"}>{rows.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleBatch} disabled={batchBusy || rows.length === 0}>
            <Play className="mr-2 h-4 w-4" />
            Replay batch (max 100)
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => <TableHead key={c}>{c}</TableHead>)}
              <TableHead className="w-24 text-right">Azione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={cols.length + 1} className="text-center text-muted-foreground py-8">Caricamento…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={cols.length + 1} className="text-center text-muted-foreground py-8">DLQ vuoto</TableCell></TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={String((row as { id?: string }).id ?? i)}>
                {cols.map((c) => (
                  <TableCell key={c} className="font-mono text-xs max-w-[18rem] truncate">
                    {String((row as Record<string, unknown>)[c] ?? "")}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => handleReplay(String((row as { id?: string }).id))}>
                    Replay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
