import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus, useCompleteWelcome } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

export function WelcomeModal() {
  const { user } = useAuth();
  const { needsWelcome, isLoading } = useOnboardingStatus();
  const completeWelcome = useCompleteWelcome();

  const defaultName = (user?.full_name || '').trim().split(' ')[0] || '';
  const [name, setName] = useState(defaultName);

  if (isLoading || !needsWelcome) return null;

  const submit = async (preferredName: string) => {
    try {
      await completeWelcome.mutateAsync({
        preferred_name: preferredName,
        // role and brand are assigned by the admin — keep null
        primary_role_hint: null as unknown as string,
        preferred_brand_id: null,
      });
      toast.success(`Benvenuto, ${preferredName}!`);
    } catch (e) {
      toast.error('Impossibile salvare le preferenze. Riprova.');
    }
  };

  const handleSubmit = () => submit(name.trim() || defaultName || 'Utente');
  const handleDismiss = () => submit(defaultName || 'Utente');

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle>Benvenuto nel CRM</DialogTitle>
          </div>
          <DialogDescription>
            Un dato veloce per personalizzare la tua esperienza.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="welcome-name">Come preferisci essere chiamato?</Label>
            <Input
              id="welcome-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={defaultName || 'Il tuo nome'}
              maxLength={60}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={completeWelcome.isPending} className="w-full sm:w-auto">
            {completeWelcome.isPending ? 'Salvataggio…' : 'Inizia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
