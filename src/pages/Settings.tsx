import { Settings as SettingsIcon, Tags, Ticket, Webhook, AlertCircle, FileSpreadsheet, ShieldCheck, Facebook, GitBranch, FormInput, Bell, Phone, Zap, Plug, Layers, Mailbox, Target, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagManager } from "@/components/tags/TagManager";
import { TicketingSettings } from "@/components/settings/TicketingSettings";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { GoogleSheetsSettings } from "@/components/settings/GoogleSheetsSettings";
import { AdminManagement } from "@/components/settings/AdminManagement";
import { MetaAppsSettings } from "@/components/settings/meta/MetaAppsSettings";
import { OAuthChannelsSettings } from "@/components/settings/OAuthChannelsSettings";
import { PipelineStagesSettings } from "@/components/settings/pipeline/PipelineStagesSettings";
import { CustomFieldsSettings } from "@/components/settings/CustomFieldsSettings";
import { NotificationPreferencesSettings } from "@/components/settings/NotificationPreferencesSettings";
import { VoIPSettings } from "@/components/settings/VoIPSettings";
import { VOIspeedSettings } from "@/components/settings/VOIspeedSettings";
import { AutomationSettings } from "@/components/settings/automation/AutomationSettings";
import { ModuleGovernanceSettings } from "@/components/settings/ModuleGovernanceSettings";
import { LeadDigestSettings } from "@/components/settings/digest/LeadDigestSettings";
import { LeadDigestRunsTable } from "@/components/settings/digest/LeadDigestRunsTable";
import { LeadDigestKpiCards } from "@/components/settings/digest/LeadDigestKpiCards";
import { CampaignGroupsManager } from "@/components/marketing/CampaignGroupsManager";
import { KepleroLookupSettings } from "@/components/settings/keplero/KepleroLookupSettings";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";


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
        <div className="w-full overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex h-8 w-max gap-0.5 p-0.5">
            <TabsTrigger value="ticketing" className="gap-1.5 px-3 text-xs md:text-sm">
              <Ticket className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Ticketing</span>
            </TabsTrigger>
            {(isAdmin || isBrandAdmin) && (
              <TabsTrigger value="digest" className="gap-1.5 px-3 text-xs md:text-sm">
                <Mailbox className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Digest</span>
              </TabsTrigger>
            )}
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
            <TabsTrigger value="notifications" className="gap-1.5 px-3 text-xs md:text-sm">
              <Bell className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Notifiche</span>
            </TabsTrigger>
            {isBrandAdmin && (
              <TabsTrigger value="voip" className="gap-1.5 px-3 text-xs md:text-sm">
                <Phone className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>VoIP</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="automation" className="gap-1.5 px-3 text-xs md:text-sm">
                <Zap className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Automazioni</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="attribution" className="gap-1.5 px-3 text-xs md:text-sm">
                <Target className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Attribution</span>
              </TabsTrigger>
            )}
            {isBrandAdmin && (
              <TabsTrigger value="keplero-lookup" className="gap-1.5 px-3 text-xs md:text-sm">
                <Search className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Keplero</span>
              </TabsTrigger>
            )}
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
            {isBrandAdmin && (
              <TabsTrigger value="oauth" className="gap-1.5 px-3 text-xs md:text-sm">
                <Plug className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>OAuth</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="modules" className="gap-1.5 px-3 text-xs md:text-sm">
                <Layers className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Moduli</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-1.5 px-3 text-xs md:text-sm">
                <ShieldCheck className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span>Admin</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

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

        <TabsContent value="notifications" className="space-y-4">
          <NotificationPreferencesSettings />
        </TabsContent>

        {isBrandAdmin && (
          <TabsContent value="voip" className="space-y-4">
            <VoIPSettings />
            <VOIspeedSettings />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="automation" className="space-y-4">
            <AutomationSettings />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="attribution" className="space-y-4">
            <CampaignGroupsManager />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="webhooks" className="space-y-4">
            <WebhookSettings />
          </TabsContent>
        )}

        {isBrandAdmin && (
          <TabsContent value="keplero-lookup" className="space-y-4">
            <KepleroLookupSettings />
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

        {isBrandAdmin && (
          <TabsContent value="oauth" className="space-y-4">
            <OAuthChannelsSettings />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="modules" className="space-y-4">
            <ModuleGovernanceSettings />
          </TabsContent>
        )}

        {(isAdmin || isBrandAdmin) && (
          <TabsContent value="digest" className="space-y-4">
            <LeadDigestSettings />
            <LeadDigestKpiCards />
            <LeadDigestRunsTable />
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
