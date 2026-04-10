import { useState } from "react";
import {
  Settings as SettingsIcon,
  Tags,
  Ticket,
  Webhook,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Facebook,
  GitBranch,
  FormInput,
  Bell,
  Phone,
  Zap,
  Plug,
  Layers,
  Mailbox,
  Target,
  Search,
  Cpu,
  ChevronRight,
  Download,
  ScrollText,
} from "lucide-react";
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
import { McpSettingsModule } from "@/components/settings/mcp/McpSettingsModule";
import { InboundSourceList } from "@/components/settings/inbound/InboundSourceList";
import { AuditConsole } from "@/components/audit/AuditConsole";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  brandAdminOnly?: boolean;
  superAdminOnly?: boolean;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

const settingsGroups: SettingsNavGroup[] = [
  {
    label: "CRM & Dati",
    items: [
      { id: "pipeline", label: "Pipeline", icon: GitBranch, brandAdminOnly: true },
      { id: "custom-fields", label: "Campi personalizzati", icon: FormInput, brandAdminOnly: true },
      { id: "tags", label: "Tag", icon: Tags },
      { id: "ticketing", label: "Ticketing & SLA", icon: Ticket },
      { id: "inbound-sources", label: "Sorgenti Inbound", icon: Download, brandAdminOnly: true },
    ],
  },
  {
    label: "Lead & Automazioni",
    items: [
      { id: "automation", label: "Automazioni", icon: Zap, brandAdminOnly: true },
      { id: "digest", label: "Lead Digest", icon: Mailbox, adminOnly: true },
      { id: "attribution", label: "Attribution", icon: Target, brandAdminOnly: true },
    ],
  },
  {
    label: "Integrazioni",
    items: [
      { id: "webhooks", label: "Webhook", icon: Webhook, brandAdminOnly: true },
      { id: "voip", label: "Telefonia VoIP", icon: Phone, brandAdminOnly: true },
      { id: "sheets", label: "Google Sheets", icon: FileSpreadsheet, brandAdminOnly: true },
      { id: "meta", label: "Meta Ads", icon: Facebook, brandAdminOnly: true },
      { id: "oauth", label: "Canali OAuth", icon: Plug, brandAdminOnly: true },
      { id: "keplero-lookup", label: "Keplero Lookup", icon: Search, brandAdminOnly: true },
    ],
  },
  {
    label: "Notifiche",
    items: [
      { id: "notifications", label: "Preferenze notifiche", icon: Bell },
    ],
  },
  {
    label: "Sistema",
    items: [
      { id: "modules", label: "Governance moduli", icon: Layers, superAdminOnly: true },
      { id: "audit", label: "Audit Log", icon: ScrollText, superAdminOnly: true },
      { id: "mcp", label: "MCP Server", icon: Cpu, superAdminOnly: true },
      { id: "admin", label: "Gestione utenti", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
];

function SettingsContent({ activeSection }: { activeSection: string }) {
  switch (activeSection) {
    case "pipeline":
      return <PipelineStagesSettings />;
    case "custom-fields":
      return <CustomFieldsSettings />;
    case "tags":
      return <TagManager />;
    case "ticketing":
      return <TicketingSettings />;
    case "inbound-sources":
      return <InboundSourceList />;
    case "automation":
      return <AutomationSettings />;
    case "digest":
      return (
        <div className="space-y-6">
          <LeadDigestSettings />
          <LeadDigestKpiCards />
          <LeadDigestRunsTable />
        </div>
      );
    case "attribution":
      return <CampaignGroupsManager />;
    case "webhooks":
      return <WebhookSettings />;
    case "voip":
      return (
        <div className="space-y-6">
          <VoIPSettings />
          <VOIspeedSettings />
        </div>
      );
    case "sheets":
      return <GoogleSheetsSettings />;
    case "meta":
      return <MetaAppsSettings />;
    case "oauth":
      return <OAuthChannelsSettings />;
    case "keplero-lookup":
      return <KepleroLookupSettings />;
    case "notifications":
      return <NotificationPreferencesSettings />;
    case "modules":
      return <ModuleGovernanceSettings />;
    case "audit":
      return <AuditConsole />;
    case "mcp":
      return <McpSettingsModule />;
    case "admin":
      return <AdminManagement />;
    default:
      return <PipelineStagesSettings />;
  }
}

export default function Settings() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { hasRole, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState("pipeline");
  // Mobile: show nav or content
  const [mobileShowContent, setMobileShowContent] = useState(false);

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

  const isItemVisible = (item: SettingsNavItem) => {
    if (item.superAdminOnly && !isAdmin) return false;
    if (item.brandAdminOnly && !isBrandAdmin) return false;
    if (item.adminOnly && !isAdmin && !isBrandAdmin) return false;
    return true;
  };

  const visibleGroups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(isItemVisible),
    }))
    .filter((group) => group.items.length > 0);

  // Find current section label for mobile header
  const currentItem = visibleGroups
    .flatMap((g) => g.items)
    .find((i) => i.id === activeSection);

  const handleSelectSection = (id: string) => {
    setActiveSection(id);
    setMobileShowContent(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        {mobileShowContent && (
          <button
            className="md:hidden flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mr-1"
            onClick={() => setMobileShowContent(false)}
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <SettingsIcon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">
            {mobileShowContent && currentItem ? currentItem.label : "Impostazioni"}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {currentBrand?.name}
          </p>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 pt-4 gap-6">
        {/* Sidebar nav — hidden on mobile when content shown */}
        <aside
          className={cn(
            "w-full md:w-56 lg:w-60 shrink-0",
            mobileShowContent && "hidden md:block"
          )}
        >
          <ScrollArea className="h-full pr-2">
            <nav className="space-y-5">
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 mb-1.5">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => handleSelectSection(item.id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150",
                              "hover:bg-accent/50",
                              isActive
                                ? "bg-accent text-accent-foreground font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                            {isActive && (
                              <ChevronRight className="h-3.5 w-3.5 ml-auto shrink-0 text-muted-foreground/50 md:hidden" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Vertical divider */}
        <div className="hidden md:block w-px bg-border/50 shrink-0" />

        {/* Content */}
        <main
          className={cn(
            "flex-1 min-w-0",
            !mobileShowContent && "hidden md:block"
          )}
        >
          <ScrollArea className="h-full">
            <div className="max-w-3xl space-y-4 pb-8">
              <SettingsContent activeSection={activeSection} />
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
