import { useEffect, useMemo, useCallback, useState, memo } from 'react';
import type { AppRole } from '@/types/database';
import type { LucideIcon } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useHasMarketingAccess, useCanSeeMarketingSubmenu } from '@/hooks/useMarketingAccess';
import { userStorage } from '@/lib/userScopedStorage';
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
  Zap,
  Target,
  ShieldCheck,
  ScrollText,
  Sliders,
  HardDrive,
} from 'lucide-react';
import { useTicketRealtime } from '@/hooks/useTicketRealtime';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { usePrefetchOnLogin } from '@/hooks/usePrefetchOnLogin';
import { RealtimeStatusBanner, RealtimeStatusBadge } from './RealtimeStatusIndicator';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { AppTour } from '@/components/onboarding/AppTour';
import { Sparkles as SparklesIcon } from 'lucide-react';

// ============================================================================
// Information architecture
// ============================================================================
// Sezioni orientate al lavoro, non alla struttura tecnica.
// `audience` filtra cosa è visibile di default:
//   - 'daily':   sempre visibile (lavoro quotidiano)
//   - 'weekly':  visibile solo se "Mostra strumenti avanzati" attivo
//   - 'rare':    visibile solo se "Mostra strumenti avanzati" attivo
// `requiresRole`: restrizione su ruolo specifico (sopra al filtro audience).
// Vedi mem://style/sidebar-information-architecture.md

type AdvancedRole = 'admin' | 'ceo' | 'responsabile_venditori' | 'responsabile_callcenter' | 'amministrazione';

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  audience: 'daily' | 'weekly' | 'rare';
  requiresRole?: AdvancedRole[];
  adminOnly?: boolean; // shorthand per isAdmin
}

interface NavSectionDef {
  id: string;
  label: string;
  collapsible: boolean;
  items: NavItem[];
  // Visibilità intera sezione
  adminOnly?: boolean;
  ceoOrAdminOnly?: boolean;
}

const NAV_SECTIONS: NavSectionDef[] = [
  {
    id: 'daily',
    label: 'Quotidiano',
    collapsible: false,
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', audience: 'daily' },
      { icon: Users, label: 'Contatti', path: '/contacts', audience: 'daily' },
      { icon: Inbox, label: 'Eventi', path: '/events', audience: 'daily' },
      { icon: Kanban, label: 'Pipeline', path: '/pipeline', audience: 'daily' },
      { icon: Calendar, label: 'Appuntamenti', path: '/appointments', audience: 'daily' },
      { icon: Ticket, label: 'Ticket', path: '/tickets', audience: 'daily' },
      { icon: MessageSquare, label: 'Chat', path: '/chat', audience: 'daily' },
    ],
  },
  {
    id: 'sales',
    label: 'Vendite & Clienti',
    collapsible: false,
    items: [
      { icon: ShoppingCart, label: 'Vendite', path: '/sales', audience: 'daily' },
      { icon: Package, label: 'Prodotti', path: '/products', audience: 'daily', requiresRole: ['admin', 'ceo'] },
      { icon: Briefcase, label: 'Azienda', path: '/azienda', audience: 'daily' },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    collapsible: true,
    items: [
      { icon: BarChart3, label: 'Analytics', path: '/admin/analytics', audience: 'weekly', adminOnly: true },
      { icon: LineChart, label: 'Dashboard CEO', path: '/ceo-dashboard', audience: 'weekly', requiresRole: ['admin', 'ceo'] },
      { icon: TrendingUp, label: 'KPI Venditori', path: '/team/salespersons', audience: 'weekly', requiresRole: ['admin', 'ceo', 'responsabile_venditori'] },
      { icon: Headphones, label: 'KPI Call Center', path: '/admin/callcenter-kpi', audience: 'weekly', adminOnly: true },
      { icon: TrendingUp, label: 'Trend Ticket', path: '/admin/ticket-trend', audience: 'weekly', adminOnly: true },
      { icon: BarChart3, label: 'AI Metrics', path: '/admin/ai-metrics', audience: 'weekly', adminOnly: true },
    ],
  },
  {
    id: 'config',
    label: 'Configurazione',
    collapsible: false,
    adminOnly: true,
    items: [
      { icon: Settings, label: 'Impostazioni', path: '/settings', audience: 'daily', adminOnly: true },
      { icon: UsersRound, label: 'Team', path: '/team', audience: 'daily', adminOnly: true },
      { icon: Brain, label: 'Gestione AI', path: '/admin/ai', audience: 'daily', adminOnly: true },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    collapsible: true,
    ceoOrAdminOnly: true,
    items: [
      { icon: Webhook, label: 'Webhook Monitor', path: '/admin/webhooks', audience: 'rare', adminOnly: true },
      { icon: AlertTriangle, label: 'DLQ', path: '/admin/dlq', audience: 'rare', adminOnly: true },
      { icon: Zap, label: 'CAPI Monitor', path: '/admin/capi', audience: 'rare', adminOnly: true },
      { icon: Target, label: 'SLO Board', path: '/admin/slo-board', audience: 'rare', requiresRole: ['admin', 'ceo'] },
      { icon: ShieldCheck, label: 'Security Review', path: '/admin/security-reviews', audience: 'rare', requiresRole: ['admin', 'ceo'] },
      { icon: ScrollText, label: 'Audit & Compliance', path: '/admin/audit', audience: 'rare', requiresRole: ['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter'] },
      { icon: HardDrive, label: 'Quick Backup', path: '/admin/quick-backup', audience: 'rare', requiresRole: ['admin', 'ceo'] },
    ],
  },
];

// Marketing submenu items
const marketingSubItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/marketing' },
  { icon: Megaphone, label: 'Campagne', path: '/marketing/campagne' },
  { icon: DollarSign, label: 'Costi', path: '/marketing/costi' },
  { icon: Users, label: 'Lead', path: '/marketing/leads' },
  { icon: FileText, label: 'Report', path: '/marketing/report' },
];

