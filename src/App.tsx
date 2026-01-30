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
import NotFound from "@/pages/NotFound";

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
                <Route path="/events" element={<Events />} />
                <Route path="/appointments" element={<Appointments />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/analytics" element={<AdminAnalytics />} />
                <Route path="/settings" element={<Settings />} />
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
