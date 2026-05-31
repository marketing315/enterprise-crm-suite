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
import { AppearanceMenuItems } from './AppearanceMenuItems';
import { usePrefetchOnHover } from '@/hooks/usePrefetchOnHover';
import { IncomingCallPopup } from '@/components/contacts/IncomingCallPopup';
import { IdleTimeoutWatcher } from '@/components/auth/IdleTimeoutWatcher';
import { RealtimeStaleBanner } from '@/components/realtime/RealtimeStaleBanner';
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
  Globe,
  ArrowLeftRight,
  Search,
  Bell,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog';
import { AppBreadcrumbs } from './AppBreadcrumbs';
import { useTicketRealtime } from '@/hooks/useTicketRealtime';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { useDocumentTitleBadge } from '@/hooks/useDocumentTitleBadge';
import { usePrefetchOnLogin } from '@/hooks/usePrefetchOnLogin';
import { RealtimeStatusBanner, RealtimeStatusBadge } from './RealtimeStatusIndicator';
import { SetupReminderBanner } from '@/components/setup/SetupReminderBanner';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { AppTour } from '@/components/onboarding/AppTour';

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
  description?: string; // tooltip esplicativo per non-tech
}

interface NavMenuItemProps {
  item: NavItem;
  isActive: boolean;
  disabled: boolean;
  hasBrandSelected: boolean;
  onNavigate: (path: string) => void;
  ticketActivityCount: number;
  slaBreachCount: number;
}

