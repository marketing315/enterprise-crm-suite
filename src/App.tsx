import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { localStoragePersister } from "@/lib/queryPersister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { withModuleGuard } from "@/components/layout/withModuleGuard";
import { ErrorConsolePanel } from "@/components/admin/ErrorConsolePanel";

// Eager: critical path pages (login, dashboard redirect)
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import DashboardRedirect from "@/pages/DashboardRedirect";
import NotFound from "@/pages/NotFound";

// Lazy: all other pages
const SelectBrand = lazy(() => import("@/pages/SelectBrand"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Events = lazy(() => import("@/pages/Events"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const Tickets = lazy(() => import("@/pages/Tickets"));
const Settings = lazy(() => import("@/pages/Settings"));
const AdminAIMetrics = lazy(() => import("@/pages/AdminAIMetrics"));
const AdminAI = lazy(() => import("@/pages/AdminAI"));
const AdminCallcenterKpi = lazy(() => import("@/pages/AdminCallcenterKpi"));
const AdminTicketTrend = lazy(() => import("@/pages/AdminTicketTrend"));
const AdminWebhooksDashboard = lazy(() => import("@/pages/AdminWebhooksDashboard"));
const AdminDlqDashboard = lazy(() => import("@/pages/AdminDlqDashboard"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const AdminCapiMonitor = lazy(() => import("@/pages/AdminCapiMonitor"));
const AdminSloBoard = lazy(() => import("@/pages/AdminSloBoard"));
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

/** Minimal loading fallback */
function PageLoader() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 15,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const persistOptions = {
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 4, // 4 hours
  buster: 'v1',
};

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorConsolePanel />
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider>
          <BrandProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/install" element={<GuardedInstall />} />
                <Route path="/installa" element={<Navigate to="/install" replace />} />
                
                {/* Brand selection (requires auth) */}
                <Route
                  path="/select-brand"
                  element={
                    <ProtectedRoute>
                      <SelectBrand />
                    </ProtectedRoute>
                  }
                />
                
                {/* Protected routes with layout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<DashboardRedirect />} />
                  <Route path="/dashboard/overview" element={<Dashboard />} />
                  <Route path="/dashboard/admin" element={<AdminDashboard />} />
                  <Route path="/dashboard/ceo" element={<CeoDashboardView />} />
                  <Route path="/dashboard/responsabile-callcenter" element={<CallcenterManagerDashboard />} />
                  <Route path="/dashboard/responsabile-venditori" element={<SalesManagerDashboard />} />
                  <Route path="/dashboard/callcenter" element={<CallcenterOperatorDashboard />} />
                  <Route path="/dashboard/venditore" element={<SalespersonDashboard />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/tickets" element={<Tickets />} />
                  <Route path="/chat" element={<GuardedChat />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/azienda" element={<GuardedCompanyOverview />} />
                  <Route path="/azienda/costi" element={<GuardedCompanyExpenses />} />
                  <Route path="/azienda/budget" element={<GuardedCompanyBudget />} />
                  <Route path="/azienda/report" element={<GuardedCompanyReports />} />
                  
                  <Route path="/marketing" element={<MarketingDashboard />} />
                  <Route path="/marketing/campagne" element={<MarketingCampaigns />} />
                  <Route path="/marketing/costi" element={<MarketingCosts />} />
                  <Route path="/marketing/report" element={<MarketingReports />} />
                  <Route path="/marketing/leads" element={<MarketingLeads />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/team/salespersons" element={<SalespersonKpi />} />
                  <Route path="/admin/ai" element={<AdminAI />} />
                  <Route path="/admin/ai-metrics" element={<AdminAIMetrics />} />
                  <Route path="/admin/callcenter-kpi" element={<GuardedAdminCallcenterKpi />} />
                  <Route path="/admin/ticket-trend" element={<AdminTicketTrend />} />
                  <Route path="/admin/webhooks" element={<AdminWebhooksDashboard />} />
                  <Route path="/admin/dlq" element={<AdminDlqDashboard />} />
                  <Route path="/admin/analytics" element={<GuardedAdminAnalytics />} />
                  <Route path="/admin/capi" element={<GuardedAdminCapiMonitor />} />
                  <Route path="/admin/slo-board" element={<AdminSloBoard />} />
                  <Route path="/ceo-dashboard" element={<GuardedCeoDashboard />} />
                </Route>
                
                {/* Redirects */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrandProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
