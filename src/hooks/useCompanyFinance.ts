import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Expense, Budget, ExpenseCategory, FinanceKpi, ExpenseFormData, BudgetFormData } from '@/types/company';
import { toast } from 'sonner';

// System brand ID for "Azienda Intera"
export const COMPANY_BRAND_ID = '00000000-0000-0000-0000-000000000000';

// Check if user has finance access
export function useHasFinanceAccess() {
  const { isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand } = useBrand();
  
  // Admin and CEO always have access
  if (isAdmin || isCeo) return true;
  
  // Check for amministrazione role in current brand
  if (currentBrand) {
    return hasRole('amministrazione' as any, currentBrand.id);
  }
  
  return false;
}

// Fetch finance KPIs
export function useFinanceKpis(from: Date, to: Date) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['finance-kpis', brandId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase.rpc('get_admin_finance_kpis', {
        p_brand_id: brandId,
        p_from: from.toISOString().split('T')[0],
        p_to: to.toISOString().split('T')[0],
      }) as { data: FinanceKpi | null; error: Error | null };
      
      if (error) throw error;
      return data as FinanceKpi;
    },
    enabled: !!brandId && hasAccess,
  });
}

// Expense Categories
export function useExpenseCategories() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['expense-categories', brandId],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('brand_id', brandId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as ExpenseCategory[];
    },
    enabled: !!brandId && hasAccess,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useMutation({
    mutationFn: async (name: string) => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ brand_id: brandId, name })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoria creata');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

// Expenses CRUD
export function useExpenses(from: Date, to: Date, categoryId?: string) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['expenses', brandId, from.toISOString(), to.toISOString(), categoryId],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      let query = supabase
        .from('expenses')
        .select(`
          *,
          expense_categories(id, name),
          users:created_by(full_name)
        `)
        .eq('brand_id', brandId)
        .gte('expense_date', from.toISOString().split('T')[0])
        .lte('expense_date', to.toISOString().split('T')[0])
        .order('expense_date', { ascending: false });
      
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!brandId && hasAccess,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const brandId = currentBrand?.id === '__ALL_BRANDS__' ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      if (!brandId || !user) throw new Error('Missing required data');
      
      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          brand_id: brandId,
          category_id: data.category_id || null,
          amount: data.amount,
          expense_date: data.expense_date,
          vendor_name: data.vendor_name || null,
          description: data.description || null,
          notes: data.notes || null,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Costo aggiunto');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ExpenseFormData> }) => {
      const { data: expense, error } = await supabase
        .from('expenses')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Costo aggiornato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Costo eliminato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

// Budgets CRUD
export function useBudgets(periodMonth?: string) {
  const { currentBrand } = useBrand();
  const hasAccess = useHasFinanceAccess();
  const brandId = currentBrand?.id === '__ALL_BRANDS__' ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['budgets', brandId, periodMonth],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      let query = supabase
        .from('budgets')
        .select(`
          *,
          expense_categories(id, name)
        `)
        .eq('brand_id', brandId)
        .order('period_month', { ascending: false });
      
      if (periodMonth) {
        query = query.eq('period_month', periodMonth);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!brandId && hasAccess,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const brandId = currentBrand?.id === '__ALL_BRANDS__' ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useMutation({
    mutationFn: async (data: BudgetFormData) => {
      if (!brandId || !user) throw new Error('Missing required data');
      
      const { data: budget, error } = await supabase
        .from('budgets')
        .insert({
          brand_id: brandId,
          category_id: data.category_id || null,
          period_month: data.period_month,
          planned_amount: data.planned_amount,
          notes: data.notes || null,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Budget salvato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BudgetFormData> }) => {
      const { data: budget, error } = await supabase
        .from('budgets')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Budget aggiornato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] });
      toast.success('Budget eliminato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}
