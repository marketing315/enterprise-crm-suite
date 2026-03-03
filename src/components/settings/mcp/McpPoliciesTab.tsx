import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Plus } from "lucide-react";
import { useMcpPolicies, useUpsertMcpPolicy, type McpPolicy, type McpPolicyAction } from "@/hooks/useMcpData";
import { McpPolicyFormDrawer } from "./McpPolicyFormDrawer";

const ACTION_VARIANT: Record<McpPolicyAction, "default" | "secondary" | "destructive"> = {
  allow: "default",
  deny: "destructive",
  require_approval: "secondary",
};

const ACTION_LABEL: Record<McpPolicyAction, string> = {
  allow: "ALLOW",
  deny: "DENY",
  require_approval: "APPROVAL",
};

export function McpPoliciesTab() {
  const { data: policies = [], isLoading } = useMcpPolicies();
  const upsert = useUpsertMcpPolicy();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<McpPolicy | null>(null);

  const handleToggle = (policy: McpPolicy) => {
    upsert.mutate(
      { id: policy.id, role: policy.role, tool_pattern: policy.tool_pattern, action: policy.action, enabled: !policy.enabled },
      {
        onSuccess: () => toast.success(`Policy ${!policy.enabled ? "abilitata" : "disabilitata"}`),
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
              <Shield className="h-5 w-5" /> Policy RBAC
            </CardTitle>
            <CardDescription>
              Regole di accesso ai tool MCP. Le policy DENY hanno sempre precedenza. Priorità più alta = valutata prima.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Policy
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : policies.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nessuna policy configurata</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Tool Pattern</TableHead>
                  <TableHead>Brand Scope</TableHead>
                  <TableHead>Azione</TableHead>
                  <TableHead>Attiva</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id} className={!p.enabled ? "opacity-50" : ""}>
                    <TableCell className="font-mono">{p.priority}</TableCell>
                    <TableCell className="font-medium">{p.role}</TableCell>
                    <TableCell className="font-mono text-xs">{p.tool_pattern}</TableCell>
                    <TableCell className="text-xs">{p.brand_scope ?? "Globale"}</TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[p.action]}>{ACTION_LABEL[p.action]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.enabled} onCheckedChange={() => handleToggle(p)} disabled={upsert.isPending} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setDrawerOpen(true); }}>
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

      {/* Deny-first info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
              <div className="font-medium text-red-700 dark:text-red-400 mb-1">🚫 DENY</div>
              <p className="text-sm text-muted-foreground">Blocca l'accesso. Ha sempre precedenza su ALLOW.</p>
            </div>
            <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">⏳ APPROVAL</div>
              <p className="text-sm text-muted-foreground">Richiede approvazione umana prima dell'esecuzione.</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <div className="font-medium text-green-700 dark:text-green-400 mb-1">✅ ALLOW</div>
              <p className="text-sm text-muted-foreground">Consente l'esecuzione diretta del tool.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <McpPolicyFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} policy={editing} />
    </div>
  );
}
