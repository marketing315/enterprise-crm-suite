import { useState } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteButton } from '@/components/shared/ConfirmDeleteButton';
import { formatCurrency } from '@/lib/formatKpi';
import { useExpenses, useCreateExpense, useDeleteExpense, useExpenseCategories, useHasFinanceAccess } from '@/hooks/useCompanyFinance';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CeoExpensesPanelProps {
  from: Date;
  to: Date;
}

export function CeoExpensesPanel({ from, to }: CeoExpensesPanelProps) {
  const navigate = useNavigate();
  const hasAccess = useHasFinanceAccess();
  const { data: expenses, isLoading } = useExpenses(from, to);
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAdd = () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Inserisci un importo valido');
      return;
    }
    createExpense.mutate({
      amount,
      description: newDescription || undefined,
      category_id: newCategoryId || undefined,
      expense_date: newDate,
    }, {
      onSuccess: () => {
        setNewAmount('');
        setNewDescription('');
        setNewCategoryId('');
        setDialogOpen(false);
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteExpense.mutate(id);
  };

  const displayExpenses = (expenses || []).slice(0, 10);

  return (
    <Card className="min-h-[280px]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Costi Recenti</CardTitle>
        <div className="flex gap-1">
          {hasAccess && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Aggiungi
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Aggiungi Costo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Importo (€)</Label>
                    <Input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                      <SelectContent>
                        {(categories || []).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Descrizione</Label>
                    <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Opzionale" />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Annulla</Button></DialogClose>
                  <Button onClick={handleAdd} disabled={createExpense.isPending}>Salva</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="link" size="sm" className="h-auto text-xs gap-1" onClick={() => navigate('/azienda/costi')}>
            <ExternalLink className="h-3 w-3" /> Vedi tutti
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : displayExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nessun costo nel periodo</p>
        ) : (
          <div className="space-y-2">
            {displayExpenses.map(exp => (
              <div key={exp.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{exp.description || exp.vendor_name || 'Costo'}</div>
                  <div className="text-xs text-muted-foreground">
                    {exp.expense_categories?.name || 'N/A'} · {format(new Date(exp.expense_date), 'dd/MM/yyyy')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(exp.amount)}</span>
                  {hasAccess && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(exp.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
