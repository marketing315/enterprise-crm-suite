import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Building2, CheckCircle } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY or SIGNED_IN events from the recovery link
    // Don't redirect immediately — the session may arrive asynchronously via hash/callback
    let timeoutId: ReturnType<typeof setTimeout>;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        // Valid recovery session established
        setIsValidating(false);
        if (timeoutId) clearTimeout(timeoutId);
      }
    });

    // Also check if session already exists (e.g. fast hash parse)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidating(false);
      }
    });

    // Timeout: if no valid session after 10s, redirect
    timeoutId = setTimeout(() => {
      setIsValidating((current) => {
        if (current) {
          toast.error('Link di recupero non valido o scaduto');
          navigate('/login');
        }
        return current;
      });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Le password non coincidono');
      return;
    }

    // A7: enforce password policy at runtime (mirror of edge _shared/password-policy)
    const { validatePassword } = await import('@/lib/password-policy');
    const policy = validatePassword(password);
    if (!policy.ok) {
      toast.error(policy.error || 'Password non valida');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message || 'Errore durante l\'aggiornamento della password');
      } else {
        setIsSuccess(true);
        toast.success('Password aggiornata con successo!');
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    } catch (error) {
      toast.error('Si è verificato un errore');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifica link di recupero...</p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold">CRM Enterprise</h1>
          </div>
        </div>
        
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-primary mb-2" />
            <CardTitle className="text-2xl font-bold">Password aggiornata!</CardTitle>
            <CardDescription>
              La tua password è stata aggiornata con successo. Sarai reindirizzato al login...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold">CRM Enterprise</h1>
        </div>
        <p className="text-muted-foreground">Reimposta la tua password</p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Nuova password</CardTitle>
          <CardDescription>
            Inserisci la tua nuova password
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nuova password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={12}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={12}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aggiornamento in corso...
                </>
              ) : (
                'Aggiorna password'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
