import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { BrandSelector } from './BrandSelector';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  Ticket,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Inbox,
  Headphones,
  TrendingUp,
  Webhook,
  AlertTriangle,
  MessageSquare,
  Brain,
} from 'lucide-react';
import { useTicketRealtime } from '@/hooks/useTicketRealtime';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Users, label: 'Contatti', path: '/contacts' },
  { icon: Inbox, label: 'Eventi', path: '/events' },
  { icon: Kanban, label: 'Pipeline', path: '/pipeline' },
  { icon: Calendar, label: 'Appuntamenti', path: '/appointments' },
  { icon: Ticket, label: 'Ticket', path: '/tickets' },
  { icon: MessageSquare, label: 'Chat', path: '/chat' },
  { icon: BarChart3, label: 'Analytics', path: '/admin/analytics' },
];

const adminMenuItems = [
  { icon: Settings, label: 'Impostazioni', path: '/settings' },
  { icon: Brain, label: 'Gestione AI', path: '/admin/ai' },
  { icon: BarChart3, label: 'AI Metrics', path: '/admin/ai-metrics' },
  { icon: Headphones, label: 'KPI Call Center', path: '/admin/callcenter-kpi' },
  { icon: TrendingUp, label: 'Trend Ticket', path: '/admin/ticket-trend' },
  { icon: Webhook, label: 'Webhook Monitor', path: '/admin/webhooks' },
  { icon: AlertTriangle, label: 'DLQ', path: '/admin/dlq' },
];

export function MainLayout() {
  const { user, signOut, isAdmin } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Realtime ticket notifications
  const { newTicketsCount, myNewAssignmentsCount, slaBreachCount, resetCounts } = useTicketRealtime();
  const ticketActivityCount = newTicketsCount + myNewAssignmentsCount;

  // Reset badge when viewing tickets page
  useEffect(() => {
    if (location.pathname === '/tickets') {
      resetCounts();
    }
  }, [location.pathname, resetCounts]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-4 py-3">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">CRM Enterprise</span>
            </div>
            <div className="px-4 pb-3">
              <BrandSelector compact />
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu principale</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                        disabled={!hasBrandSelected && item.path !== '/dashboard'}
                        tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : undefined}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {/* Badge for ticket activity (new tickets + assignments) */}
                        {item.path === '/tickets' && ticketActivityCount > 0 && (
                          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs" data-testid="sidebar-ticket-badge">
                            {ticketActivityCount > 99 ? '99+' : ticketActivityCount}
                          </Badge>
                        )}
                        {/* Badge for SLA breaches (red, separate) */}
                        {item.path === '/tickets' && slaBreachCount > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs" data-testid="sidebar-sla-badge">
                            SLA {slaBreachCount > 99 ? '99+' : slaBreachCount}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Amministrazione</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {adminMenuItems.map((item) => (
                      <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                          isActive={location.pathname === item.path}
                          onClick={() => navigate(item.path)}
                          data-testid={item.path === '/admin/webhooks' ? 'nav-webhooks-dashboard' : undefined}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <div className="p-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(user?.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-sm">
                      <span className="font-medium">{user?.full_name || 'Utente'}</span>
                      <span className="text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Il mio account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col min-h-screen overflow-hidden">
          <header className="flex h-14 items-center gap-2 md:gap-4 border-b bg-background px-3 md:px-6 shrink-0">
            <SidebarTrigger />
            <div className="flex-1" />
            <NotificationBell />
            {currentBrand && (
              <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                <Building2 className="h-4 w-4 hidden sm:block" />
                <span className="truncate max-w-[120px] md:max-w-none">{currentBrand.name}</span>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-hidden p-3 md:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
