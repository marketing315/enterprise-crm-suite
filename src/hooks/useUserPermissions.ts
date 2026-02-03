import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';

// App page type enum values
export const APP_PAGES = [
  'dashboard',
  'contacts',
  'pipeline',
  'appointments',
  'tickets',
  'sales',
  'events',
  'chat',
  'notifications',
  'marketing_dashboard',
  'marketing_campaigns',
  'marketing_costs',
  'marketing_reports',
  'company_overview',
  'company_expenses',
  'company_budget',
  'company_reports',
  'team',
  'products',
  'salesperson_kpi',
  'ceo_dashboard',
  'admin_analytics',
  'admin_ai',
  'admin_ai_metrics',
  'admin_callcenter_kpi',
  'admin_ticket_trend',
  'admin_webhooks',
  'admin_dlq',
  'settings'
] as const;

export type AppPage = typeof APP_PAGES[number];

// Page labels for UI
export const PAGE_LABELS: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  contacts: 'Contatti',
  pipeline: 'Pipeline',
  appointments: 'Appuntamenti',
  tickets: 'Ticket',
  sales: 'Vendite',
  events: 'Eventi',
  chat: 'Chat',
  notifications: 'Notifiche',
  marketing_dashboard: 'Marketing Dashboard',
  marketing_campaigns: 'Marketing Campagne',
  marketing_costs: 'Marketing Costi',
  marketing_reports: 'Marketing Report',
  company_overview: 'Azienda Overview',
  company_expenses: 'Azienda Spese',
  company_budget: 'Azienda Budget',
  company_reports: 'Azienda Report',
  team: 'Team',
  products: 'Prodotti',
  salesperson_kpi: 'KPI Venditori',
  ceo_dashboard: 'CEO Dashboard',
  admin_analytics: 'Admin Analytics',
  admin_ai: 'Admin AI',
  admin_ai_metrics: 'Admin AI Metrics',
  admin_callcenter_kpi: 'Admin Callcenter KPI',
  admin_ticket_trend: 'Admin Ticket Trend',
  admin_webhooks: 'Admin Webhooks',
  admin_dlq: 'Admin DLQ',
  settings: 'Impostazioni'
};

// Common hideable columns per table
export const HIDEABLE_COLUMNS: Record<string, { key: string; label: string }[]> = {
  contacts: [
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefono' },
    { key: 'address', label: 'Indirizzo' },
    { key: 'city', label: 'Città' },
    { key: 'cap', label: 'CAP' },
    { key: 'notes', label: 'Note' },
  ],
  deals: [
    { key: 'value', label: 'Valore' },
    { key: 'notes', label: 'Note' },
    { key: 'deal_score', label: 'Score' },
  ],
  appointments: [
    { key: 'address', label: 'Indirizzo' },
    { key: 'notes', label: 'Note' },
  ],
};

export interface PagePermission {
  page: AppPage;
  can_access: boolean;
}

export interface HiddenColumn {
  table_name: string;
  column_key: string;
  is_hidden: boolean;
}

export interface UserPermissions {
  user_id: string;
  role: string;
  pages: PagePermission[];
  hidden_columns: HiddenColumn[];
}

