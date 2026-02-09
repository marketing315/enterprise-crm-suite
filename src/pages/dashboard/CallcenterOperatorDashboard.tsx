import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CallcenterOperatorDashboard() {
  return (
    <DashboardShell
      title="Dashboard Operatore"
      subtitle="Chi chiamare adesso, script, risultati"
      icon={<Phone className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PlaceholderCard title="Chiamate fatte oggi" />
        <PlaceholderCard title="Contatti utili" />
        <PlaceholderCard title="Appuntamenti fissati" />
        <PlaceholderCard title="Ricontatti prossimi 30 min" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Next Best Call" description="Lista prioritaria con script consigliato" />
        <PlaceholderCard title="Ricontatti pianificati" description="Agenda cron ricontatti" />
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
