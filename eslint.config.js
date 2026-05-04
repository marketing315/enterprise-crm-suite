import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * BASELINE — file legacy con `any` esistenti.
 * Su questi file la regola `no-explicit-any` resta `warn` per non bloccare,
 * ma non vanno aggiunte NUOVE `any`. Quando un file viene rifattorizzato,
 * RIMUOVERLO da questa lista.
 *
 * Snapshot al 2026-05-04 (52 file). Misurato con:
 *   rg -l "as any|: any" src/
 */
const ANY_BASELINE = [
  "src/components/admin/BackupSchedulePanel.tsx",
  "src/components/admin/TicketEscalationPolicyPanel.tsx",
  "src/components/admin/analytics/MarketingFunnelChart.tsx",
  "src/components/ceo/CeoCostBreakdown.tsx",
  "src/components/chat/CallSummaryMessage.tsx",
  "src/components/chat/EntityChatBox.tsx",
  "src/components/contacts/ContactDetailSheet.tsx",
  "src/components/contacts/ContactsBulkActionsBar.tsx",
  "src/components/contacts/ContactsTable.tsx",
  "src/components/contacts/ContactsTableWithSelection.tsx",
  "src/components/contacts/ContactsTableWithViews.tsx",
  "src/components/contacts/LeadEventCard.tsx",
  "src/components/contacts/NewContactDialog.tsx",
  "src/components/layout/BrandSelector.tsx",
  "src/components/marketing/AdStatsKpiCards.tsx",
  "src/components/marketing/AdStatsTab.tsx",
  "src/components/marketing/CampaignGroupsManager.tsx",
  "src/components/marketing/CreateMarketingLeadDialog.tsx",
  "src/components/marketing/Ga4StatsTab.tsx",
  "src/components/pipeline/DealInlinePanel.tsx",
  "src/components/pipeline/KanbanCard.tsx",
  "src/components/settings/OAuthChannelsSettings.tsx",
  "src/components/settings/automation/AutomationRuleFormDrawer.tsx",
  "src/components/settings/automation/AutomationSettings.tsx",
  "src/components/settings/automation/AutomationWizardTrigger.tsx",
  "src/components/settings/automation/AutomationWizardWorkflow.tsx",
  "src/components/settings/digest/LeadDigestRunsTable.tsx",
  "src/components/settings/keplero/KepleroLookupSettings.tsx",
  "src/components/settings/mcp/McpConnectionsTab.tsx",
  "src/components/settings/mcp/McpTestConsole.tsx",
  "src/components/settings/meta/TestLeadDialog.tsx",
  "src/features/appointments/useAppointmentOutcomes.ts",
  "src/features/appointments/useRecordOutcome.ts",
  "src/hooks/useBackupSchedules.ts",
  "src/hooks/useCallTranscripts.ts",
  "src/hooks/useComplianceCapacity.ts",
  "src/hooks/useFunnelMetrics.ts",
  "src/hooks/useGa4Stats.ts",
  "src/hooks/useLeadEventMutations.ts",
  "src/hooks/useMcpServerKpi.ts",
  "src/hooks/useMetaApps.ts",
  "src/hooks/usePWAInstall.ts",
  "src/hooks/useTags.ts",
  "src/integrations/supabase/untypedClient.ts",
  "src/pages/AdminCallcenterKpi.tsx",
  "src/pages/AdminMcpDashboard.tsx",
  "src/pages/AdminNotificationWebhooks.tsx",
  "src/pages/AppointmentDetail.tsx",
  "src/pages/Contacts.tsx",
  "src/pages/dashboard/SalespersonDashboard.tsx",
  "src/test/auth-context.test.tsx",
  "src/test/brand-context.test.tsx",
];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // STRICT — applicate al codice nuovo. La baseline legacy in fondo
      // declassa queste regole a `warn` per non bloccare il dev.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Baseline: file legacy che già contengono `any`. Le nuove `any` su QUESTI
  // file restano permesse (warn) per non rompere il build, ma il refactor le
  // deve rimuovere. Quando un file è ripulito, toglierlo da ANY_BASELINE.
  {
    files: ANY_BASELINE,
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
