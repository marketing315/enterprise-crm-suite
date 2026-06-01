import { Clock, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function PendingApprovalScreen() {
  const { user, signOut } = useAuth();

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl" />

      <main className="relative z-10 flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-[460px]">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-[0_8px_40px_-12px_hsl(var(--primary)/0.18)] backdrop-blur-xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="h-6 w-6 text-primary" />
            </div>

            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
              Account in attesa di approvazione
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              Il tuo accesso è stato registrato come{' '}
              <span className="font-medium text-foreground">{user?.email}</span>. Un amministratore
              ti assegnerà brand e ruolo a breve. Riceverai una notifica via email appena l'account
              sarà attivo.
            </p>

            <div className="mb-6 flex items-start gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-xs text-muted-foreground">
                Per accelerare l'attivazione, contatta il tuo referente o scrivi a{' '}
                <a
                  href="mailto:supporto@gruppobenessere.it"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  supporto@gruppobenessere.it
                </a>
                .
              </div>
            </div>

            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => void signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Esci
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
