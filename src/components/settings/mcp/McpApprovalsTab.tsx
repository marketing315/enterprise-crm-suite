import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { useMcpPendingApprovals, useDecideMcpApproval } from "@/hooks/useMcpData";

export function McpApprovalsTab() {
  const { data: approvals = [], isLoading } = useMcpPendingApprovals();
  const decide = useDecideMcpApproval();

  const handleDecision = (id: string, decision: "approved" | "rejected") => {
    decide.mutate(
      { id, decision },
      {
        onSuccess: () => toast.success(`Richiesta ${decision === "approved" ? "approvata" : "rifiutata"}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Coda Approvazioni
          {approvals.length > 0 && (
            <Badge variant="destructive" className="ml-2">{approvals.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Operazioni sensitive_write in attesa di approvazione umana.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : approvals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
            <p>Nessuna approvazione in attesa</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Richiesto</TableHead>
                <TableHead>Scade</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.map((a) => {
                const exec = a.mcp_executions;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono font-medium">{exec?.tool_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{exec?.actor_type} / {exec?.actor_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-xs">{exec?.brand_id?.slice(0, 8) ?? "Globale"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), "dd MMM HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.expires_at ? format(new Date(a.expires_at), "dd MMM HH:mm", { locale: it }) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleDecision(a.id, "approved")}
                          disabled={decide.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approva
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDecision(a.id, "rejected")}
                          disabled={decide.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Rifiuta
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
