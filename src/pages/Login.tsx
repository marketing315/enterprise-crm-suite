import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { PasskeyLoginButton } from '@/components/auth/PasskeyLoginButton';
import { PinLoginDialog } from '@/components/auth/PinLoginDialog';
import { SignupDialog } from '@/components/auth/SignupDialog';
import logo from '@/assets/logo.svg';

export default function Login() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!isLoading && session) {
      navigate('/select-brand');
    }
  }, [session, isLoading, navigate]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      {/* Ambient orbs — non interagiscono, danno profondità C-level */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-primary/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.015] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      <main className="relative z-10 flex w-full max-w-[420px] flex-col">
        {/* Brand header */}
        <header className="mb-10 flex flex-col items-center text-center">
          <img src={logo} alt="Gruppo Benessere" className="h-11 w-auto mb-5" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            CRM Gruppo Benessere
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {showForgotPassword ? 'Recupera la tua password' : 'Accedi al tuo spazio di lavoro'}
          </p>
        </header>

        {/* Glass card */}
        <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl shadow-[0_8px_40px_-12px_hsl(var(--primary)/0.18)] p-6 sm:p-8">
          {!showForgotPassword && (
            <div className="space-y-2.5">
              <PasskeyLoginButton />
              <SocialLoginButtons />
            </div>
          )}

          {!showForgotPassword && (
            <div className="my-6 flex items-center gap-3" role="separator">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                oppure con email
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
          )}

          <LoginForm
            showForgotPassword={showForgotPassword}
            onForgotPasswordChange={setShowForgotPassword}
          />

          {!showForgotPassword && (
            <div className="mt-5 flex flex-col items-center gap-3">
              <PinLoginDialog triggerLabel="Accedi con PIN" />
              <button
                type="button"
                onClick={() => setShowSignup(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Non hai un account? <span className="font-medium">Registrati</span>
              </button>
            </div>
          )}
        </section>

        <SignupDialog open={showSignup} onOpenChange={setShowSignup} />

        {/* Support + privacy */}
        <footer className="mt-8 text-center text-xs text-muted-foreground space-y-2">
          <p>
            Serve aiuto?{' '}
            <a
              href="mailto:marketing@gruppobenessere.it"
              className="font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              Contatta l'amministratore
            </a>
          </p>
          <Link
            to="/privacy"
            className="inline-block hover:text-foreground transition-colors"
          >
            Informativa Privacy
          </Link>
        </footer>
      </main>
    </div>
  );
}
