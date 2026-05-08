import { useState } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
  DialogDescription} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/formatKpi';
import { ConfirmDeleteButton } from '@/components/shared/ConfirmDeleteButton';
import { useBudgets, useCreateBudget, useDeleteBudget, useExpenseCategories, useHasFinanceAccess } from '@/hooks/useCompanyFinance';

interface CeoBudgetPanelProps {
  from: Date;
}

export function CeoBudgetPanel({ from }: CeoBudgetPanelProps) {
  const navigate = useNavigate();
  const hasAccess = useHasFinanceAccess();
  const periodMonth = format(startOfMonth(from), 'yyyy-MM-dd');
  const { data: budgets, isLoading } = useBudgets(periodMonth);
  const { data: categories } = useExpenseCategories();
  const createBudget = useCreateBudget();
  const deleteBudget = useDeleteBudget();

  const [newAmount, setNewAmount] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAdd = () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;
    createBudget.mutate({
      planned_amount: amount,
      category_id: newCategoryId || undefined,
      period_month: periodMonth,
      notes: newNotes || undefined,
    }, {
      onSuccess: () => {
        setNewAmount('');
        setNewCategoryId('');
        setNewNotes('');
        setDialogOpen(false);
      },
    });
  };

  return (
    <Card className="min-h-[280px]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Budget del Periodo</CardTitle>
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
                  <DialogTitle>Aggiungi Budget</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Importo Pianificato (€)</Label>
                    <Input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0.00" />
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
                    <Label>Note</Label>
                    <Input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Opzionale" />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Annulla</Button></DialogClose>
                  <Button onClick={handleAdd} disabled={createBudget.isPending}>Salva</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="link" size="sm" className="h-auto text-xs gap-1" onClick={() => navigate('/azienda/budget')}>
            <ExternalLink className="h-3 w-3" /> Gestisci budget
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : !budgets || budgets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nessun budget per questo periodo</p>
        ) : (
          <div className="space-y-3">
            {budgets.map(b => (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate max-w-[180px]">
                    {b.expense_categories?.name || 'Generale'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(b.planned_amount)}</span>
                    {hasAccess && (
                      <ConfirmDeleteButton
                        onConfirm={() => deleteBudget.mutate(b.id)}
                        title="Eliminare questo budget?"
                        description={`Budget ${b.expense_categories?.name || 'Generale'} — ${formatCurrency(b.planned_amount)}. L'azione viene tracciata nei log audit.`}
                      />
                    )}
                  </div>
                </div>
                {b.notes && (
                  <p className="text-xs text-muted-foreground">{b.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
