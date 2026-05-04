import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, Webhook, UsersRound, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface ActionCard {
  icon: typeof UserPlus;
  title: string;
  desc: string;
  cta: string;
  to: string;
  tour?: string;
}

export function DashboardEmptyState() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const cards: ActionCard[] = [
    {
      icon: UserPlus,
      title: 'Aggiungi il primo contatto',
      desc: 'Crea manualmente un contatto per iniziare a popolare il database.',
      cta: 'Nuovo contatto',
      to: '/contacts?create=true',
      tour: 'new-contact',
    },
    ...(isAdmin
      ? [
          {
            icon: Webhook,
            title: 'Configura un webhook inbound',
            desc: 'Collega Meta, Keplero o sorgenti custom per importare lead in automatico.',
            cta: 'Apri Webhook',
            to: '/admin/webhooks',
          } as ActionCard,
          {
            icon: UsersRound,
            title: 'Invita un collega',
            desc: 'Aggiungi membri al team e assegna ruoli per iniziare a collaborare.',
            cta: 'Vai al Team',
            to: '/team',
          } as ActionCard,
        ]
      : []),
  ];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-6 md:p-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold">Inizia da qui</h2>
            <p className="text-sm text-muted-foreground">
              Il tuo workspace è vuoto. Ecco cosa puoi fare ora.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, idx) => {
            const Icon = c.icon;
            return (
              <button
                key={c.to}
                onClick={() => navigate(c.to)}
                data-tour={c.tour}
                className="group text-left rounded-lg border bg-card p-4 hover:border-primary/40 hover:bg-accent/50 transition-all"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-medium text-sm mb-1">{c.title}</h3>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{c.desc}</p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  {c.cta}
                </Button>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
