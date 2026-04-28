import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, BarChart3, ShieldAlert, Archive, Lock, ShieldCheck, Activity, Bell, Eye } from "lucide-react";
import { AuditConsole } from "@/components/audit/AuditConsole";
import { AuditDashboard } from "@/components/audit/AuditDashboard";
import { AuditAnomaliesPanel } from "@/components/audit/AuditAnomaliesPanel";
import { AuditRetentionPanel } from "@/components/audit/AuditRetentionPanel";
import { AuditPiiPoliciesPanel } from "@/components/audit/AuditPiiPoliciesPanel";
import { AuditCompliancePanel } from "@/components/audit/AuditCompliancePanel";
import { RealtimeStatusPanel } from "@/components/audit/RealtimeStatusPanel";
import { AuditAlertsPanel } from "@/components/audit/AuditAlertsPanel";
import { AuditAccessLogPanel } from "@/components/audit/AuditAccessLogPanel";

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
        {/* Mobile: horizontal scroll | Desktop: grid 9 cols */}
        <div className="-mx-2 sm:mx-0 overflow-x-auto sm:overflow-visible">
          <TabsList className="inline-flex sm:grid w-max sm:w-full sm:max-w-7xl sm:grid-cols-9 px-2 sm:px-0">
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5 shrink-0">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="console" className="flex items-center gap-1.5 shrink-0">
              <ScrollText className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Console</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-1.5 shrink-0">
              <ShieldAlert className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Anomalie</span>
            </TabsTrigger>
            <TabsTrigger value="notify" className="flex items-center gap-1.5 shrink-0">
              <Bell className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Notifiche</span>
            </TabsTrigger>
            <TabsTrigger value="access" className="flex items-center gap-1.5 shrink-0">
              <Eye className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Accessi</span>
            </TabsTrigger>
            <TabsTrigger value="retention" className="flex items-center gap-1.5 shrink-0">
              <Archive className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Retention</span>
            </TabsTrigger>
            <TabsTrigger value="pii" className="flex items-center gap-1.5 shrink-0">
              <Lock className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">PII</span>
            </TabsTrigger>
            <TabsTrigger value="compliance" className="flex items-center gap-1.5 shrink-0">
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Compliance</span>
            </TabsTrigger>
            <TabsTrigger value="realtime" className="flex items-center gap-1.5 shrink-0">
              <Activity className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Realtime</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="mt-6">
          <AuditDashboard />
        </TabsContent>

        <TabsContent value="console" className="mt-6">
          <AuditConsole />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <AuditAnomaliesPanel />
        </TabsContent>

        <TabsContent value="notify" className="mt-6">
          <AuditAlertsPanel />
        </TabsContent>

        <TabsContent value="access" className="mt-6">
          <AuditAccessLogPanel />
        </TabsContent>

        <TabsContent value="retention" className="mt-6">
          <AuditRetentionPanel />
        </TabsContent>

        <TabsContent value="pii" className="mt-6">
          <AuditPiiPoliciesPanel />
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <AuditCompliancePanel />
        </TabsContent>

        <TabsContent value="realtime" className="mt-6">
          <RealtimeStatusPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
