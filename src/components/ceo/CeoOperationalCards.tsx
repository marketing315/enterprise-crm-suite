import { Users, TicketCheck, CalendarCheck, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/formatKpi';
import type { CeoOperationalData } from '@/hooks/useCeoOperationalKpis';

interface CeoOperationalCardsProps {
  data: CeoOperationalData;
}

export function CeoOperationalCards({ data }: CeoOperationalCardsProps) {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Contatti Totali',
      value: formatNumber(data.total_contacts),
      subtitle: `+${formatNumber(data.new_contacts_period)} nel periodo`,
      icon: Users,
      href: '/contacts',
    },
    {
      title: 'Ticket Aperti',
      value: formatNumber(data.open_tickets),
      subtitle: `${formatNumber(data.tickets_created)} creati nel periodo`,
      icon: TicketCheck,
      href: '/tickets',
    },
    {
      title: 'Appuntamenti',
      value: formatNumber(data.appointments_period),
      subtitle: 'nel periodo (esclusi annullati)',
      icon: CalendarCheck,
      href: '/appointments',
    },
    {
      title: 'Deal Aperti',
      value: formatNumber(data.total_open_deals),
      subtitle: `${formatNumber(data.won_deals_period)} chiusi nel periodo`,
      icon: Briefcase,
      href: '/pipeline',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="relative min-h-[120px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
            <Button
              variant="link"
              size="sm"
              className="px-0 mt-2 h-auto text-xs"
              onClick={() => navigate(card.href)}
            >
              Dettagli →
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
