import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, formatPercent } from '@/lib/formatKpi';
import type { BudgetBaseline } from '@/types/company';

interface BudgetBaselineCardProps {
  data: BudgetBaseline;
}

export function BudgetBaselineCard({ data }: BudgetBaselineCardProps) {
  const utilizationPercent = data.total_planned > 0 
    ? Math.min(100, (data.total_spent / data.total_planned) * 100)
    : 0;
  
  const isOverBudget = data.variance < 0;
  
  return (
    <Card className="min-h-[280px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5" />
          Budget Baseline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Pianificato</p>
            <p className="text-lg font-semibold">{formatCurrency(data.total_planned)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Speso</p>
            <p className="text-lg font-semibold">{formatCurrency(data.total_spent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Disponibile</p>
            <p className={`text-lg font-semibold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(data.remaining_allocable)}
            </p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Utilizzo budget</span>
            <span className={isOverBudget ? 'text-red-600 font-medium' : ''}>
              {utilizationPercent.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={utilizationPercent} 
            className={isOverBudget ? '[&>div]:bg-red-600' : ''}
          />
        </div>
        
        {/* Variance indicator */}
        <div className={`flex items-center gap-2 p-2 rounded-md ${
          isOverBudget 
            ? 'bg-red-50 dark:bg-red-950/30' 
            : 'bg-green-50 dark:bg-green-950/30'
        }`}>
          {isOverBudget ? (
            <TrendingDown className="h-4 w-4 text-red-600" />
          ) : (
            <TrendingUp className="h-4 w-4 text-green-600" />
          )}
          <span className={`text-sm font-medium ${
            isOverBudget ? 'text-red-600' : 'text-green-600'
          }`}>
            {isOverBudget ? 'Sopra budget del ' : 'Sotto budget del '}
            {formatPercent(Math.abs(data.variance_percent))}
          </span>
        </div>
        
        {/* Categories over budget */}
        {data.categories_over_budget && data.categories_over_budget.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">Categorie sopra budget</span>
            </div>
            <ul className="space-y-2">
              {data.categories_over_budget.map((cat, idx) => (
                <li key={idx} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{cat.category_name}</span>
                  <span className="text-red-600 font-medium">
                    +{formatCurrency(cat.overage)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
