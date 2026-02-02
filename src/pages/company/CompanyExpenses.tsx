import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  useExpenses, 
  useExpenseCategories, 
  useCreateExpense, 
  useUpdateExpense, 
  useDeleteExpense,
  useCreateExpenseCategory,
  useHasFinanceAccess 
} from '@/hooks/useCompanyFinance';
import { useBrand } from '@/contexts/BrandContext';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { Plus, Pencil, Trash2, AlertCircle, Search, Filter } from 'lucide-react';
import type { Expense, ExpenseFormData } from '@/types/company';

export default function CompanyExpenses() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  const [periodMonths, setPeriodMonths] = useState('1');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  
  const dateRange = useMemo(() => {
    const months = parseInt(periodMonths);
    const to = endOfMonth(new Date());
    const from = startOfMonth(subMonths(new Date(), months - 1));
    return { from, to };
  }, [periodMonths]);
  
  const { data: expenses, isLoading } = useExpenses(
    dateRange.from, 
    dateRange.to,
    categoryFilter !== 'all' ? categoryFilter : undefined
  );
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateExpenseCategory();
  
  // Form state
  const [formData, setFormData] = useState<ExpenseFormData>({
    amount: 0,
    expense_date: format(new Date(), 'yyyy-MM-dd'),
  });
  
  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!searchTerm) return expenses;
    
    const term = searchTerm.toLowerCase();
    return expenses.filter(e => 
      e.vendor_name?.toLowerCase().includes(term) ||
      e.description?.toLowerCase().includes(term) ||
      e.expense_categories?.name?.toLowerCase().includes(term)
    );
  }, [expenses, searchTerm]);
  
  const handleOpenDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        category_id: expense.category_id,
        amount: expense.amount,
        expense_date: expense.expense_date,
        vendor_name: expense.vendor_name || '',
        description: expense.description || '',
        notes: expense.notes || '',
      });
    } else {
      setEditingExpense(null);
      setFormData({
        amount: 0,
        expense_date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
    setIsDialogOpen(true);
  };
  
  const handleSubmit = async () => {
    if (editingExpense) {
      await updateExpense.mutateAsync({ id: editingExpense.id, data: formData });
    } else {
      await createExpense.mutateAsync(formData);
    }
    setIsDialogOpen(false);
    setEditingExpense(null);
  };
  
  const handleDelete = async (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questo costo?')) {
      await deleteExpense.mutateAsync(id);
    }
  };
  
  const handleCreateCategory = async () => {
    if (newCategoryName.trim()) {
      await createCategory.mutateAsync(newCategoryName.trim());
      setNewCategoryName('');
      setIsCreatingCategory(false);
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
            Seleziona un brand dalla sidebar per visualizzare i costi.
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestione Costi</h1>
          <p className="text-muted-foreground">{currentBrand?.name}</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Costo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingExpense ? 'Modifica Costo' : 'Nuovo Costo'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Importo *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="expense_date">Data *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                />
              </div>
              
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category">Categoria</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Nuova
                  </Button>
                </div>
                {isCreatingCategory ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome categoria"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Button size="sm" onClick={handleCreateCategory}>
                      Crea
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={formData.category_id || 'none'}
                    onValueChange={(v) => setFormData({ ...formData, category_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna categoria</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="vendor_name">Fornitore</Label>
                <Input
                  id="vendor_name"
                  value={formData.vendor_name || ''}
                  onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Descrizione</Label>
                <Input
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                disabled={createExpense.isPending || updateExpense.isPending}
              >
                {editingExpense ? 'Salva' : 'Aggiungi'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca per fornitore, descrizione..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={periodMonths} onValueChange={setPeriodMonths}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Ultimo mese</SelectItem>
                <SelectItem value="3">Ultimi 3 mesi</SelectItem>
                <SelectItem value="6">Ultimi 6 mesi</SelectItem>
                <SelectItem value="12">Ultimo anno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Elenco Costi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredExpenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-2">Data</th>
                    <th className="pb-2">Categoria</th>
                    <th className="pb-2">Fornitore</th>
                    <th className="pb-2">Descrizione</th>
                    <th className="pb-2 text-right">Importo</th>
                    <th className="pb-2 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 text-sm">
                        {format(new Date(expense.expense_date), 'dd/MM/yyyy', { locale: it })}
                      </td>
                      <td className="py-3 text-sm">
                        {expense.expense_categories?.name || '-'}
                      </td>
                      <td className="py-3 text-sm">{expense.vendor_name || '-'}</td>
                      <td className="py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                        {expense.description || '-'}
                      </td>
                      <td className="py-3 text-sm text-right font-medium">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(expense)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(expense.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nessun costo trovato
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
