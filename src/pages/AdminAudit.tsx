import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, BarChart3, ShieldAlert } from "lucide-react";
import { AuditConsole } from "@/components/audit/AuditConsole";
import { AuditDashboard } from "@/components/audit/AuditDashboard";
import { AuditAnomaliesPanel } from "@/components/audit/AuditAnomaliesPanel";

export default function AdminAudit() {
  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit & Compliance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Console centralizzata per la tracciabilità end-to-end delle azioni nel CRM
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="console" className="flex items-center gap-1.5">
            <ScrollText className="h-4 w-4" />
            Console
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            Alert
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <AuditDashboard />
        </TabsContent>

        <TabsContent value="console" className="mt-6">
          <AuditConsole />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <AuditAnomaliesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
