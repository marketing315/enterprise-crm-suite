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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Impostazioni</h1>
          <p className="text-sm text-muted-foreground">
            Configura {currentBrand?.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ticketing" className="space-y-4">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="ticketing" className="gap-1 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none">
            <Ticket className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Ticketing</span>
            <span className="sm:hidden">Ticket</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-1 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none">
            <Tags className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Tag
          </TabsTrigger>
          {isBrandAdmin && (
            <TabsTrigger value="webhooks" className="gap-1 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none" data-testid="webhooks-settings-tab">
              <Webhook className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Webhook</span>
              <span className="sm:hidden">WH</span>
            </TabsTrigger>
          )}
          {isBrandAdmin && (
            <TabsTrigger value="sheets" className="gap-1 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none">
              <FileSpreadsheet className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Google Sheets</span>
              <span className="sm:hidden">Sheets</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="admin" className="gap-1 md:gap-2 text-xs md:text-sm flex-1 sm:flex-none">
              <ShieldCheck className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Gestione</span>
              <span className="sm:hidden">Admin</span>
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