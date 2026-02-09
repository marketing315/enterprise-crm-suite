import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Headphones } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CallcenterManagerDashboard() {
  return (
    <DashboardShell
      title="Responsabile Call Center"
      subtitle="Controllo team operatori, qualità contatti, SLA, produttività"
      icon={<Headphones className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard title="Chiamate effettuate oggi" />
        <PlaceholderCard title="Tasso contatto" />
        <PlaceholderCard title="Tempo medio risposta lead" />
        <PlaceholderCard title="Appuntamenti fissati" />
        <PlaceholderCard title="Da ricontattare in scadenza" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Leaderboard operatori" description="Chiamate, contatti, appuntamenti" />
        <PlaceholderCard title="Heatmap fasce orarie" description="Quando si chiude di più" />
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
