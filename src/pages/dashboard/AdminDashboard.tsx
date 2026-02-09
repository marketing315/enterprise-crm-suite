import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminDashboard() {
  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Salute piattaforma e controllo operativo globale"
      icon={<Shield className="h-6 w-6 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard title="Utenti attivi oggi" />
        <PlaceholderCard title="Webhook OK / KO" />
        <PlaceholderCard title="Ticket aperti / SLA" />
        <PlaceholderCard title="Deal totali + vinti" />
        <PlaceholderCard title="Errori API 4xx/5xx" />
        <PlaceholderCard title="System Health" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Webhook Monitor" description="Ultime 50 delivery" />
        <PlaceholderCard title="Audit Log" description="Ultimi cambi config" />
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
