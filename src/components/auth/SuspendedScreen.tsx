import { ShieldAlert, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function SuspendedScreen() {
  const { user, signOut } = useAuth();

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-destructive/10 blur-3xl" />

      <main className="relative z-10 flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-[460px]">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-[0_8px_40px_-12px_hsl(var(--destructive)/0.2)] backdrop-blur-xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>

            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
              Account sospeso
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              L'accesso per <span className="font-medium text-foreground">{user?.email}</span> è
              stato disabilitato. Contatta un amministratore per maggiori informazioni.
            </p>

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
