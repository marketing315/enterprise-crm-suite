import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBrand } from '@/contexts/BrandContext';
import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import { useNavigate, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, RefreshCw, ChevronDown, Building2 } from 'lucide-react';

type Period = 'today' | '7d' | '30d' | 'custom';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Oggi',
  '7d': 'Ultimi 7 giorni',
  '30d': 'Questo mese',
  custom: 'Personalizzato',
};

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15s', value: 15_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
  { label: '120s', value: 120_000 },
];

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Query keys to invalidate on auto-refresh */
  queryKeys?: string[][];
  children: React.ReactNode;
}

export function DashboardShell({
  title,
  subtitle,
  icon,
  queryKeys = [],
  children,
}: DashboardShellProps) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const { availableDashboards, defaultRefreshMs } = useRoleDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Period filter — hidden until wired to queries (Fase B)
  const [_period, _setPeriod] = useState<Period>('today');
  const [refreshMs, setRefreshMs] = useState(defaultRefreshMs);

  // Auto-refresh logic
  const doRefresh = useCallback(() => {
    if (queryKeys.length > 0) {
      queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
    } else {
      queryClient.invalidateQueries();
    }
  }, [queryClient, queryKeys]);

  useEffect(() => {
    if (refreshMs <= 0) return;
    const id = setInterval(doRefresh, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, doRefresh]);

  const showDashboardSwitcher = availableDashboards.length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            {isAllBrandsSelected && <Globe className="h-6 w-6 text-primary" />}
            {icon}
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Dashboard switcher */}
          {showDashboardSwitcher && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Cambia vista
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableDashboards.map(d => (
                  <DropdownMenuItem
                    key={d.path}
                    onClick={() => navigate(d.path)}
                    className={location.pathname === d.path ? 'bg-accent' : ''}
                  >
                    {d.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Period selector — hidden until wired to queries (Fase B) */}
          {/* <Select value={_period} onValueChange={(v) => _setPeriod(v as Period)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select> */}

          {/* Auto-refresh */}
          <Select
            value={String(refreshMs)}
            onValueChange={(v) => setRefreshMs(Number(v))}
          >
            <SelectTrigger className="w-[90px] h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Manual refresh */}
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={doRefresh} aria-label="Aggiorna">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Brand context banner for global view */}
      {isAllBrandsSelected && (
        <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm text-primary">
          <Building2 className="h-4 w-4" />
          Vista globale — dati aggregati da tutti i brand
        </div>
      )}

      {/* Content */}
      <div className="min-h-[60vh]">{children}</div>
    </div>
  );
}
