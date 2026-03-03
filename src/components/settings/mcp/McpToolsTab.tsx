import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Wrench, BookOpen, ShieldAlert } from "lucide-react";
import { useMcpServers, useMcpTools, useMcpResources, useToggleMcpTool, type McpToolCategory } from "@/hooks/useMcpData";

const CATEGORY_CONFIG: Record<McpToolCategory, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Wrench }> = {
  read: { label: "READ", variant: "default", icon: BookOpen },
  write: { label: "WRITE", variant: "secondary", icon: Wrench },
  sensitive_write: { label: "SENSITIVE", variant: "destructive", icon: ShieldAlert },
};

export function McpToolsTab() {
  const { data: servers = [] } = useMcpServers();
  const [filterServer, setFilterServer] = useState<string>("all");
  const serverId = filterServer === "all" ? undefined : filterServer;
  const { data: tools = [], isLoading: loadingTools } = useMcpTools(serverId);
  const { data: resources = [], isLoading: loadingResources } = useMcpResources(serverId);
  const toggleTool = useToggleMcpTool();

  const handleToggle = (id: string, enabled: boolean) => {
    toggleTool.mutate(
      { id, enabled },
      {
        onSuccess: () => toast.success(`Tool ${enabled ? "abilitato" : "disabilitato"}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Server filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filtra server:</span>
        <Select value={filterServer} onValueChange={setFilterServer}>
          <SelectTrigger className="w-[200px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            {servers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Tool Catalog
          </CardTitle>
          <CardDescription>Tutti i tool registrati con classificazione di rischio.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTools ? (
            <Skeleton className="h-48 w-full" />
          ) : tools.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">Nessun tool registrato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Abilitato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((t) => {
                  const cat = CATEGORY_CONFIG[t.category];
                  const serverName = servers.find((s) => s.id === t.server_id)?.name ?? "—";
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{t.name}</span>
                          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{serverName}</TableCell>
                      <TableCell>
                        <Badge variant={cat.variant} className="text-xs gap-1">
                          <cat.icon className="h-3 w-3" /> {cat.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.requires_approval ? <Badge variant="destructive" className="text-xs">Richiesta</Badge> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.rate_limit_per_min ?? "∞"}/min</TableCell>
                      <TableCell>
                        <Switch
                          checked={t.enabled}
                          onCheckedChange={(v) => handleToggle(t.id, v)}
                          disabled={toggleTool.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Resources
          </CardTitle>
          <CardDescription>Risorse MCP (context providers) disponibili per gli agenti.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingResources ? (
            <Skeleton className="h-32 w-full" />
          ) : resources.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">Nessuna risorsa registrata</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>URI Template</TableHead>
                  <TableHead>Abilitata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs">{servers.find((s) => s.id === r.server_id)?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.uri_template}</TableCell>
                    <TableCell>
                      <Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "Sì" : "No"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
