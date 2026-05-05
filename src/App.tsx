import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persistOptions } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { withModuleGuard } from "@/components/layout/withModuleGuard";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { MfaGuard } from "@/components/auth/MfaGuard";
import { ErrorConsolePanel } from "@/components/admin/ErrorConsolePanel";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ChunkLoadErrorBoundary } from "@/components/ui/ChunkLoadErrorBoundary";
import { PageLoader } from "@/components/ui/PageLoader";
import { ConsentBanner } from "@/components/legal/ConsentBanner";

// Eager: critical path pages (login, dashboard redirect)
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Privacy from "@/pages/Privacy";
import DashboardRedirect from "@/pages/DashboardRedirect";
import NotFound from "@/pages/NotFound";
const MfaEnroll = lazy(() => import("@/pages/security/MfaEnroll"));
const MfaChallenge = lazy(() => import("@/pages/security/MfaChallenge"));

// Lazy: all other pages
const SelectBrand = lazy(() => import("@/pages/SelectBrand"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Events = lazy(() => import("@/pages/Events"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const AppointmentsCalendar = lazy(() => import("@/pages/AppointmentsCalendar"));
const AppointmentsOpsBoard = lazy(() => import("@/pages/AppointmentsOpsBoard"));
const SalesAvailability = lazy(() => import("@/pages/SalesAvailability"));
const AppointmentDetail = lazy(() => import("@/pages/AppointmentDetail"));
const Tickets = lazy(() => import("@/pages/Tickets"));
const Settings = lazy(() => import("@/pages/Settings"));
const SettingsSalesRoute = lazy(() => import("@/pages/SettingsSalesRoute"));
const SettingsSecurity = lazy(() => import("@/pages/SettingsSecurity"));
const AdminSetup = lazy(() => import("@/pages/AdminSetup"));
const AdminAIMetrics = lazy(() => import("@/pages/AdminAIMetrics"));
const AdminAI = lazy(() => import("@/pages/AdminAI"));
const AdminCallcenterKpi = lazy(() => import("@/pages/AdminCallcenterKpi"));
const AdminTicketTrend = lazy(() => import("@/pages/AdminTicketTrend"));
const AdminWebhooksDashboard = lazy(() => import("@/pages/AdminWebhooksDashboard"));
const AdminDlqDashboard = lazy(() => import("@/pages/AdminDlqDashboard"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const AdminCapiMonitor = lazy(() => import("@/pages/AdminCapiMonitor"));
const AdminSloBoard = lazy(() => import("@/pages/AdminSloBoard"));
const AdminSecurityReviews = lazy(() => import("@/pages/AdminSecurityReviews"));
const AdminAudit = lazy(() => import("@/pages/AdminAudit"));
const AdminTicketEscalationAudit = lazy(() => import("@/pages/AdminTicketEscalationAudit"));
const AdminSiemExport = lazy(() => import("@/pages/AdminSiemExport"));
const AdminNotificationWebhooks = lazy(() => import("@/pages/AdminNotificationWebhooks"));
const AdminAIDecisionsDrilldown = lazy(() => import("@/pages/AdminAIDecisionsDrilldown"));
const AdminContactsDedup = lazy(() => import("@/pages/AdminContactsDedup"));
const AdminCompliance = lazy(() => import("@/pages/AdminCompliance"));
const AdminObservability = lazy(() => import("@/pages/AdminObservability"));
const AdminMcpDashboard = lazy(() => import("@/pages/AdminMcpDashboard"));
const AdminQuickBackup = lazy(() => import("@/pages/AdminQuickBackup"));
const AdminSessions = lazy(() => import("@/pages/AdminSessions"));
const Chat = lazy(() => import("@/pages/Chat"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Team = lazy(() => import("@/pages/Team"));
const SalespersonKpi = lazy(() => import("@/pages/SalespersonKpi"));
const Sales = lazy(() => import("@/pages/Sales"));
const Products = lazy(() => import("@/pages/Products"));
const CompanyOverview = lazy(() => import("@/pages/company/CompanyOverview"));
const CompanyExpenses = lazy(() => import("@/pages/company/CompanyExpenses"));
const CompanyBudget = lazy(() => import("@/pages/company/CompanyBudget"));
const CompanyReports = lazy(() => import("@/pages/company/CompanyReports"));
const MarketingDashboard = lazy(() => import("@/pages/marketing/MarketingDashboard"));
const MarketingCampaigns = lazy(() => import("@/pages/marketing/MarketingCampaigns"));
const MarketingCosts = lazy(() => import("@/pages/marketing/MarketingCosts"));
const MarketingReports = lazy(() => import("@/pages/marketing/MarketingReports"));
const MarketingLeads = lazy(() => import("@/pages/marketing/MarketingLeads"));
const CeoDashboard = lazy(() => import("@/pages/CeoDashboard"));
const Install = lazy(() => import("@/pages/Install"));
const AdminDashboard = lazy(() => import("@/pages/dashboard/AdminDashboard"));
const CeoDashboardView = lazy(() => import("@/pages/dashboard/CeoDashboardView"));
const CallcenterManagerDashboard = lazy(() => import("@/pages/dashboard/CallcenterManagerDashboard"));
const SalesManagerDashboard = lazy(() => import("@/pages/dashboard/SalesManagerDashboard"));
const CallcenterOperatorDashboard = lazy(() => import("@/pages/dashboard/CallcenterOperatorDashboard"));
const SalespersonDashboard = lazy(() => import("@/pages/dashboard/SalespersonDashboard"));

// Module-guarded pages (Nice-to-Have / Evaluate / Frozen)
const GuardedChat = withModuleGuard("chat_team", Chat);
const GuardedCeoDashboard = withModuleGuard("ceo_dashboard", CeoDashboard);
const GuardedCompanyOverview = withModuleGuard("company_finance", CompanyOverview);
const GuardedCompanyExpenses = withModuleGuard("company_finance", CompanyExpenses);
const GuardedCompanyBudget = withModuleGuard("company_finance", CompanyBudget);
const GuardedCompanyReports = withModuleGuard("company_finance", CompanyReports);
const GuardedAdminCallcenterKpi = withModuleGuard("callcenter_kpi", AdminCallcenterKpi);
const GuardedAdminAnalytics = withModuleGuard("analytics_advanced", AdminAnalytics);
const GuardedAdminCapiMonitor = withModuleGuard("capi_monitor", AdminCapiMonitor);
const GuardedInstall = withModuleGuard("pwa_install", Install);

// PageLoader vive in @/components/ui/PageLoader e include un timeout
// di cortesia che mostra una CTA "Ricarica" se il chunk non arriva.

// queryClient + persistOptions are defined in @/lib/queryClient so that
// AuthContext.signOut can wipe them on logout (GDPR data minimization).


import "@/i18n";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PersonalizationProvider } from "@/components/providers/PersonalizationProvider";

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorConsolePanel />
      <ConsentBanner />
      <ErrorBoundary label="Applicazione">
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <BrandProvider>
            <PersonalizationProvider>
              <ChunkLoadErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/install" element={<GuardedInstall />} />
                  <Route path="/installa" element={<Navigate to="/install" replace />} />

                  {/* A5: MFA flows (require auth, but MUST be reachable while at AAL1) */}
                  <Route
                    path="/security/mfa-enroll"
                    element={
                      <ProtectedRoute>
                        <MfaEnroll />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/security/mfa-challenge"
                    element={
                      <ProtectedRoute>
                        <MfaChallenge />
                      </ProtectedRoute>
                    }
                  />
                  
                  {/* Brand selection (requires auth) */}
                  <Route
                    path="/select-brand"
                    element={
                      <ProtectedRoute>
                        <SelectBrand />
                      </ProtectedRoute>
                    }
                  />
                  
                  {/* Protected routes with layout (MFA guard wraps the whole tree) */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <MfaGuard>
                          <MainLayout />
                        </MfaGuard>
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/dashboard" element={<DashboardRedirect />} />
                    <Route path="/setup" element={<RoleGuard allowedRoles={['admin']}><AdminSetup /></RoleGuard>} />
                    <Route path="/dashboard/overview" element={<Dashboard />} />
                    <Route path="/dashboard/admin" element={<RoleGuard allowedRoles={['admin']}><AdminDashboard /></RoleGuard>} />
                    <Route path="/dashboard/ceo" element={<RoleGuard allowedRoles={['admin', 'ceo']}><CeoDashboardView /></RoleGuard>} />
                    <Route path="/dashboard/responsabile-callcenter" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_callcenter']}><CallcenterManagerDashboard /></RoleGuard>} />
                    <Route path="/dashboard/responsabile-venditori" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori']}><SalesManagerDashboard /></RoleGuard>} />
                    <Route path="/dashboard/callcenter" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_callcenter', 'operatore_callcenter']}><CallcenterOperatorDashboard /></RoleGuard>} />
                    <Route path="/dashboard/venditore" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori', 'venditore']}><SalespersonDashboard /></RoleGuard>} />
                    <Route path="/contacts" element={<Contacts />} />
                    <Route path="/pipeline" element={<Pipeline />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/appointments" element={<Appointments />} />
                    <Route path="/appointments/calendar" element={<AppointmentsCalendar />} />
                    <Route path="/appointments/ops-board" element={<AppointmentsOpsBoard />} />
                    <Route path="/appointments/availability" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori']}><SalesAvailability /></RoleGuard>} />
                    <Route path="/appointments/:id" element={<AppointmentDetail />} />
                    <Route path="/tickets" element={<Tickets />} />
                    <Route path="/chat" element={<GuardedChat />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/azienda" element={<GuardedCompanyOverview />} />
                    <Route path="/azienda/costi" element={<GuardedCompanyExpenses />} />
                    <Route path="/azienda/budget" element={<GuardedCompanyBudget />} />
                    <Route path="/azienda/report" element={<GuardedCompanyReports />} />
                    
                    <Route path="/marketing" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter']}><MarketingDashboard /></RoleGuard>} />
                    <Route path="/marketing/campagne" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione']}><MarketingCampaigns /></RoleGuard>} />
                    <Route path="/marketing/costi" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione']}><MarketingCosts /></RoleGuard>} />
                    <Route path="/marketing/report" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione']}><MarketingReports /></RoleGuard>} />
                    <Route path="/marketing/leads" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter']}><MarketingLeads /></RoleGuard>} />
                    <Route path="/settings" element={<RoleGuard allowedRoles={['admin', 'ceo']}><Settings /></RoleGuard>} />
                    <Route path="/settings/sales-route" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori']}><SettingsSalesRoute /></RoleGuard>} />
                    <Route path="/settings/security" element={<SettingsSecurity />} />
                    <Route path="/team" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori', 'responsabile_callcenter']}><Team /></RoleGuard>} />
                    <Route path="/team/salespersons" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori']}><SalespersonKpi /></RoleGuard>} />
                    <Route path="/admin/ai" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminAI /></RoleGuard>} />
                    <Route path="/admin/ai-metrics" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminAIMetrics /></RoleGuard>} />
                    <Route path="/admin/ai-decisions" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_venditori', 'responsabile_callcenter']}><AdminAIDecisionsDrilldown /></RoleGuard>} />
                    <Route path="/admin/callcenter-kpi" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_callcenter']}><GuardedAdminCallcenterKpi /></RoleGuard>} />
                    <Route path="/admin/ticket-trend" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminTicketTrend /></RoleGuard>} />
                    <Route path="/admin/webhooks" element={<RoleGuard allowedRoles={['admin']}><AdminWebhooksDashboard /></RoleGuard>} />
                    <Route path="/admin/dlq" element={<RoleGuard allowedRoles={['admin']}><AdminDlqDashboard /></RoleGuard>} />
                    <Route path="/admin/contacts-dedup" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminContactsDedup /></RoleGuard>} />
                    <Route path="/admin/analytics" element={<RoleGuard allowedRoles={['admin', 'ceo']}><GuardedAdminAnalytics /></RoleGuard>} />
                    <Route path="/admin/capi" element={<RoleGuard allowedRoles={['admin', 'ceo']}><GuardedAdminCapiMonitor /></RoleGuard>} />
                    <Route path="/admin/slo-board" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminSloBoard /></RoleGuard>} />
                    <Route path="/admin/security-reviews" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminSecurityReviews /></RoleGuard>} />
                    <Route path="/admin/audit" element={<RoleGuard allowedRoles={['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter']}><AdminAudit /></RoleGuard>} />
                    <Route path="/admin/ticket-escalations" element={<RoleGuard allowedRoles={['admin', 'ceo', 'responsabile_callcenter']}><AdminTicketEscalationAudit /></RoleGuard>} />
                    <Route path="/admin/siem-export" element={<RoleGuard allowedRoles={['admin']}><AdminSiemExport /></RoleGuard>} />
                    <Route path="/admin/notification-webhooks" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminNotificationWebhooks /></RoleGuard>} />
                    <Route path="/admin/compliance" element={<RoleGuard allowedRoles={['admin']}><AdminCompliance /></RoleGuard>} />
                    <Route path="/admin/observability" element={<RoleGuard allowedRoles={['admin']}><AdminObservability /></RoleGuard>} />
                    <Route path="/admin/mcp" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminMcpDashboard /></RoleGuard>} />
                    <Route path="/admin/quick-backup" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminQuickBackup /></RoleGuard>} />
                    <Route path="/admin/sessions" element={<RoleGuard allowedRoles={['admin', 'ceo']}><AdminSessions /></RoleGuard>} />
                    <Route path="/ceo-dashboard" element={<RoleGuard allowedRoles={['admin', 'ceo']}><GuardedCeoDashboard /></RoleGuard>} />
                  </Route>
                  
                  {/* Redirects */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  
                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </ChunkLoadErrorBoundary>
            </PersonalizationProvider>
            </BrandProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
    </ThemeProvider>
  </PersistQueryClientProvider>
);

export default App;
