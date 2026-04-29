import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Wrench, Shield, Clock, Activity, FlaskConical, Plug } from "lucide-react";
import { McpServersTab } from "./McpServersTab";
import { McpToolsTab } from "./McpToolsTab";
import { McpPoliciesTab } from "./McpPoliciesTab";
import { McpApprovalsTab } from "./McpApprovalsTab";
import { McpObservabilityTab } from "./McpObservabilityTab";
import { McpTestConsole } from "./McpTestConsole";
import { McpConnectionsTab } from "./McpConnectionsTab";
import { useMcpPendingApprovals } from "@/hooks/useMcpData";
import { Badge } from "@/components/ui/badge";

export function McpSettingsModule() {
  const { data: pendingApprovals = [] } = useMcpPendingApprovals();

  return (
    <div className="space-y-4">
      <Tabs defaultValue="servers" className="space-y-4">
        <div className="w-full overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex h-8 w-max gap-0.5 p-0.5">
            <TabsTrigger value="servers" className="gap-1.5 px-3 text-xs">
              <Server className="h-3.5 w-3.5" /> Servers
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5 px-3 text-xs">
              <Wrench className="h-3.5 w-3.5" /> Tools & Resources
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5 px-3 text-xs">
              <Shield className="h-3.5 w-3.5" /> Policies
            </TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5 px-3 text-xs">
              <Clock className="h-3.5 w-3.5" /> Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {pendingApprovals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="observability" className="gap-1.5 px-3 text-xs">
              <Activity className="h-3.5 w-3.5" /> Observability
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-1.5 px-3 text-xs">
              <FlaskConical className="h-3.5 w-3.5" /> Test Console
            </TabsTrigger>
            <TabsTrigger value="connections" className="gap-1.5 px-3 text-xs">
              <Plug className="h-3.5 w-3.5" /> Connessioni
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="servers"><McpServersTab /></TabsContent>
        <TabsContent value="tools"><McpToolsTab /></TabsContent>
        <TabsContent value="policies"><McpPoliciesTab /></TabsContent>
        <TabsContent value="approvals"><McpApprovalsTab /></TabsContent>
        <TabsContent value="observability"><McpObservabilityTab /></TabsContent>
        <TabsContent value="test"><McpTestConsole /></TabsContent>
        <TabsContent value="connections"><McpConnectionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
