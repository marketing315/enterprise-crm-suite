import { Settings as SettingsIcon, Tags, Ticket, Webhook, AlertCircle, FileSpreadsheet, ShieldCheck, Facebook, GitBranch, FormInput } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagManager } from "@/components/tags/TagManager";
import { TicketingSettings } from "@/components/settings/TicketingSettings";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { GoogleSheetsSettings } from "@/components/settings/GoogleSheetsSettings";
import { AdminManagement } from "@/components/settings/AdminManagement";
import { MetaAppsSettings } from "@/components/settings/meta/MetaAppsSettings";
import { PipelineStagesSettings } from "@/components/settings/pipeline/PipelineStagesSettings";
import { CustomFieldsSettings } from "@/components/settings/CustomFieldsSettings";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function Settings() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { hasRole, isAdmin } = useAuth();
  
  const isBrandAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg md:text-2xl font-semibold">Impostazioni</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Configura {currentBrand?.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ticketing" className="space-y-4">
        {/* Mobile-optimized scrollable tabs */}
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList className="inline-flex h-10 w-max gap-1 p-1">
            <TabsTrigger value="ticketing" className="gap-1.5 px-3 text-xs md:text-sm">
              <Ticket className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Ticketing</span>
            </TabsTrigger>
            {isBrandAdmin && (
              <TabsTrigger value="pipeline" className="gap-1.5 px-3 text-xs md:text-sm">
                <GitBranch className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Pipeline</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="custom-fields" className="gap-1.5 px-3 text-xs md:text-sm">
                <FormInput className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Campi</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="tags" className="gap-1.5 px-3 text-xs md:text-sm">
              <Tags className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Tag</span>
            </TabsTrigger>
            {isBrandAdmin && (
              <TabsTrigger value="webhooks" className="gap-1.5 px-3 text-xs md:text-sm" data-testid="webhooks-settings-tab">
                <Webhook className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Webhook</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="sheets" className="gap-1.5 px-3 text-xs md:text-sm">
                <FileSpreadsheet className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Sheets</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="meta" className="gap-1.5 px-3 text-xs md:text-sm">
                <Facebook className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Meta Ads</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-1.5 px-3 text-xs md:text-sm">
                <ShieldCheck className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Admin</span>
              </TabsTrigger>
            )}
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        <TabsContent value="ticketing" className="space-y-4">
          <TicketingSettings />
        </TabsContent>

        {isBrandAdmin && (
          <TabsContent value="pipeline" className="space-y-4">
            <PipelineStagesSettings />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="custom-fields" className="space-y-4">
            <CustomFieldsSettings />
          </TabsContent>
        )}

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

        {isBrandAdmin && (
          <TabsContent value="meta" className="space-y-4">
            <MetaAppsSettings />
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
