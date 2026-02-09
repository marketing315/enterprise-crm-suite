import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalespersonDashboard() {
  return (
    <DashboardShell
      title="Dashboard Venditore"
      subtitle="Chiudere: follow-up, deal caldi, agenda, vendite"
      icon={<Target className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard title="Deal attivi" />
        <PlaceholderCard title="Pipeline personale" />
        <PlaceholderCard title="Deal caldi" />
        <PlaceholderCard title="Task oggi" />
        <PlaceholderCard title="Vendite mese" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Today Focus" description="5 azioni consigliate AI" />
        <PlaceholderCard title="Performance personale" description="Trend win rate / tempo chiusura" />
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
