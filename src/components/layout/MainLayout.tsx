import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useHasMarketingAccess, useCanSeeMarketingSubmenu } from '@/hooks/useMarketingAccess';
import { BrandSelector } from './BrandSelector';
import { PageHelpButton } from './PageHelpButton';
import { IncomingCallPopup } from '@/components/contacts/IncomingCallPopup';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  UsersRound,
  ShoppingCart,
  Package,
  Briefcase,
  Megaphone,
  ChevronRight,
  DollarSign,
  FileText,
  LineChart,
} from 'lucide-react';
import { useTicketRealtime } from '@/hooks/useTicketRealtime';
import { NotificationBell } from '@/components/notifications/NotificationBell';

// Base menu items (always visible if brand selected)
const baseMenuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Users, label: 'Contatti', path: '/contacts' },
  { icon: Inbox, label: 'Eventi', path: '/events' },
  { icon: Kanban, label: 'Pipeline', path: '/pipeline' },
  { icon: ShoppingCart, label: 'Vendite', path: '/sales' },
  { icon: Calendar, label: 'Appuntamenti', path: '/appointments' },
  { icon: Ticket, label: 'Ticket', path: '/tickets' },
  { icon: MessageSquare, label: 'Chat', path: '/chat' },
  { icon: Briefcase, label: 'Azienda', path: '/azienda' },
];

// Marketing submenu items
const marketingSubItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/marketing' },
  { icon: Megaphone, label: 'Campagne', path: '/marketing/campagne' },
  { icon: DollarSign, label: 'Costi', path: '/marketing/costi' },
  { icon: FileText, label: 'Report', path: '/marketing/report' },
];

// Analytics (admin only)
const analyticsMenuItem = { icon: BarChart3, label: 'Analytics', path: '/admin/analytics' };

// Admin menu items with optional role requirements
const adminMenuItems: Array<{
  icon: typeof UsersRound;
  label: string;
  path: string;
  requiresRole?: ('admin' | 'ceo' | 'responsabile_venditori')[];
}> = [
  { icon: LineChart, label: 'Dashboard CEO', path: '/ceo-dashboard', requiresRole: ['admin', 'ceo'] },
  { icon: UsersRound, label: 'Team', path: '/team' },
  { icon: TrendingUp, label: 'KPI Venditori', path: '/team/salespersons', requiresRole: ['admin', 'ceo', 'responsabile_venditori'] },
  { icon: Package, label: 'Prodotti', path: '/products', requiresRole: ['admin', 'ceo'] },
  { icon: Settings, label: 'Impostazioni', path: '/settings' },
  { icon: Brain, label: 'Gestione AI', path: '/admin/ai' },
  { icon: BarChart3, label: 'AI Metrics', path: '/admin/ai-metrics' },
  { icon: Headphones, label: 'KPI Call Center', path: '/admin/callcenter-kpi' },
  { icon: TrendingUp, label: 'Trend Ticket', path: '/admin/ticket-trend' },
  { icon: Webhook, label: 'Webhook Monitor', path: '/admin/webhooks' },
  { icon: AlertTriangle, label: 'DLQ', path: '/admin/dlq' },
];

export function MainLayout() {
  const { user, signOut, isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasMarketingAccess = useHasMarketingAccess();
  const canSeeMarketingSubmenu = useCanSeeMarketingSubmenu();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Realtime ticket notifications
  const { newTicketsCount, myNewAssignmentsCount, slaBreachCount, resetCounts } = useTicketRealtime();
  const ticketActivityCount = newTicketsCount + myNewAssignmentsCount;

  // Build menu items based on permissions
  const menuItems = useMemo(() => {
    const items = [...baseMenuItems];
    
    // Add Analytics only for admin/ceo
    if (isAdmin || isCeo) {
      items.push(analyticsMenuItem);
    }
    
    return items;
  }, [isAdmin, isCeo]);

  // Check if any marketing path is active
  const isMarketingActive = location.pathname.startsWith('/marketing');

  // Filter admin menu items based on role requirements
  const filteredAdminItems = adminMenuItems.filter(item => {
    if (!item.requiresRole) return true; // No role requirement
    // Check if user has any of the required roles
    return item.requiresRole.some(role => {
      if (role === 'admin') return isAdmin;
      if (role === 'ceo') return isCeo;
      return currentBrand && hasRole(role as any, currentBrand.id);
    });
  });

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
      {/* Screen-pop per chiamate in arrivo VOIspeed */}
      <IncomingCallPopup />
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-4 py-3">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">CRM Gruppo Benessere</span>
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
                  
                  {/* Marketing: full submenu for Admin/CEO/Amministrazione, single link for Responsabili */}
                  {hasMarketingAccess && (
                    canSeeMarketingSubmenu ? (
                      <Collapsible defaultOpen={isMarketingActive} className="group/collapsible">
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              className={isMarketingActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                              disabled={!hasBrandSelected}
                              tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : undefined}
                            >
                              <Megaphone className="h-4 w-4" />
                              <span className="flex-1">Marketing</span>
                              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenu className="ml-4 mt-1 border-l border-sidebar-border pl-2">
                              {marketingSubItems.map((subItem) => (
                                <SidebarMenuItem key={subItem.path}>
                                  <SidebarMenuButton
                                    isActive={location.pathname === subItem.path}
                                    onClick={() => navigate(subItem.path)}
                                    className="h-8"
                                  >
                                    <subItem.icon className="h-3.5 w-3.5" />
                                    <span className="text-sm">{subItem.label}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              ))}
                            </SidebarMenu>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    ) : (
                      /* Responsabili: solo link diretto alla dashboard */
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={location.pathname === '/marketing'}
                          onClick={() => navigate('/marketing')}
                          disabled={!hasBrandSelected}
                          tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : undefined}
                        >
                          <Megaphone className="h-4 w-4" />
                          <span>Marketing</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Amministrazione</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {filteredAdminItems.map((item) => (
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
            <PageHelpButton />
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
