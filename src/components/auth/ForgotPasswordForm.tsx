import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // A4-A10: anti-abuse rate limit (5 reset / 15 min, then 15 min lock).
      const { consumeAuthRateLimit, formatRetryAfter } = await import(
        "@/lib/auth-rate-limit"
      );
      const rl = await consumeAuthRateLimit(email, "password_reset");
      if (!rl.allowed) {
        const wait = rl.retry_after_seconds ?? 900;
        toast.error(
          `Troppe richieste di recupero password. Riprova fra ${formatRetryAfter(wait)}.`,
        );
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(error.message || 'Errore durante l\'invio dell\'email');
      } else {
        setEmailSent(true);
        toast.success('Email di recupero inviata!');
      }
    } catch (error) {
      toast.error('Si è verificato un errore');
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Controlla la tua email</CardTitle>
          <CardDescription>
            Abbiamo inviato un link di recupero password a <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se non vedi l'email, controlla la cartella spam.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna al login
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Password dimenticata</CardTitle>
        <CardDescription>
          Inserisci la tua email per ricevere un link di recupero
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
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
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Invio in corso...
              </>
            ) : (
              'Invia link di recupero'
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onBack} type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna al login
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
