import { Settings as SettingsIcon, Tags, Ticket, Webhook, AlertCircle, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagManager } from "@/components/tags/TagManager";
import { TicketingSettings } from "@/components/settings/TicketingSettings";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { GoogleSheetsSettings } from "@/components/settings/GoogleSheetsSettings";
import { AdminManagement } from "@/components/settings/AdminManagement";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Settings() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { hasRole, isAdmin } = useAuth();
  
  const isBrandAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per accedere alle impostazioni.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Impostazioni</h1>
          <p className="text-sm text-muted-foreground">
            Configura {currentBrand?.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ticketing" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ticketing" className="gap-2">
            <Ticket className="h-4 w-4" />
            Ticketing
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2">
            <Tags className="h-4 w-4" />
            Tag
          </TabsTrigger>
          {isBrandAdmin && (
            <TabsTrigger value="webhooks" className="gap-2" data-testid="webhooks-settings-tab">
              <Webhook className="h-4 w-4" />
              Webhook
            </TabsTrigger>
          )}
          {isBrandAdmin && (
            <TabsTrigger value="sheets" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Google Sheets
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="admin" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Gestione
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="ticketing" className="space-y-4">
          <TicketingSettings />
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <TagManager />
        </TabsContent>

        {isBrandAdmin && (
          <TabsContent value="webhooks" className="space-y-4">
            <WebhookSettings />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="sheets" className="space-y-4">
            <GoogleSheetsSettings />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <AdminManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}