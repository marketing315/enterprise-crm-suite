import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import SelectBrand from "@/pages/SelectBrand";
import Dashboard from "@/pages/Dashboard";
import Contacts from "@/pages/Contacts";
import Pipeline from "@/pages/Pipeline";
import Events from "@/pages/Events";
import Appointments from "@/pages/Appointments";
import Tickets from "@/pages/Tickets";
import Settings from "@/pages/Settings";
import AdminAIMetrics from "@/pages/AdminAIMetrics";
import AdminAI from "@/pages/AdminAI";
import AdminCallcenterKpi from "@/pages/AdminCallcenterKpi";
import AdminTicketTrend from "@/pages/AdminTicketTrend";
import AdminWebhooksDashboard from "@/pages/AdminWebhooksDashboard";
import AdminDlqDashboard from "@/pages/AdminDlqDashboard";
import AdminAnalytics from "@/pages/AdminAnalytics";
import Chat from "@/pages/Chat";
import Notifications from "@/pages/Notifications";
import Team from "@/pages/Team";
import SalespersonKpi from "@/pages/SalespersonKpi";
import Sales from "@/pages/Sales";
import Products from "@/pages/Products";
import NotFound from "@/pages/NotFound";
import CompanyOverview from "@/pages/company/CompanyOverview";
import CompanyExpenses from "@/pages/company/CompanyExpenses";
import CompanyBudget from "@/pages/company/CompanyBudget";
import CompanyReports from "@/pages/company/CompanyReports";
import MarketingDashboard from "@/pages/marketing/MarketingDashboard";
import MarketingCampaigns from "@/pages/marketing/MarketingCampaigns";
import MarketingCosts from "@/pages/marketing/MarketingCosts";
import MarketingReports from "@/pages/marketing/MarketingReports";
import CeoDashboard from "@/pages/CeoDashboard";
import Install from "@/pages/Install";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/install" element={<Install />} />
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
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/products" element={<Products />} />
                <Route path="/events" element={<Events />} />
                <Route path="/appointments" element={<Appointments />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/azienda" element={<CompanyOverview />} />
                <Route path="/azienda/costi" element={<CompanyExpenses />} />
                <Route path="/azienda/budget" element={<CompanyBudget />} />
                <Route path="/azienda/report" element={<CompanyReports />} />
                <Route path="/analytics" element={<AdminAnalytics />} />
                <Route path="/marketing" element={<MarketingDashboard />} />
                <Route path="/marketing/campagne" element={<MarketingCampaigns />} />
                <Route path="/marketing/costi" element={<MarketingCosts />} />
                <Route path="/marketing/report" element={<MarketingReports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/team" element={<Team />} />
                <Route path="/team/salespersons" element={<SalespersonKpi />} />
                <Route path="/admin/ai" element={<AdminAI />} />
                <Route path="/admin/ai-metrics" element={<AdminAIMetrics />} />
                <Route path="/admin/callcenter-kpi" element={<AdminCallcenterKpi />} />
                <Route path="/admin/ticket-trend" element={<AdminTicketTrend />} />
                <Route path="/admin/webhooks" element={<AdminWebhooksDashboard />} />
                <Route path="/admin/dlq" element={<AdminDlqDashboard />}
                />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
              </Route>
              
              {/* Redirects */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrandProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
