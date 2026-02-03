import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useBrand } from '@/contexts/BrandContext';
import { TeamMember } from '@/hooks/useTeam';
import {
  AppPage,
  PAGE_LABELS,
  HIDEABLE_COLUMNS,
  useRolePagePermissions,
  useUserPagePermissions,
  useRoleHiddenColumns,
  useUserHiddenColumns,
  useUpdateUserPagePermission,
  useUpdateUserHiddenColumn,
} from '@/hooks/useUserPermissions';

const PAGE_GROUPS: { label: string; pages: AppPage[] }[] = [
  {
    label: 'Principale',
    pages: ['dashboard', 'contacts', 'pipeline', 'appointments', 'tickets', 'sales', 'events', 'chat', 'notifications']
  },
  {
    label: 'Marketing',
    pages: ['marketing_dashboard', 'marketing_campaigns', 'marketing_costs', 'marketing_reports']
  },
  {
    label: 'Azienda',
    pages: ['company_overview', 'company_expenses', 'company_budget', 'company_reports']
  },
  {
    label: 'Team & Prodotti',
    pages: ['team', 'products', 'salesperson_kpi']
  },
  {
    label: 'Admin',
    pages: ['ceo_dashboard', 'admin_analytics', 'admin_ai', 'admin_ai_metrics', 'admin_callcenter_kpi', 'admin_ticket_trend', 'admin_webhooks', 'admin_dlq', 'settings']
  },
];

interface UserVisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
}

export function UserVisibilityDialog({ open, onOpenChange, member }: UserVisibilityDialogProps) {
  const { currentBrand } = useBrand();
  const activeBrandId = currentBrand?.id || null;
  const userId = member?.user_id || null;

  // Fetch permissions
  const { data: rolePagePerms, isLoading: rolePageLoading } = useRolePagePermissions(activeBrandId);
  const { data: roleHiddenCols, isLoading: roleHiddenLoading } = useRoleHiddenColumns(activeBrandId);
  const { data: userPagePerms, isLoading: userPageLoading } = useUserPagePermissions(userId, activeBrandId);
  const { data: userHiddenCols, isLoading: userHiddenLoading } = useUserHiddenColumns(userId, activeBrandId);

  // Mutations
  const updateUserPage = useUpdateUserPagePermission();
  const updateUserHidden = useUpdateUserHiddenColumn();

  const isRolePageAccessible = (role: string, page: AppPage): boolean => {
    const perm = rolePagePerms?.find(p => p.role === role && p.page === page);
    return perm?.can_access ?? true;
  };

  const getUserPageOverride = (page: AppPage): boolean | null => {
    const perm = userPagePerms?.find(p => p.page === page);
    return perm ? perm.can_access : null;
  };

  const getUserColumnOverride = (tableName: string, columnKey: string): boolean | null => {
    const hidden = userHiddenCols?.find(
      h => h.table_name === tableName && h.column_key === columnKey
    );
    return hidden ? hidden.is_hidden : null;
  };

  const handleUserPageToggle = async (page: AppPage, currentOverride: boolean | null) => {
    if (!activeBrandId || !userId) return;

    // Cycle through: null (inherit) -> true (allow) -> false (deny) -> null
    let newValue: boolean | null;
    if (currentOverride === null) {
      newValue = true;
    } else if (currentOverride === true) {
      newValue = false;
    } else {
      newValue = null;
    }

    try {
      await updateUserPage.mutateAsync({
        userId,
        brandId: activeBrandId,
        page,
        canAccess: newValue
      });
      toast.success(
        newValue === null
          ? `Usando permesso ruolo per ${PAGE_LABELS[page]}`
          : `Accesso ${newValue ? 'abilitato' : 'disabilitato'} per ${PAGE_LABELS[page]}`
      );
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    }
  };

  const handleUserColumnToggle = async (tableName: string, columnKey: string, currentOverride: boolean | null) => {
    if (!activeBrandId || !userId) return;

    // Cycle through: null (inherit) -> true (hidden) -> false (visible) -> null
    let newValue: boolean | null;
    if (currentOverride === null) {
      newValue = true;
    } else if (currentOverride === true) {
      newValue = false;
    } else {
      newValue = null;
    }

    try {
      await updateUserHidden.mutateAsync({
        userId,
        brandId: activeBrandId,
        tableName,
        columnKey,
        isHidden: newValue
      });
      toast.success(
        newValue === null
          ? 'Usando impostazione ruolo'
          : newValue ? 'Colonna nascosta' : 'Colonna visibile'
      );
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    }
  };

  const isLoading = rolePageLoading || roleHiddenLoading || userPageLoading || userHiddenLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Gestione Visibilità
          </DialogTitle>
          <DialogDescription>
            {member?.full_name || member?.email} - Ruolo: <Badge variant="secondary">{member?.role}</Badge>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Page overrides */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Pagine Accessibili
              </h4>
              <p className="text-sm text-muted-foreground">
                🔵 = Usa permesso ruolo | ✅ = Forzato attivo | ❌ = Forzato disattivo
              </p>

              {PAGE_GROUPS.map(group => (
                <div key={group.label} className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase">{group.label}</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {group.pages.map(page => {
                      const override = getUserPageOverride(page);

                      return (
                        <button
                          key={page}
                          onClick={() => handleUserPageToggle(page, override)}
                          disabled={updateUserPage.isPending}
                          className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors text-left"
                        >
                          <span className="text-sm truncate">{PAGE_LABELS[page]}</span>
                          <Badge
                            variant={override === null ? 'outline' : override ? 'default' : 'destructive'}
                            className="ml-2"
                          >
                            {override === null ? '🔵' : override ? '✅' : '❌'}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Column overrides */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                Colonne Dati
              </h4>
              <p className="text-sm text-muted-foreground">
                🔵 = Usa impostazione ruolo | 👁️ = Forzato visibile | 🚫 = Forzato nascosto
              </p>

              {Object.entries(HIDEABLE_COLUMNS).map(([tableName, columns]) => (
                <div key={tableName} className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase capitalize">
                    Tabella: {tableName}
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {columns.map(col => {
                      const override = getUserColumnOverride(tableName, col.key);

                      return (
                        <button
                          key={col.key}
                          onClick={() => handleUserColumnToggle(tableName, col.key, override)}
                          disabled={updateUserHidden.isPending}
                          className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors text-left"
                        >
                          <span className="text-sm">{col.label}</span>
                          <Badge
                            variant={override === null ? 'outline' : override === false ? 'default' : 'destructive'}
                            className="ml-2"
                          >
                            {override === null ? '🔵' : override ? '🚫' : '👁️'}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
