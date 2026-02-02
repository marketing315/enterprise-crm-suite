import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useFinanceKpis, useExpenses, useBudgets, useHasFinanceAccess } from '@/hooks/useCompanyFinance';
import { useBrand } from '@/contexts/BrandContext';
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { AlertCircle, Download, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

export default function CompanyReports() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  const [periodMonths, setPeriodMonths] = useState('6');
  
  const dateRange = useMemo(() => {
    const months = parseInt(periodMonths);
    const to = endOfMonth(new Date());
    const from = startOfMonth(subMonths(new Date(), months - 1));
    return { from, to };
  }, [periodMonths]);
  
  const { data: kpis, isLoading: kpisLoading } = useFinanceKpis(dateRange.from, dateRange.to);
  const { data: expenses } = useExpenses(dateRange.from, dateRange.to);
  
  // Generate monthly trend data
  const monthlyTrend = useMemo(() => {
    if (!expenses) return [];
    
    const months = eachMonthOfInterval({
      start: dateRange.from,
      end: dateRange.to,
    });
    
    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthExpenses = expenses.filter(e => {
        const date = new Date(e.expense_date);
        return date >= monthStart && date <= monthEnd;
      });
      
      const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      return {
        month: format(month, 'MMM yyyy', { locale: it }),
        expenses: total,
      };
    });
  }, [expenses, dateRange]);
  
  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    if (!kpis?.expenses_by_category) return [];
    
    const total = kpis.total_expenses || 1;
    
    return kpis.expenses_by_category.map(cat => ({
      name: cat.category_name,
      amount: cat.amount,
      percentage: ((cat.amount / total) * 100).toFixed(1),
    }));
  }, [kpis]);
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
  
  const handleExportCsv = () => {
    if (!expenses) return;
    
    const headers = ['Data', 'Categoria', 'Fornitore', 'Descrizione', 'Importo'];
    const rows = expenses.map(e => [
      format(new Date(e.expense_date), 'dd/MM/yyyy'),
      e.expense_categories?.name || '',
      e.vendor_name || '',
      e.description || '',
      e.amount.toString(),
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_costi_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare i report.
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
          <h1 className="text-2xl font-bold">Report Finanziari</h1>
          <p className="text-muted-foreground">{currentBrand?.name}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={periodMonths} onValueChange={setPeriodMonths}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Ultimi 3 mesi</SelectItem>
              <SelectItem value="6">Ultimi 6 mesi</SelectItem>
              <SelectItem value="12">Ultimo anno</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Esporta CSV
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendite Periodo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(kpis?.sales_total || 0)}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Costi Periodo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(kpis?.total_expenses || 0)}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className={`text-2xl font-bold flex items-center gap-2 ${(kpis?.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(kpis?.margin || 0)}
                {(kpis?.margin || 0) >= 0 ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <TrendingDown className="h-5 w-5" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margine %
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className={`text-2xl font-bold ${(kpis?.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {kpis?.sales_total && kpis.sales_total > 0
                  ? ((kpis.margin / kpis.sales_total) * 100).toFixed(1)
                  : '0'}%
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Expense Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Costi Mensili</CardTitle>
          <CardDescription>Andamento delle spese nel periodo selezionato</CardDescription>
        </CardHeader>
        <CardContent>
          {kpisLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  name="Costi"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Nessun dato disponibile
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Category Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ripartizione per Categoria</CardTitle>
            <CardDescription>Distribuzione delle spese</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" name="Importo" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Dettaglio Categorie</CardTitle>
            <CardDescription>Importi e percentuali</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : categoryBreakdown.length > 0 ? (
              <div className="space-y-3">
                {categoryBreakdown.map((cat, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{cat.name}</div>
                      <div className="text-sm text-muted-foreground">{cat.percentage}% del totale</div>
                    </div>
                    <div className="text-right font-medium">
                      {formatCurrency(cat.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
