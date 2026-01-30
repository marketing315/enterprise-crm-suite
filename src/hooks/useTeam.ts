import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { toast } from 'sonner';
import type { AppRole } from '@/types/database';

export interface TeamMember {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  can_edit: boolean;
}

export interface AssignableRole {
  value: AppRole;
  label: string;
}

export function useTeamMembers(roleFilter?: AppRole, activeOnly = true) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['team-members', currentBrand?.id, roleFilter, activeOnly],
    queryFn: async () => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.functions.invoke('admin-manage-team', {
        body: {
          action: 'list',
          brand_id: currentBrand.id,
          role_filter: roleFilter || null,
          active_only: activeOnly,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return (data.members || []) as TeamMember[];
    },
    enabled: !!currentBrand,
  });
}

export function useAssignableRoles() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ['assignable-roles', currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.functions.invoke('admin-manage-team', {
        body: {
          action: 'get_assignable_roles',
          brand_id: currentBrand.id,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return (data.roles || []) as AssignableRole[];
    },
    enabled: !!currentBrand,
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: { email: string; role: AppRole; full_name?: string }) => {
      if (!currentBrand) throw new Error('Nessun brand selezionato');

      const { data, error } = await supabase.functions.invoke('admin-manage-team', {
        body: {
          action: 'invite',
          brand_id: currentBrand.id,
          ...params,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      if (data.is_new_user) {
        toast.success('Invito inviato! L\'utente riceverà un\'email per impostare la password.');
      } else if (data.was_existing) {
        toast.success('Utente aggiunto al team con il nuovo ruolo.');
      } else {
        toast.success('Utente aggiunto al team.');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'invito');
    },
  });
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      membership_id: string; 
      new_role?: AppRole; 
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('admin-manage-team', {
        body: {
          action: 'update_member',
          ...params,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Membro aggiornato');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'aggiornamento');
    },
  });
}

// Role display helpers
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  ceo: 'CEO',
  responsabile_venditori: 'Responsabile Venditori',
  responsabile_callcenter: 'Responsabile Call Center',
  venditore: 'Venditore',
  operatore_callcenter: 'Operatore Call Center',
  callcenter: 'Operatore Call Center', // Legacy
  sales: 'Venditore', // Legacy
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  ceo: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  responsabile_venditori: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  responsabile_callcenter: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  venditore: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  operatore_callcenter: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  callcenter: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  sales: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};
