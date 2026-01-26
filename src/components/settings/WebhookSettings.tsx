import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, List, Activity } from "lucide-react";
import { WebhookList } from "./webhooks/WebhookList";
import { DeliveriesMonitor } from "./webhooks/DeliveriesMonitor";

export function WebhookSettings() {
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  const [activeTab, setActiveTab] = useState("webhooks");

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
          <TabsTrigger value="webhooks" className="gap-2" data-testid="webhooks-tab">
            <List className="h-4 w-4" />
            Webhook
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2" data-testid="deliveries-tab">
            <Activity className="h-4 w-4" />
            Monitor Deliveries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-4">
          <WebhookList />
        </TabsContent>

        <TabsContent value="monitor" className="mt-4">
          <DeliveriesMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
