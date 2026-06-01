/**
 * Mobile navigation data — mirrors `MainLayout.NAV_SECTIONS` so the desktop
 * file stays untouched. Visibility logic (role/audience/marketing) is
 * applied by `MobileMoreSheet` via the same hooks used by `MainLayout`.
 *
 * If desktop nav diverges, sync this file. See SPEC §5.
 */
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  Ticket,
  BarChart3,
  Settings,
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
  DollarSign,
  FileText,
  LineChart,
  Zap,
  Target,
  ShieldCheck,
  ScrollText,
  HardDrive,
  type LucideIcon,
} from 'lucide-react';

export type AdvancedRole =
  | 'admin'
  | 'ceo'
  | 'responsabile_venditori'
  | 'responsabile_callcenter'
  | 'amministrazione';

export interface MobileNavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  audience: 'daily' | 'weekly' | 'rare';
  requiresRole?: AdvancedRole[];
  adminOnly?: boolean;
  description?: string;
}

export interface MobileNavSection {
  id: string;
  label: string;
  items: MobileNavItem[];
  adminOnly?: boolean;
  ceoOrAdminOnly?: boolean;
}

export const MOBILE_NAV_SECTIONS: MobileNavSection[] = [
  {
    id: 'daily',
    label: 'Quotidiano',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', audience: 'daily' },
      { icon: Users, label: 'Contatti', path: '/contacts', audience: 'daily' },
      { icon: Inbox, label: 'Lead in arrivo', path: '/events', audience: 'daily' },
      { icon: Kanban, label: 'Pipeline', path: '/pipeline', audience: 'daily' },
      { icon: Calendar, label: 'Appuntamenti', path: '/appointments', audience: 'daily' },
      { icon: Ticket, label: 'Ticket', path: '/tickets', audience: 'daily' },
      { icon: MessageSquare, label: 'Chat', path: '/chat', audience: 'daily' },
    ],
  },
  {
    id: 'sales',
    label: 'Vendite & Clienti',
    items: [
      { icon: ShoppingCart, label: 'Vendite', path: '/sales', audience: 'daily' },
      { icon: Package, label: 'Prodotti', path: '/products', audience: 'daily', requiresRole: ['admin', 'ceo'] },
      { icon: Briefcase, label: 'Azienda', path: '/azienda', audience: 'daily' },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { icon: BarChart3, label: 'Analytics', path: '/admin/analytics', audience: 'weekly', adminOnly: true },
      { icon: LineChart, label: 'Dashboard CEO', path: '/ceo-dashboard', audience: 'weekly', requiresRole: ['admin', 'ceo'] },
      { icon: TrendingUp, label: 'Performance Hub', path: '/performance', audience: 'weekly', requiresRole: ['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter'] },
      { icon: TrendingUp, label: 'Performance venditori', path: '/team/salespersons', audience: 'weekly', requiresRole: ['admin', 'ceo', 'responsabile_venditori'] },
      { icon: Headphones, label: 'Performance call center', path: '/admin/callcenter-kpi', audience: 'weekly', adminOnly: true },
      { icon: TrendingUp, label: 'Andamento ticket', path: '/admin/ticket-trend', audience: 'weekly', adminOnly: true },
      { icon: BarChart3, label: 'Statistiche AI', path: '/admin/ai-metrics', audience: 'weekly', adminOnly: true },
    ],
  },
  {
    id: 'config',
    label: 'Configurazione',
    adminOnly: true,
    items: [
      { icon: Settings, label: 'Impostazioni', path: '/settings', audience: 'daily', adminOnly: true },
      { icon: UsersRound, label: 'Team', path: '/team', audience: 'daily', adminOnly: true },
      { icon: Brain, label: 'Assistente AI', path: '/admin/ai', audience: 'daily', adminOnly: true },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    ceoOrAdminOnly: true,
    items: [
      { icon: Webhook, label: 'Stato webhook', path: '/admin/webhooks', audience: 'rare', adminOnly: true },
      { icon: AlertTriangle, label: 'Webhook in errore', path: '/admin/dlq', audience: 'rare', adminOnly: true },
      { icon: Zap, label: 'Eventi Facebook', path: '/admin/capi', audience: 'rare', adminOnly: true },
      { icon: Target, label: 'Stato del servizio', path: '/admin/slo-board', audience: 'rare', requiresRole: ['admin', 'ceo'] },
      { icon: ShieldCheck, label: 'Controlli sicurezza', path: '/admin/security-reviews', audience: 'rare', requiresRole: ['admin', 'ceo'] },
      { icon: ScrollText, label: 'Storico modifiche', path: '/admin/audit', audience: 'rare', requiresRole: ['admin', 'ceo', 'amministrazione', 'responsabile_venditori', 'responsabile_callcenter'] },
      { icon: HardDrive, label: 'Quick Backup', path: '/admin/quick-backup', audience: 'rare', requiresRole: ['admin', 'ceo'] },
    ],
  },
];

export const MOBILE_MARKETING_ITEMS: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: Megaphone, label: 'Marketing', path: '/marketing' },
  { icon: Megaphone, label: 'Campagne', path: '/marketing/campagne' },
  { icon: DollarSign, label: 'Costi', path: '/marketing/costi' },
  { icon: Users, label: 'Lead', path: '/marketing/leads' },
  { icon: FileText, label: 'Report', path: '/marketing/report' },
];

export const MOBILE_BRAND_ICON = Building2;
