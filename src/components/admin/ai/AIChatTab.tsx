import { useState } from "react";
import { useAIChatLogs } from "@/hooks/useAIConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  MessageSquare,
  Users,
  User,
  Briefcase,
  Ticket,
  FileText,
  Sparkles,
  Phone,
  Flag,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

const TOOLS = [
  {
    id: "summarize_contact",
    name: "Riassumi contatto",
    description: "Genera un riassunto delle informazioni del contatto",
    icon: User,
  },
  {
    id: "suggest_action",
    name: "Suggerisci prossima azione",
    description: "Consiglia la migliore azione successiva per il deal",
    icon: Sparkles,
  },
  {
    id: "generate_script",
    name: "Genera script chiamata",
    description: "Crea uno script personalizzato per la chiamata",
    icon: Phone,
  },
];

const ROLES = [
  { id: "admin", name: "Admin", enabled: true },
  { id: "ceo", name: "CEO", enabled: true },
  { id: "callcenter", name: "Call Center", enabled: true },
  { id: "sales", name: "Sales", enabled: false },
];

export function AIChatTab() {
  const { data: chatLogs = [], isLoading } = useAIChatLogs();
  const [roleConfig, setRoleConfig] = useState(ROLES);
  const [toolConfig, setToolConfig] = useState(
    TOOLS.map((t) => ({ ...t, enabled: true }))
  );

  const toggleRole = (roleId: string) => {
    setRoleConfig((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const toggleTool = (toolId: string) => {
    setToolConfig((prev) =>
      prev.map((t) => (t.id === toolId ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const getEntityIcon = (type: string | null) => {
    switch (type) {
      case "contact":
        return <User className="h-4 w-4" />;
      case "deal":
        return <Briefcase className="h-4 w-4" />;
      case "ticket":
        return <Ticket className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Access Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Accesso per ruolo
          </CardTitle>
          <CardDescription>
            Configura quali ruoli possono utilizzare l'AI Chat
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {roleConfig.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <Label htmlFor={`role-${role.id}`} className="font-medium">
                  {role.name}
                </Label>
                <Switch
                  id={`role-${role.id}`}
                  checked={role.enabled}
                  onCheckedChange={() => toggleRole(role.id)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tool Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Strumenti disponibili
          </CardTitle>
          <CardDescription>
            Configura quali strumenti AI sono disponibili per gli operatori
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {toolConfig.map((tool) => (
              <div
                key={tool.id}
                className={`flex flex-col p-4 rounded-lg border-2 transition-colors ${
                  tool.enabled
                    ? "border-primary bg-primary/5"
                    : "border-muted bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <tool.icon
                    className={`h-6 w-6 ${
                      tool.enabled ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={() => toggleTool(tool.id)}
                  />
                </div>
                <span className="font-medium">{tool.name}</span>
                <span className="text-sm text-muted-foreground">
                  {tool.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Guardrails */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Guardrail
          </CardTitle>
          <CardDescription>
            Limiti di sicurezza per le interazioni AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">No dati sensibili</span>
                <p className="text-sm text-muted-foreground">
                  Non mostrare dati sensibili non necessari nelle risposte
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">Conferma azioni irreversibili</span>
                <p className="text-sm text-muted-foreground">
                  Richiedi conferma prima di azioni che modificano dati
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <span className="font-medium">Log completo</span>
                <p className="text-sm text-muted-foreground">
                  Registra tutte le conversazioni per audit
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Log conversazioni
          </CardTitle>
          <CardDescription>
            Ultime conversazioni con l'AI Chat
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chatLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna conversazione registrata</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Entità</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Latenza</TableHead>
                    <TableHead>Segnalato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chatLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), "dd/MM HH:mm", {
                          locale: it,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getEntityIcon(log.entity_type)}
                          <span className="text-sm capitalize">
                            {log.entity_type || "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.tool_name || "-"}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-sm">
                        {log.latency_ms ? `${log.latency_ms}ms` : "-"}
                      </TableCell>
                      <TableCell>
                        {log.flagged_incorrect && (
                          <Badge variant="destructive" className="gap-1">
                            <Flag className="h-3 w-3" />
                            Segnalato
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
