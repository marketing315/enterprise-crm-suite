import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Server, Plus, ShieldOff, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useMcpServers, useToggleMcpServerKillSwitch, type McpServer, type McpServerStatus } from "@/hooks/useMcpData";
import { McpServerFormDrawer } from "./McpServerFormDrawer";

const STATUS_VARIANT: Record<McpServerStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  disabled: "outline",
  degraded: "secondary",
  maintenance: "destructive",
};

export function McpServersTab() {
  const { data: servers = [], isLoading } = useMcpServers();
  const toggleKill = useToggleMcpServerKillSwitch();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);

  const handleKillSwitch = (server: McpServer) => {
    const next = !server.kill_switch;
    toggleKill.mutate(
      { id: server.id, kill_switch: next },
      {
        onSuccess: () => toast.success(`Kill switch ${next ? "ATTIVATO" : "disattivato"} per ${server.name}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> Server MCP
            </CardTitle>
            <CardDescription>Registry dei server MCP registrati nel sistema.</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuovo Server
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : servers.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nessun server MCP registrato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Versione</TableHead>
                  <TableHead>Trasporto</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Kill Switch</TableHead>
                  <TableHead>Aggiornato</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.id} className={s.kill_switch ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.version}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{s.transport}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={s.kill_switch}
                          onCheckedChange={() => handleKillSwitch(s)}
                          disabled={toggleKill.isPending}
                        />
                        {s.kill_switch ? (
                          <ShieldOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(s.updated_at), "dd MMM HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditing(s); setDrawerOpen(true); }}
                      >
                        Modifica
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <McpServerFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        server={editing}
      />
    </div>
  );
}
