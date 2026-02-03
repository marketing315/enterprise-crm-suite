import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Lock, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useBrand } from '@/contexts/BrandContext';
import { useTeamMembers, TeamMember } from '@/hooks/useTeam';
import {
  APP_PAGES,
  AppPage,
  PAGE_LABELS,
  HIDEABLE_COLUMNS,
  useRolePagePermissions,
  useUserPagePermissions,
  useRoleHiddenColumns,
  useUserHiddenColumns,
  useUpdateRolePagePermission,
  useUpdateUserPagePermission,
  useUpdateRoleHiddenColumn,
  useUpdateUserHiddenColumn,
} from '@/hooks/useUserPermissions';

// Available roles in the system
const ROLES = [
  { value: 'callcenter', label: 'Callcenter' },
  { value: 'operatore_callcenter', label: 'Operatore Callcenter' },
  { value: 'responsabile_callcenter', label: 'Responsabile Callcenter' },
  { value: 'sales', label: 'Sales' },
  { value: 'venditore', label: 'Venditore' },
  { value: 'responsabile_venditori', label: 'Responsabile Venditori' },
  { value: 'amministrazione', label: 'Amministrazione' },
];

// Page groups for better organization
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

export function UserVisibilitySettings() {
  const { currentBrand } = useBrand();
  const activeBrandId = currentBrand?.id || null;
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0].value);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Fetch team members
  const { data: teamMembers, isLoading: teamLoading } = useTeamMembers(undefined, false);
  
  // Fetch permissions
  const { data: rolePagePerms, isLoading: rolePageLoading } = useRolePagePermissions(activeBrandId);
  const { data: roleHiddenCols, isLoading: roleHiddenLoading } = useRoleHiddenColumns(activeBrandId);
  const { data: userPagePerms, isLoading: userPageLoading } = useUserPagePermissions(selectedUserId, activeBrandId);
  const { data: userHiddenCols, isLoading: userHiddenLoading } = useUserHiddenColumns(selectedUserId, activeBrandId);
  
  // Mutations
  const updateRolePage = useUpdateRolePagePermission();
  const updateUserPage = useUpdateUserPagePermission();
  const updateRoleHidden = useUpdateRoleHiddenColumn();
  const updateUserHidden = useUpdateUserHiddenColumn();
  
  const isRolePageAccessible = (role: string, page: AppPage): boolean => {
    const perm = rolePagePerms?.find(p => p.role === role && p.page === page);
    return perm?.can_access ?? true; // Default to accessible
  };
  
  const isRoleColumnHidden = (role: string, tableName: string, columnKey: string): boolean => {
    const hidden = roleHiddenCols?.find(
      h => h.role === role && h.table_name === tableName && h.column_key === columnKey
    );
    return hidden?.is_hidden ?? false;
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
  
  const handleRolePageToggle = async (page: AppPage, currentValue: boolean) => {
    if (!activeBrandId) return;
    
    try {
      await updateRolePage.mutateAsync({
        brandId: activeBrandId,
        role: selectedRole,
        page,
        canAccess: !currentValue
      });
      toast.success(`Accesso ${!currentValue ? 'abilitato' : 'disabilitato'} per ${PAGE_LABELS[page]}`);
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    }
  };
  
  const handleRoleColumnToggle = async (tableName: string, columnKey: string, currentHidden: boolean) => {
    if (!activeBrandId) return;
    
    try {
      await updateRoleHidden.mutateAsync({
        brandId: activeBrandId,
        role: selectedRole,
        tableName,
        columnKey,
        isHidden: !currentHidden
      });
      toast.success(`Colonna ${!currentHidden ? 'nascosta' : 'visibile'}`);
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    }
  };
  
  const handleUserPageToggle = async (page: AppPage, currentOverride: boolean | null) => {
    if (!activeBrandId || !selectedUserId) return;
    
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
        userId: selectedUserId,
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
    if (!activeBrandId || !selectedUserId) return;
    
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
        userId: selectedUserId,
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
  
  const selectedUser = teamMembers?.find(m => m.user_id === selectedUserId);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Gestione Visibilità</CardTitle>
        </div>
        <CardDescription>
          Configura quali pagine e colonne sono visibili per ogni ruolo o utente specifico
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'roles' | 'users')}>
          <TabsList className="mb-4">
            <TabsTrigger value="roles" className="gap-2">
              <Users className="h-4 w-4" />
              Per Ruolo
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Lock className="h-4 w-4" />
              Per Utente (Override)
            </TabsTrigger>
          </TabsList>
          
          {/* ROLE-BASED PERMISSIONS */}
          <TabsContent value="roles" className="space-y-6">
            <div className="flex items-center gap-4">
              <Label>Seleziona Ruolo:</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {rolePageLoading || roleHiddenLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                {/* Page permissions */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Pagine Accessibili
                  </h4>
                  
                  {PAGE_GROUPS.map(group => (
                    <div key={group.label} className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase">{group.label}</Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {group.pages.map(page => {
                          const isAccessible = isRolePageAccessible(selectedRole, page);
                          return (
                            <div
                              key={page}
                              className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <span className="text-sm truncate">{PAGE_LABELS[page]}</span>
                              <Switch
                                checked={isAccessible}
                                onCheckedChange={() => handleRolePageToggle(page, isAccessible)}
                                disabled={updateRolePage.isPending}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Hidden columns */}
                <div className="space-y-4 mt-6">
                  <h4 className="font-medium flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    Colonne Nascoste
                  </h4>
                  
                  {Object.entries(HIDEABLE_COLUMNS).map(([tableName, columns]) => (
                    <div key={tableName} className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase capitalize">
                        Tabella: {tableName}
                      </Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {columns.map(col => {
                          const isHidden = isRoleColumnHidden(selectedRole, tableName, col.key);
                          return (
                            <div
                              key={col.key}
                              className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <span className="text-sm">{col.label}</span>
                              <Switch
                                checked={isHidden}
                                onCheckedChange={() => handleRoleColumnToggle(tableName, col.key, isHidden)}
                                disabled={updateRoleHidden.isPending}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
          
          {/* USER-SPECIFIC OVERRIDES */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center gap-4">
              <Label>Seleziona Utente:</Label>
              {teamLoading ? (
                <Skeleton className="h-10 w-[250px]" />
              ) : (
                <Select value={selectedUserId || ''} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Seleziona un utente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers?.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name} ({member.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {selectedUserId && selectedUser && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <span className="text-sm text-muted-foreground">Ruolo attuale:</span>
                <Badge variant="secondary">{selectedUser.role}</Badge>
                <span className="text-xs text-muted-foreground ml-2">
                  (gli override sovrascrivono i permessi del ruolo)
                </span>
              </div>
            )}
            
            {!selectedUserId ? (
              <div className="text-center py-8 text-muted-foreground">
                Seleziona un utente per configurare i permessi personalizzati
              </div>
            ) : userPageLoading || userHiddenLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                {/* Page overrides */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Override Pagine
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    🔵 = Usa permesso ruolo | ✅ = Forzato attivo | ❌ = Forzato disattivo
                  </p>
                  
                  {PAGE_GROUPS.map(group => (
                    <div key={group.label} className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase">{group.label}</Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {group.pages.map(page => {
                          const override = getUserPageOverride(page);
                          const roleDefault = isRolePageAccessible(selectedUser?.role || '', page);
                          
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
                <div className="space-y-4 mt-6">
                  <h4 className="font-medium flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    Override Colonne
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    🔵 = Usa impostazione ruolo | 👁️ = Forzato visibile | 🚫 = Forzato nascosto
                  </p>
                  
                  {Object.entries(HIDEABLE_COLUMNS).map(([tableName, columns]) => (
                    <div key={tableName} className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase capitalize">
                        Tabella: {tableName}
                      </Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
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
                                variant={override === null ? 'outline' : override ? 'destructive' : 'default'}
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
