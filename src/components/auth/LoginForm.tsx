import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, AlertCircle, ArrowUpToLine, MailWarning } from 'lucide-react';
import { ForgotPasswordForm } from './ForgotPasswordForm';

interface LoginFormProps {
  showForgotPassword?: boolean;
  onForgotPasswordChange?: (show: boolean) => void;
}

const SUPPORT_EMAIL = 'marketing@gruppobenessere.it';
const LOGIN_TIMEOUT_MS = 12000;

type LoginErrorKind = 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'generic';

async function resolveLoginWithTimeout(
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>,
  email: string,
  password: string,
): Promise<{ error: Error | null; timedOut?: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      signIn(email, password),
      new Promise<{ error: Error | null; timedOut: boolean }>((resolve) => {
        timer = setTimeout(() => resolve({ error: null, timedOut: true }), LOGIN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyError(message: string | undefined): { kind: LoginErrorKind; text: string } {
  const m = (message || '').toLowerCase();
  if (m.includes('email not confirmed') || m.includes('not confirmed') || m.includes('confirm')) {
    return {
      kind: 'email_not_confirmed',
      text: 'Email non confermata. Controlla la tua casella di posta (anche lo spam) e clicca sul link di conferma prima di accedere.',
    };
  }
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('invalid_grant')) {
    return {
      kind: 'invalid_credentials',
      text: 'Email o password non corretti. Verifica i dati e riprova.',
    };
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return {
      kind: 'rate_limited',
      text: 'Troppi tentativi. Riprova fra qualche minuto.',
    };
  }
  return { kind: 'generic', text: message || 'Accesso non riuscito. Riprova.' };
}

export function LoginForm({ showForgotPassword: externalShow, onForgotPasswordChange }: LoginFormProps = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPasswordInternal, setShowForgotPasswordInternal] = useState(false);
  const [loginError, setLoginError] = useState<{ kind: LoginErrorKind; text: string } | null>(null);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const showForgotPassword = externalShow ?? showForgotPasswordInternal;
  const setShowForgotPassword = onForgotPasswordChange ?? setShowForgotPasswordInternal;

  // Caps Lock detection — globale: utile anche durante l'email
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', handler);
    };
  }, []);

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);

    try {
      const { error, timedOut } = await resolveLoginWithTimeout(signIn, email, password);
      if (error) {
        const classified = classifyError(error.message);
        setLoginError(classified);
        if (classified.kind === 'generic') {
          toast.error(classified.text);
        }
      } else if (timedOut) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          toast.success('Accesso riuscito');
          navigate('/select-brand');
        } else {
          setLoginError({ kind: 'generic', text: 'Accesso in ritardo. Riprova tra qualche secondo.' });
        }
      } else {
        toast.success('Accesso riuscito');
        navigate('/select-brand');
      }
    } catch {
      setLoginError({ kind: 'generic', text: 'Errore imprevisto. Riprova.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Accedi</CardTitle>
        <CardDescription>
          Inserisci le tue credenziali per accedere al CRM
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {loginError && (
            <Alert variant={loginError.kind === 'email_not_confirmed' ? 'default' : 'destructive'}>
              {loginError.kind === 'email_not_confirmed' ? (
                <MailWarning className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{loginError.text}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nome@azienda.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
              className="h-11 md:h-10"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Button
                variant="link"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowForgotPassword(true)}
                type="button"
                tabIndex={-1}
              >
                Password dimenticata?
              </Button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
                className="h-11 md:h-10 pr-11 md:pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                disabled={isLoading}
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {capsLockOn && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <ArrowUpToLine className="h-3.5 w-3.5" />
                <span>Bloc Maiusc è attivo</span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accesso in corso...
              </>
            ) : (
              'Accedi'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            Hai bisogno di aiuto? Contatta il tuo amministratore all'indirizzo{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary hover:underline font-medium"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
