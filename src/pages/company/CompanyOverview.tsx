import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceKpis, useExpenses, useHasFinanceAccess } from '@/hooks/useCompanyFinance';
import { useBrand } from '@/contexts/BrandContext';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Target,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d', '#ffc658'];

import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCompanyOverview } from "@/components/company/mobile/MobileCompanyOverview";

export default function CompanyOverview() {
  const isMobileViewport = useIsMobile();
  if (isMobileViewport) return <MobileCompanyOverview />;
  return <CompanyOverviewDesktop />;
}

function CompanyOverviewDesktop() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  const [periodMonths, setPeriodMonths] = useState('1');
  
  const dateRange = useMemo(() => {
    const months = parseInt(periodMonths);
    const to = endOfMonth(new Date());
    const from = startOfMonth(subMonths(new Date(), months - 1));
    return { from, to };
  }, [periodMonths]);
  
  const { data: kpis, isLoading: kpisLoading } = useFinanceKpis(dateRange.from, dateRange.to);
  const { data: recentExpenses, isLoading: expensesLoading } = useExpenses(dateRange.from, dateRange.to);
  
  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare i dati aziendali.
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
            Non hai i permessi per accedere a questa sezione. Richiedi accesso al ruolo Amministrazione.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const budgetVariance = kpis ? kpis.budget_total - kpis.total_expenses : 0;
  const budgetVariancePercent = kpis && kpis.budget_total > 0 
    ? ((budgetVariance / kpis.budget_total) * 100).toFixed(1)
    : '0';
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Overview Aziendale</h1>
          <p className="text-muted-foreground">
            {currentBrand?.name} — Riepilogo finanziario
          </p>
        </div>
        
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
      
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Vendite */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendite</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(kpis?.sales_total || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Deal vinti nel periodo
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Costi */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costi</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(kpis?.total_expenses || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Totale spese registrate
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Margine */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margine</CardTitle>
            {kpis && kpis.margin >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${(kpis?.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(kpis?.margin || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendite - Costi
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Budget vs Actual */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget vs Actual</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${budgetVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {budgetVariancePercent}%
                  </span>
                  {budgetVariance >= 0 ? (
                    <ArrowDownRight className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {budgetVariance >= 0 ? 'Sotto budget' : 'Sopra budget'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Expenses by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Costi per Categoria</CardTitle>
            <CardDescription>Distribuzione delle spese</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : kpis?.expenses_by_category && kpis.expenses_by_category.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={kpis.expenses_by_category}
                    dataKey="amount"
                    nameKey="category_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ category_name, percent }) => 
                      `${category_name}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {kpis.expenses_by_category.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Budget by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Budget per Categoria</CardTitle>
            <CardDescription>Pianificato vs Effettivo</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : kpis?.budget_by_category && kpis.budget_by_category.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={kpis.budget_by_category}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category_name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="planned_amount" fill="hsl(var(--primary))" name="Budget" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Nessun budget configurato
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ultimi Costi</CardTitle>
          <CardDescription>Le ultime spese registrate</CardDescription>
        </CardHeader>
        <CardContent>
          {expensesLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentExpenses && recentExpenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-2">Data</th>
                    <th className="pb-2">Categoria</th>
                    <th className="pb-2">Fornitore</th>
                    <th className="pb-2">Descrizione</th>
                    <th className="pb-2 text-right">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExpenses.slice(0, 10).map((expense) => (
                    <tr key={expense.id} className="border-b">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nessun costo registrato nel periodo
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
