import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CeoDashboardView() {
  return (
    <DashboardShell
      title="CEO Dashboard"
      subtitle="Visione strategica: ricavi, costi, utile, forecast"
      icon={<TrendingUp className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard title="Fatturato periodo" />
        <PlaceholderCard title="Costi totali" />
        <PlaceholderCard title="Utile stimato" />
        <PlaceholderCard title="ROI Marketing" />
        <PlaceholderCard title="Forecast Revenue" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Ricavi vs Costi" description="Grafico linea trend" />
        <PlaceholderCard title="Breakdown costi" description="Per categoria e centro di costo" />
      </div>
    </DashboardShell>
  );
}

function PlaceholderCard({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-muted-foreground">—</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}