// Hook to get current user's permissions
export function useMyPermissions() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  
  return useQuery({
    queryKey: ['my-permissions', brandId],
    queryFn: async () => {
      if (!brandId) return null;
      
      const { data, error } = await supabase.rpc('get_my_permissions', {
        p_brand_id: brandId
      });
      
      if (error) throw error;
      return data as unknown as UserPermissions;
    },
    enabled: !!brandId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Check if current user can access a specific page
export function useCanAccessPage(page: AppPage): boolean {
  const { data: permissions, isLoading } = useMyPermissions();
  const { user } = useAuth();
  
  // While loading, assume access (better UX)
  if (isLoading || !permissions) return true;
  
  // Admin/CEO always have access
  if (permissions.role === 'admin' || permissions.role === 'ceo') return true;
  
  // Find the page permission
  const pagePermission = permissions.pages?.find(p => p.page === page);
  
  // Default to true if no explicit setting
  return pagePermission?.can_access ?? true;
}

// Check if a column is hidden for current user
export function useIsColumnHidden(tableName: string, columnKey: string): boolean {
  const { data: permissions, isLoading } = useMyPermissions();
  
  if (isLoading || !permissions) return false;
  
  // Admin/CEO see everything
  if (permissions.role === 'admin' || permissions.role === 'ceo') return false;
  
  const hidden = permissions.hidden_columns?.find(
    h => h.table_name === tableName && h.column_key === columnKey
  );
  
  return hidden?.is_hidden ?? false;
}

// Get all hidden columns for a table
export function useHiddenColumns(tableName: string): string[] {
  const { data: permissions, isLoading } = useMyPermissions();
  
  if (isLoading || !permissions) return [];
  
  // Admin/CEO see everything
  if (permissions.role === 'admin' || permissions.role === 'ceo') return [];
  
  return permissions.hidden_columns
    ?.filter(h => h.table_name === tableName && h.is_hidden)
    .map(h => h.column_key) ?? [];
}

// ============ ADMIN FUNCTIONS ============

// Get role page permissions for a brand
export function useRolePagePermissions(brandId: string | null) {
  return useQuery({
    queryKey: ['role-page-permissions', brandId],
    queryFn: async () => {
      if (!brandId) return [];
      
      const { data, error } = await supabase
        .from('role_page_permissions')
        .select('*')
        .eq('brand_id', brandId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!brandId,
  });
}

// Get user page permissions for a specific user
export function useUserPagePermissions(userId: string | null, brandId: string | null) {
  return useQuery({
    queryKey: ['user-page-permissions', userId, brandId],
    queryFn: async () => {
      if (!userId || !brandId) return [];
      
      const { data, error } = await supabase
        .from('user_page_permissions')
        .select('*')
        .eq('user_id', userId)
        .eq('brand_id', brandId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!brandId,
  });
}

// Get role hidden columns for a brand
export function useRoleHiddenColumns(brandId: string | null) {
  return useQuery({
    queryKey: ['role-hidden-columns', brandId],
    queryFn: async () => {
      if (!brandId) return [];
      
      const { data, error } = await supabase
        .from('role_hidden_columns')
        .select('*')
        .eq('brand_id', brandId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!brandId,
  });
}

// Get user hidden columns for a specific user
export function useUserHiddenColumns(userId: string | null, brandId: string | null) {
  return useQuery({
    queryKey: ['user-hidden-columns', userId, brandId],
    queryFn: async () => {
      if (!userId || !brandId) return [];
      
      const { data, error } = await supabase
        .from('user_hidden_columns')
        .select('*')
        .eq('user_id', userId)
        .eq('brand_id', brandId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!brandId,
  });
}

// Mutation to update role page permission
export function useUpdateRolePagePermission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      brandId,
      role,
      page,
      canAccess
    }: {
      brandId: string;
      role: string;
      page: AppPage;
      canAccess: boolean;
    }) => {
      const { error } = await supabase
        .from('role_page_permissions')
        .upsert({
          brand_id: brandId,
          role,
          page,
          can_access: canAccess,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'brand_id,role,page'
        });
      
      if (error) throw error;
    },
    onSuccess: (_, { brandId }) => {
      queryClient.invalidateQueries({ queryKey: ['role-page-permissions', brandId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    }
  });
}

// Mutation to update user page permission
export function useUpdateUserPagePermission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      brandId,
      page,
      canAccess
    }: {
      userId: string;
      brandId: string;
      page: AppPage;
      canAccess: boolean | null; // null to remove override
    }) => {
      if (canAccess === null) {
        // Remove override
        const { error } = await supabase
          .from('user_page_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('brand_id', brandId)
          .eq('page', page);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_page_permissions')
          .upsert({
            user_id: userId,
            brand_id: brandId,
            page,
            can_access: canAccess,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,brand_id,page'
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { userId, brandId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-page-permissions', userId, brandId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    }
  });
}

// Mutation to update role hidden column
export function useUpdateRoleHiddenColumn() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      brandId,
      role,
      tableName,
      columnKey,
      isHidden
    }: {
      brandId: string;
      role: string;
      tableName: string;
      columnKey: string;
      isHidden: boolean;
    }) => {
      if (!isHidden) {
        // Remove the hidden setting (show column)
        const { error } = await supabase
          .from('role_hidden_columns')
          .delete()
          .eq('brand_id', brandId)
          .eq('role', role)
          .eq('table_name', tableName)
          .eq('column_key', columnKey);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('role_hidden_columns')
          .upsert({
            brand_id: brandId,
            role,
            table_name: tableName,
            column_key: columnKey,
            is_hidden: isHidden,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'brand_id,role,table_name,column_key'
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { brandId }) => {
      queryClient.invalidateQueries({ queryKey: ['role-hidden-columns', brandId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    }
  });
}

// Mutation to update user hidden column
export function useUpdateUserHiddenColumn() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      brandId,
      tableName,
      columnKey,
      isHidden
    }: {
      userId: string;
      brandId: string;
      tableName: string;
      columnKey: string;
      isHidden: boolean | null; // null to remove override
    }) => {
      if (isHidden === null) {
        // Remove override
        const { error } = await supabase
          .from('user_hidden_columns')
          .delete()
          .eq('user_id', userId)
          .eq('brand_id', brandId)
          .eq('table_name', tableName)
          .eq('column_key', columnKey);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_hidden_columns')
          .upsert({
            user_id: userId,
            brand_id: brandId,
            table_name: tableName,
            column_key: columnKey,
            is_hidden: isHidden,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,brand_id,table_name,column_key'
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, { userId, brandId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-hidden-columns', userId, brandId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    }
  });
}
