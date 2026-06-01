import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
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
  Download,
  ScrollText,
  Palette,
  Building2,
  Check,
  Sun,
  Moon,
  Monitor,
  Rows3,
  Rows4,
  Languages,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

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
import { WebPushSettings } from "@/components/settings/WebPushSettings";
import { VoIPSettings } from "@/components/settings/VoIPSettings";
import { VOIspeedSettings } from "@/components/settings/VOIspeedSettings";
import { VoispeedIvrTree } from "@/components/settings/VoispeedIvrTree";
import { VoispeedQueueRouting } from "@/components/settings/VoispeedQueueRouting";
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
import { useUIPreferences, type Density, type UILanguage } from "@/hooks/useUIPreferences";

import { MobileScreen } from "@/components/mobile/MobileScreen";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type SectionId =
  | "appearance"
  | "brand"
  | "security"
  | "pipeline"
  | "custom-fields"
  | "tags"
  | "ticketing"
  | "inbound-sources"
  | "automation"
  | "digest"
  | "attribution"
  | "webhooks"
  | "voip"
  | "sheets"
  | "meta"
  | "oauth"
  | "keplero-lookup"
  | "notifications"
  | "webpush"
  | "modules"
  | "audit"
  | "mcp"
  | "admin";

interface SettingsNavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  hint?: string;
  adminOnly?: boolean;
  brandAdminOnly?: boolean;
  superAdminOnly?: boolean;
  /** Se true non passa per il rendering della sezione "desktop": gestito inline. */
  inline?: boolean;
  /** Se valorizzato, naviga via router invece di aprire la sezione. */
  navigateTo?: string;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

const settingsGroups: SettingsNavGroup[] = [
  {
    label: "Account",
    items: [
      { id: "appearance", label: "Aspetto", icon: Palette, hint: "Tema, densità, lingua", inline: true },
      { id: "brand", label: "Brand", icon: Building2, hint: "Cambia brand attivo", inline: true },
      { id: "security", label: "Sicurezza", icon: ShieldCheck, hint: "MFA e sessione", navigateTo: "/settings/security" },
    ],
  },
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
      { id: "webpush", label: "Push browser/mobile", icon: Bell },
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

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
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
          <VoispeedQueueRouting />
          <VoispeedIvrTree />
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
    case "webpush":
      return <WebPushSettings />;
    case "modules":
      return <ModuleGovernanceSettings />;
    case "audit":
      return <AuditConsole />;
    case "mcp":
      return <McpSettingsModule />;
    case "admin":
      return <AdminManagement />;
    default:
      return null;
  }
}

/* ---------- Inline section: Aspetto ---------- */

interface OptionRowProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  isLast?: boolean;
}

function OptionRow({ icon: Icon, label, active, onClick, isLast }: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px] press-scale",
        "hover:bg-muted/40 transition-colors",
        !isLast && "border-b border-border/40",
      )}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-[15px] text-foreground">{label}</span>
      {active && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}

function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { prefs, update } = useUIPreferences();

  const setThemePref = (val: "light" | "dark" | "system") => {
    setTheme(val);
    update({ theme: val });
  };
  const setDensity = (d: Density) => update({ density: d });
  const setLanguage = (lng: UILanguage) => {
    update({ language: lng });
    void i18n.changeLanguage(lng);
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("appearance.theme")}
        </p>
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <OptionRow icon={Sun} label={t("appearance.theme_light")} active={theme === "light"} onClick={() => setThemePref("light")} />
          <OptionRow icon={Moon} label={t("appearance.theme_dark")} active={theme === "dark"} onClick={() => setThemePref("dark")} />
          <OptionRow icon={Monitor} label={t("appearance.theme_system")} active={theme === "system" || !theme} onClick={() => setThemePref("system")} isLast />
        </div>
      </section>

      <section>
        <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("appearance.density")}
        </p>
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <OptionRow icon={Rows3} label={t("appearance.density_comfortable")} active={prefs.density === "comfortable"} onClick={() => setDensity("comfortable")} />
          <OptionRow icon={Rows4} label={t("appearance.density_compact")} active={prefs.density === "compact"} onClick={() => setDensity("compact")} isLast />
        </div>
      </section>

      <section>
        <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("appearance.language")}
        </p>
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
          <OptionRow icon={Languages} label={t("appearance.language_it")} active={prefs.language === "it"} onClick={() => setLanguage("it")} />
          <OptionRow icon={Languages} label={t("appearance.language_en")} active={prefs.language === "en"} onClick={() => setLanguage("en")} isLast />
        </div>
      </section>
    </div>
  );
}