function NavMenuItem({ item, isActive, disabled, hasBrandSelected, onNavigate, ticketActivityCount, slaBreachCount }: NavMenuItemProps) {
  const hoverHandlers = usePrefetchOnHover(item.path);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => onNavigate(item.path)}
        disabled={disabled}
        tooltip={!hasBrandSelected ? 'Seleziona prima un brand' : item.description}
        data-testid={item.path === '/admin/webhooks' ? 'nav-webhooks-dashboard' : undefined}
        {...hoverHandlers}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1" title={item.description}>{item.label}</span>
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
      { icon: Inbox, label: 'Lead in arrivo', path: '/events', audience: 'daily', description: 'Nuovi contatti acquisiti dai canali marketing' },
      { icon: Kanban, label: 'Pipeline', path: '/pipeline', audience: 'daily', description: 'Le tue trattative in corso, divise per fase' },
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
      { icon: TrendingUp, label: 'Performance Hub', path: '/performance', audience: 'weekly', requiresRole: ['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter'], description: 'Suite completa Dashboard Performance: canali, call center, venditori' },
      { icon: TrendingUp, label: 'Performance venditori', path: '/team/salespersons', audience: 'weekly', requiresRole: ['admin', 'ceo', 'responsabile_venditori'] },
      { icon: Headphones, label: 'Performance call center', path: '/admin/callcenter-kpi', audience: 'weekly', adminOnly: true },
      { icon: Bell, label: 'Alert code VoiSpeed', path: '/admin/voispeed-queue-alerts', audience: 'rare', requiresRole: ['admin', 'ceo', 'responsabile_callcenter'], description: 'Soglie automatiche per attese, abbandoni e service level' },
      { icon: TrendingUp, label: 'Andamento ticket', path: '/admin/ticket-trend', audience: 'weekly', adminOnly: true },
      { icon: BarChart3, label: 'Statistiche AI', path: '/admin/ai-metrics', audience: 'weekly', adminOnly: true, description: "Quanto e come l'AI viene usata nel CRM" },
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
      { icon: Brain, label: 'Assistente AI', path: '/admin/ai', audience: 'daily', adminOnly: true, description: "Configurazione del comportamento dell'assistente AI" },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    collapsible: true,
    ceoOrAdminOnly: true,
    items: [
      { icon: Webhook, label: 'Stato webhook', path: '/admin/webhooks', audience: 'rare', adminOnly: true, description: 'Connessioni in entrata: chi ci sta mandando dati e con quale qualità' },
      { icon: AlertTriangle, label: 'Webhook in errore', path: '/admin/dlq', audience: 'rare', adminOnly: true, description: 'Messaggi che non sono riusciti ad arrivare: vanno controllati e rimandati' },
      { icon: Zap, label: 'Eventi Facebook', path: '/admin/capi', audience: 'rare', adminOnly: true, description: 'Conversioni inviate a Meta (CAPI) per le campagne pubblicitarie' },
      { icon: Target, label: 'Stato del servizio', path: '/admin/slo-board', audience: 'rare', requiresRole: ['admin', 'ceo'], description: 'Salute generale del sistema e affidabilità nel tempo' },
      { icon: ShieldCheck, label: 'Controlli sicurezza', path: '/admin/security-reviews', audience: 'rare', requiresRole: ['admin', 'ceo'], description: 'Revisione periodica di accessi e permessi' },
      { icon: ScrollText, label: 'Storico modifiche', path: '/admin/audit', audience: 'rare', requiresRole: ['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter'], description: 'Chi ha cambiato cosa e quando, per audit e conformità' },
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
  const { currentBrand, hasBrandSelected, brands, systemBrand, isAllBrandsSelected } = useBrand();
  const hasMarketingAccess = useHasMarketingAccess();
  const canSeeMarketingSubmenu = useCanSeeMarketingSubmenu();
  const navigate = useNavigate();
  const location = useLocation();

  const { newTicketsCount, myNewAssignmentsCount, slaBreachCount, resetCounts } = useTicketRealtime();
  const ticketActivityCount = newTicketsCount + myNewAssignmentsCount;

  useGlobalRealtime();
  usePrefetchOnLogin();
  useDocumentTitleBadge();

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

  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Renderer di una singola voce (con badge ticket + hover prefetch)
  const renderItem = (item: NavItem) => (
    <NavMenuItem
      key={item.path}
      item={item}
      isActive={location.pathname === item.path}
      disabled={!hasBrandSelected && item.path !== '/dashboard'}
      hasBrandSelected={hasBrandSelected}
      onNavigate={navigate}
      ticketActivityCount={ticketActivityCount}
      slaBreachCount={slaBreachCount}
    />
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
      {/* H11 a11y: skip-link, primo elemento focusable, salta nav e va al contenuto */}
      <a href="#main-content" className="skip-to-content">Vai al contenuto principale</a>
      <IncomingCallPopup />
      <IdleTimeoutWatcher />
      <RealtimeStaleBanner />
      <WelcomeModal />
      <AppTour />
      <div className="flex min-h-dvh w-full">
        <Sidebar aria-label="Navigazione principale">
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
            <div data-tour="nav-daily">
              {visibleSections.filter(s => s.id === 'daily').map(renderSection)}
            </div>

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
            <div data-tour="nav-insight">
              {visibleSections.filter(s => s.id === 'insight').map(renderSection)}
            </div>

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
                  <AppearanceMenuItems />
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate('/setup')}>
                      <Sliders className="mr-2 h-4 w-4" />
                      Configurazione iniziale
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      const fn = (window as any).__restartAppTour;
                      if (typeof fn === 'function') fn();
                    }}
                  >
                    <Sliders className="mr-2 h-4 w-4" />
                    Rivedi il tour iniziale
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col min-h-dvh overflow-hidden">
          <header className="border-b bg-background shrink-0 sticky top-0 z-30 pt-[env(safe-area-inset-top)]" role="banner" aria-label="Intestazione applicazione">
            <div className="flex min-h-14 items-center gap-0.5 md:gap-3 px-2 md:px-6">
            <SidebarTrigger />
            {currentBrand && (() => {
              const canSwitch = brands.length > 1 || (systemBrand && brands.length >= 1);
              const Icon = isAllBrandsSelected ? Globe : Building2;
              const pillContent = (
                <span className="inline-flex items-center gap-1.5 md:gap-2 rounded-full border border-primary/20 bg-gradient-to-r from-primary/15 to-primary/5 px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium text-primary transition-all hover:from-primary/20 hover:to-primary/10 active:scale-[0.97] max-w-[200px] md:max-w-none shadow-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[120px] md:max-w-[220px]">{currentBrand.name}</span>
                  {canSwitch && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                </span>
              );
              if (!canSwitch) return pillContent;
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Cambia brand"
                      data-tour="brand-selector-header"
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                    >
                      {pillContent}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[280px] p-3">
                    <p className="text-xs text-muted-foreground mb-2">Cambia brand di lavoro</p>
                    <BrandSelector compact />
                  </PopoverContent>
                </Popover>
              );
            })()}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-md border bg-muted/40 text-xs text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Cerca (Cmd+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Cerca…</span>
              <kbd className="ml-2 font-mono text-[10px] rounded bg-background border px-1.5 py-0.5">⌘K</kbd>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Cerca"
            >
              <Search className="h-5 w-5" />
            </Button>
            <RealtimeStatusBadge />
            <PageHelpButton />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu utente">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(user?.full_name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.full_name || 'Utente'}</span>
                    <span className="text-xs text-muted-foreground font-normal truncate">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <AppearanceMenuItems />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const fn = (window as any).__restartAppTour;
                    if (typeof fn === 'function') fn();
                  }}
                >
                  <Sliders className="mr-2 h-4 w-4" />
                  Rivedi il tour iniziale
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </header>
          <AppBreadcrumbs />
          <RealtimeStatusBanner />
          {isAdmin && <SetupReminderBanner />}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden p-3 md:p-6" aria-label="Contenuto principale">
            <ErrorBoundary label="Pagina">
              <Outlet />
            </ErrorBoundary>
          </main>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
