import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, BarChart3, ShieldAlert, Archive, Lock, ShieldCheck, Activity, Bell } from "lucide-react";
import { AuditConsole } from "@/components/audit/AuditConsole";
import { AuditDashboard } from "@/components/audit/AuditDashboard";
import { AuditAnomaliesPanel } from "@/components/audit/AuditAnomaliesPanel";
import { AuditRetentionPanel } from "@/components/audit/AuditRetentionPanel";
import { AuditPiiPoliciesPanel } from "@/components/audit/AuditPiiPoliciesPanel";
import { AuditCompliancePanel } from "@/components/audit/AuditCompliancePanel";
import { RealtimeStatusPanel } from "@/components/audit/RealtimeStatusPanel";
import { AuditAlertsPanel } from "@/components/audit/AuditAlertsPanel";

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
        <TabsList className="grid w-full max-w-6xl grid-cols-8">
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
            Anomalie
          </TabsTrigger>
          <TabsTrigger value="notify" className="flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            Notifiche
          </TabsTrigger>
          <TabsTrigger value="retention" className="flex items-center gap-1.5">
            <Archive className="h-4 w-4" />
            Retention
          </TabsTrigger>
          <TabsTrigger value="pii" className="flex items-center gap-1.5">
            <Lock className="h-4 w-4" />
            PII
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="realtime" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            Realtime
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

        <TabsContent value="notify" className="mt-6">
          <AuditAlertsPanel />
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
