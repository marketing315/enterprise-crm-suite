import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/formatKpi';
import type { DealsByStage } from '@/hooks/useCeoOperationalKpis';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(217, 91%, 60%)',
  'hsl(280, 65%, 60%)',
];

interface CeoPipelineOverviewProps {
  stages: DealsByStage[];
  wonDeals: number;
  wonRevenue: number;
}

export function CeoPipelineOverview({ stages, wonDeals, wonRevenue }: CeoPipelineOverviewProps) {
  const navigate = useNavigate();

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Pipeline Overview</CardTitle>
        <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => navigate('/pipeline')}>
          Vai alla Pipeline →
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage.stage_name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[200px]">{stage.stage_name}</span>
              <span className="text-muted-foreground">
                {formatNumber(stage.count)} deal · {formatCurrency(stage.total_value)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max((stage.count / maxCount) * 100, 2)}%`,
                  backgroundColor: COLORS[idx % COLORS.length],
                }}
              />
            </div>
          </div>
        ))}

        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun deal aperto
          </p>
        )}

        {wonDeals > 0 && (
          <div className="pt-3 border-t flex items-center justify-between text-sm">
            <span className="font-medium text-green-600">Deal Chiusi (Won)</span>
            <span className="text-green-600 font-semibold">
              {formatNumber(wonDeals)} · {formatCurrency(wonRevenue)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
