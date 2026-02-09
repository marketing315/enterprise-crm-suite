import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Kanban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesManagerDashboard() {
  return (
    <DashboardShell
      title="Responsabile Venditori"
      subtitle="Pipeline, performance venditori, rischio deal, previsione chiusure"
      icon={<Kanban className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard title="Deal aperti / vinti / persi" />
        <PlaceholderCard title="Pipeline pesata" />
        <PlaceholderCard title="Win rate team" />
        <PlaceholderCard title="Tempo medio chiusura" />
        <PlaceholderCard title="Deal a rischio" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Funnel pipeline" description="Stage → conversione" />
        <PlaceholderCard title="Stalled deals" description="Fermi > X giorni + suggerimento" />
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
