import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  useBudgets, 
  useExpenseCategories, 
  useCreateBudget, 
  useUpdateBudget, 
  useDeleteBudget,
  useFinanceKpis,
  useHasFinanceAccess 
} from '@/hooks/useCompanyFinance';
import { useBrand } from '@/contexts/BrandContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { Plus, Pencil, Trash2, AlertCircle, ChevronLeft, ChevronRight, Target, TrendingUp, TrendingDown } from 'lucide-react';
import type { Budget, BudgetFormData } from '@/types/company';

export default function CompanyBudget() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  
  const periodMonth = format(selectedMonth, 'yyyy-MM-dd');
  
  const { data: budgets, isLoading } = useBudgets(periodMonth);
  const { data: categories } = useExpenseCategories();
  const { data: kpis } = useFinanceKpis(selectedMonth, endOfMonth(selectedMonth));
  
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  
  // Form state
  const [formData, setFormData] = useState<BudgetFormData>({
    period_month: periodMonth,
    planned_amount: 0,
  });
  
  // Build budget comparison with actuals
  const budgetComparison = useMemo(() => {
    if (!budgets) return [];
    
    const expensesByCategory = new Map<string | null, number>();
    kpis?.expenses_by_category?.forEach(e => {
      expensesByCategory.set(e.category_id, e.amount);
    });
    
    return budgets.map(budget => {
      const actual = expensesByCategory.get(budget.category_id) || 0;
      const variance = budget.planned_amount - actual;
      const percentUsed = budget.planned_amount > 0 
        ? (actual / budget.planned_amount) * 100 
        : 0;
      
      return {
        ...budget,
        actual,
        variance,
        percentUsed,
      };
    });
  }, [budgets, kpis]);
  
  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => 
      direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
    );
  };
  
  const handleOpenDialog = (budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget);
      setFormData({
        category_id: budget.category_id,
        period_month: budget.period_month,
        planned_amount: budget.planned_amount,
        notes: budget.notes || '',
      });
    } else {
      setEditingBudget(null);
      setFormData({
        period_month: periodMonth,
        planned_amount: 0,
      });
    }
    setIsDialogOpen(true);
  };
  
  const handleSubmit = async () => {
    if (editingBudget) {
      await updateBudget.mutateAsync({ id: editingBudget.id, data: formData });
    } else {
      await createBudget.mutateAsync(formData);
    }
    setIsDialogOpen(false);
    setEditingBudget(null);
  };
  
  const handleDelete = async (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questo budget?')) {
      await deleteBudget.mutateAsync(id);
    }
  };
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare il budget.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Non hai i permessi per accedere a questa sezione.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Calculate totals
  const totalBudget = budgetComparison.reduce((sum, b) => sum + b.planned_amount, 0);
  const totalActual = budgetComparison.reduce((sum, b) => sum + b.actual, 0);
  const totalVariance = totalBudget - totalActual;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestione Budget</h1>
          <p className="text-muted-foreground">{currentBrand?.name}</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingBudget ? 'Modifica Budget' : 'Nuovo Budget'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="period_month">Mese *</Label>
                <Input
                  id="period_month"
                  type="month"
                  value={formData.period_month.substring(0, 7)}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    period_month: `${e.target.value}-01` 
                  })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <Select
                  value={formData.category_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, category_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Budget Totale (senza categoria)</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="planned_amount">Importo Pianificato *</Label>
                <Input
                  id="planned_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.planned_amount}
                  onChange={(e) => setFormData({ ...formData, planned_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annulla
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createBudget.isPending || updateBudget.isPending}
              >
                {editingBudget ? 'Salva' : 'Aggiungi'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Month Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold min-w-[200px] text-center">
              {format(selectedMonth, 'MMMM yyyy', { locale: it })}
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Totale</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speso</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalActual)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rimanente</CardTitle>
            {totalVariance >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalVariance)}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Budget Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio Budget</CardTitle>
          <CardDescription>Confronto pianificato vs effettivo per categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : budgetComparison.length > 0 ? (
            <div className="space-y-4">
              {budgetComparison.map((budget) => (
                <div key={budget.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {budget.expense_categories?.name || 'Budget Totale'}
                      </span>
                      {budget.variance < 0 && (
                        <Badge variant="destructive">Sforato</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(budget)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(budget.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm mb-2">
                    <div>
                      <span className="text-muted-foreground">Pianificato</span>
                      <div className="font-medium">{formatCurrency(budget.planned_amount)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Effettivo</span>
                      <div className="font-medium">{formatCurrency(budget.actual)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scostamento</span>
                      <div className={`font-medium ${budget.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(budget.variance)}
                      </div>
                    </div>
                  </div>
                  
                  <Progress 
                    value={Math.min(budget.percentUsed, 100)} 
                    className={`h-2 ${budget.percentUsed > 100 ? '[&>div]:bg-red-500' : ''}`}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    {budget.percentUsed.toFixed(1)}% utilizzato
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">Nessun budget configurato per questo mese</p>
              <Button variant="outline" onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi Budget
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
