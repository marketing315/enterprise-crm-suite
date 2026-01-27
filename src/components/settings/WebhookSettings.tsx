import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, List, Activity, Download } from "lucide-react";
import { WebhookList } from "./webhooks/WebhookList";
import { DeliveriesMonitor } from "./webhooks/DeliveriesMonitor";
import { InboundSourceList } from "./inbound/InboundSourceList";

export function WebhookSettings() {
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const [activeTab, setActiveTab] = useState("inbound");

  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  if (!isAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Solo gli amministratori possono gestire i webhook.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbound" className="gap-2" data-testid="inbound-tab">
            <Download className="h-4 w-4" />
            Inbound
          </TabsTrigger>
          <TabsTrigger value="outbound" className="gap-2" data-testid="webhooks-tab">
            <List className="h-4 w-4" />
            Outbound
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2" data-testid="deliveries-tab">
            <Activity className="h-4 w-4" />
            Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4">
          <InboundSourceList />
        </TabsContent>

        <TabsContent value="outbound" className="mt-4">
          <WebhookList />
        </TabsContent>

        <TabsContent value="monitor" className="mt-4">
          <DeliveriesMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