/* ---------- Inline section: Brand ---------- */

function BrandSection() {
  const { brands, currentBrand, setCurrentBrand } = useBrand();

  if (!brands.length) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Nessun brand disponibile per il tuo account.</AlertDescription>
      </Alert>
    );
  }

  return (
    <section>
      <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Brand attivo
      </p>
      <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
        {brands.map((b, i) => (
          <OptionRow
            key={b.id}
            icon={Building2}
            label={b.name}
            active={currentBrand?.id === b.id}
            onClick={() => setCurrentBrand(b)}
            isLast={i === brands.length - 1}
          />
        ))}
      </div>
      <p className="px-4 pt-2 text-xs text-muted-foreground">
        Il brand attivo filtra dati, pipeline e notifiche in tutta l'app.
      </p>
    </section>
  );
}

/* ---------- Root ---------- */

export default function MobileSettings() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { hasRole, isAdmin, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get("section") as SectionId) || null;
  const [activeSection, setActiveSection] = useState<SectionId | null>(initial);

  const isBrandAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  const visibleGroups = useMemo(() => {
    const isVisible = (item: SettingsNavItem) => {
      if (item.superAdminOnly && !isAdmin) return false;
      if (item.brandAdminOnly && !isBrandAdmin) return false;
      if (item.adminOnly && !isAdmin && !isBrandAdmin) return false;
      return true;
    };
    return settingsGroups
      .map((g) => ({ ...g, items: g.items.filter(isVisible) }))
      .filter((g) => g.items.length > 0);
  }, [isAdmin, isBrandAdmin]);

  const currentItem = useMemo(
    () => visibleGroups.flatMap((g) => g.items).find((i) => i.id === activeSection) ?? null,
    [visibleGroups, activeSection],
  );

  const openSection = (item: SettingsNavItem) => {
    if (item.navigateTo) {
      navigate(item.navigateTo);
      return;
    }
    setActiveSection(item.id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("section", item.id);
        return next;
      },
      { replace: true },
    );
  };

  const closeSection = () => {
    setActiveSection(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("section");
        return next;
      },
      { replace: true },
    );
  };

  if (!hasBrandSelected) {
    return (
      <MobileScreen header={<MobileHeader title="Impostazioni" />}>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per accedere alle impostazioni.
          </AlertDescription>
        </Alert>
      </MobileScreen>
    );
  }

  // ---- Sub-screen ----
  if (currentItem) {
    const isInline = currentItem.inline;
    return (
      <MobileScreen
        contentPadding={isInline ? "" : "px-4"}
        header={
          <MobileHeader
            title={
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeSection}
                  aria-label="Indietro"
                  className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 press-scale"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="truncate">{currentItem.label}</span>
              </span>
            }
            subtitle={currentBrand?.name}
          />
        }
      >
        {currentItem.id === "appearance" ? (
          <AppearanceSection />
        ) : currentItem.id === "brand" ? (
          <BrandSection />
        ) : (
          <SectionContent id={currentItem.id} />
        )}
      </MobileScreen>
    );
  }

  // ---- Root list ----
  return (
    <MobileScreen
      contentPadding=""
      header={
        <MobileHeader
          title={
            <span className="flex items-center gap-2">
              <SettingsIcon className="h-4.5 w-4.5 text-primary" />
              <span>Impostazioni</span>
            </span>
          }
          subtitle={currentBrand?.name}
        />
      }
    >
      {/* Profile card */}
      <div className="px-4">
        <div className="bg-card border border-border/40 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <UserIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground truncate">
              {user?.full_name || user?.email || "Utente"}
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Grouped lists */}
      {visibleGroups.map((group) => (
        <section key={group.label} className="space-y-2">
          <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </p>
          <div className="mx-4 bg-card border border-border/40 rounded-2xl overflow-hidden">
            {group.items.map((item, idx) => {
              const Icon = item.icon;
              const isLast = idx === group.items.length - 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSection(item)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left min-h-[52px] press-scale",
                    "hover:bg-muted/40 transition-colors",
                    !isLast && "border-b border-border/40",
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-foreground truncate">{item.label}</p>
                    {item.hint && (
                      <p className="text-xs text-muted-foreground truncate">{item.hint}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Sign out */}
      <section className="px-4 pb-6">
        <button
          type="button"
          onClick={() => void signOut()}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded-2xl",
            "bg-card border border-border/40 text-danger hover:bg-muted/40 transition-colors press-scale",
          )}
        >
          <LogOut className="h-4 w-4" />
          <span className="text-[15px] font-medium">Esci</span>
        </button>
      </section>
    </MobileScreen>
  );
}