const ADVANCED_PREF_KEY = 'sidebar.showAdvanced';

export function MainLayout() {
  const { user, signOut, isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasMarketingAccess = useHasMarketingAccess();
  const canSeeMarketingSubmenu = useCanSeeMarketingSubmenu();
  const navigate = useNavigate();
  const location = useLocation();

  const { newTicketsCount, myNewAssignmentsCount, slaBreachCount, resetCounts } = useTicketRealtime();
  const ticketActivityCount = newTicketsCount + myNewAssignmentsCount;

  useGlobalRealtime();
  usePrefetchOnLogin();

  // Toggle "Mostra strumenti avanzati" — persistito per-utente.
  // Se l'utente sta navigando in una route weekly/rare, forziamo true per non rompere la nav.
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    return userStorage.getItem(ADVANCED_PREF_KEY) === 'true';
  });

  // Permission check riusabile
  const itemAllowed = useCallback((item: NavItem): boolean => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.requiresRole) {
      const ok = item.requiresRole.some(role => {
        if (role === 'admin') return isAdmin;
        if (role === 'ceo') return isCeo;
        return currentBrand && hasRole(role as AppRole, currentBrand.id);
      });
      if (!ok) return false;
    }
    return true;
  }, [isAdmin, isCeo, currentBrand, hasRole]);

  // Auto-attiva advanced se la route corrente è dietro al toggle
  useEffect(() => {
    if (showAdvanced) return;
    const inAdvanced = NAV_SECTIONS.some(sec =>
      sec.items.some(it =>
        it.audience !== 'daily' &&
        itemAllowed(it) &&
        location.pathname.startsWith(it.path)
      )
    );
    if (inAdvanced) setShowAdvanced(true);
  }, [location.pathname, showAdvanced, itemAllowed]);

  const toggleAdvanced = useCallback(() => {
    setShowAdvanced(prev => {
      const next = !prev;
      userStorage.setItem(ADVANCED_PREF_KEY, next ? 'true' : 'false');
      return next;
    });
  }, []);

  // Sezioni filtrate per ruolo + audience
  const visibleSections = useMemo(() => {
    return NAV_SECTIONS.map(sec => {
      // Visibilità sezione
      if (sec.adminOnly && !isAdmin) return null;
      if (sec.ceoOrAdminOnly && !(isAdmin || isCeo)) return null;

      const items = sec.items.filter(it => {
        if (!itemAllowed(it)) return false;
        if (!showAdvanced && it.audience !== 'daily') return false;
        return true;
      });

      if (items.length === 0) return null;
      return { ...sec, items };
    }).filter((s): s is NavSectionDef => s !== null);
  }, [isAdmin, isCeo, itemAllowed, showAdvanced]);

  // Ci sono voci avanzate disponibili (per ruolo) ma nascoste? → mostra il toggle
  const hasAdvancedAvailable = useMemo(() => {
    return NAV_SECTIONS.some(sec => {
      if (sec.adminOnly && !isAdmin) return false;
      if (sec.ceoOrAdminOnly && !(isAdmin || isCeo)) return false;
      return sec.items.some(it => it.audience !== 'daily' && itemAllowed(it));
    });
  }, [isAdmin, isCeo, itemAllowed]);

  const isMarketingActive = location.pathname.startsWith('/marketing');

  useEffect(() => {
    if (location.pathname === '/tickets') {
      resetCounts();
    }
  }, [location.pathname, resetCounts]);

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate('/login');
  }, [signOut, navigate]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Renderer di una singola voce (con badge ticket)
  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.path}>
      <SidebarMenuButton
        isActive={location.pathname === item.path}
        onClick={() => navigate(item.path)}
        disabled={!hasBrandSelected && item.path !== '/dashboard'}
        tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : undefined}
        data-testid={item.path === '/admin/webhooks' ? 'nav-webhooks-dashboard' : undefined}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        {item.path === '/tickets' && ticketActivityCount > 0 && (
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs" data-testid="sidebar-ticket-badge">
            {ticketActivityCount > 99 ? '99+' : ticketActivityCount}
          </Badge>
        )}
        {item.path === '/tickets' && slaBreachCount > 0 && (
          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs" data-testid="sidebar-sla-badge">
            SLA {slaBreachCount > 99 ? '99+' : slaBreachCount}
          </Badge>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  // Renderer di una sezione (collapsible o flat)
  const renderSection = (sec: NavSectionDef) => {
    const sectionActive = sec.items.some(it => location.pathname.startsWith(it.path));

    if (!sec.collapsible) {
      return (
        <SidebarGroup key={sec.id}>
          <SidebarGroupLabel>{sec.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{sec.items.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }

    // Collapsible: defaultOpen solo se la route corrente è dentro la sezione
    return (
      <SidebarGroup key={sec.id}>
        <Collapsible defaultOpen={sectionActive} className="group/section">
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center justify-between hover:text-sidebar-foreground transition-colors">
              <span>{sec.label}</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/section:rotate-90" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>{sec.items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>
    );
  };

  return (
    <SidebarProvider>
      <IncomingCallPopup />
      <WelcomeModal />
      <AppTour />
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-4 py-3">
              <img src="/favicon.svg" alt="Logo" className="h-7 w-7" />
              <div className="flex flex-col">
                <h1 className="font-bold text-lg leading-tight">CRM</h1>
                <h2 className="text-xs text-muted-foreground leading-tight">Gruppo Benessere</h2>
              </div>
            </div>
            <div className="px-4 pb-3" data-tour="brand-selector">
              <BrandSelector compact />
            </div>
          </SidebarHeader>

          <SidebarContent>
            {/* Sezione Quotidiano */}
            {visibleSections.filter(s => s.id === 'daily').map(renderSection)}

            {/* Sezione Vendite & Clienti */}
            {visibleSections.filter(s => s.id === 'sales').map(renderSection)}

            {/* Marketing — collapsible dedicato (logica accesso esistente preservata) */}
            {hasMarketingAccess && (
              <SidebarGroup>
                {canSeeMarketingSubmenu ? (
                  <Collapsible defaultOpen={isMarketingActive} className="group/marketing">
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center justify-between hover:text-sidebar-foreground transition-colors">
                        <span>Marketing</span>
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/marketing:rotate-90" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              isActive={location.pathname === '/marketing'}
                              onClick={() => navigate('/marketing')}
                              disabled={!hasBrandSelected}
                            >
                              <Megaphone className="h-4 w-4" />
                              <span>Panoramica</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          {marketingSubItems.filter(s => s.path !== '/marketing').map(subItem => (
                            <SidebarMenuItem key={subItem.path}>
                              <SidebarMenuButton
                                isActive={location.pathname === subItem.path}
                                onClick={() => navigate(subItem.path)}
                              >
                                <subItem.icon className="h-4 w-4" />
                                <span>{subItem.label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <>
                    <SidebarGroupLabel>Marketing</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
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
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </>
                )}
              </SidebarGroup>
            )}

            {/* Sezione Insight (collapsible, default chiuso salvo route attiva) */}
            {visibleSections.filter(s => s.id === 'insight').map(renderSection)}

            {/* Sezione Configurazione */}
            {visibleSections.filter(s => s.id === 'config').map(renderSection)}

            {/* Sezione Sistema (collapsible, default chiuso salvo route attiva) */}
            {visibleSections.filter(s => s.id === 'system').map(renderSection)}

            {/* Toggle "Strumenti avanzati" */}
            {hasAdvancedAvailable && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={toggleAdvanced}
                        className="text-muted-foreground hover:text-sidebar-foreground"
                        tooltip={showAdvanced ? 'Nascondi Insight e Sistema' : 'Mostra Insight e Sistema'}
                      >
                        <Sliders className="h-4 w-4" />
                        <span className="text-xs">
                          {showAdvanced ? 'Nascondi strumenti avanzati' : 'Mostra strumenti avanzati'}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
            <RealtimeStatusBadge />
            <PageHelpButton />
            <NotificationBell />
            {currentBrand && (
              <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                <Building2 className="h-4 w-4 hidden sm:block" />
                <span className="truncate max-w-[120px] md:max-w-none">{currentBrand.name}</span>
              </div>
            )}
          </header>
          <RealtimeStatusBanner />
          <main className="flex-1 overflow-hidden p-3 md:p-6">
            <ErrorBoundary label="Pagina">
              <Outlet />
            </ErrorBoundary>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
