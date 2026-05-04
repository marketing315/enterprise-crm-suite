import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { useOnboardingStatus, useCompleteWelcome } from '@/hooks/useOnboardingStatus';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'sales', label: 'Vendite' },
  { value: 'callcenter', label: 'Call Center' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'admin', label: 'Amministrazione' },
  { value: 'ceo', label: 'Direzione / CEO' },
  { value: 'other', label: 'Altro' },
];

export function WelcomeModal() {
  const { user } = useAuth();
  const { brands, currentBrand } = useBrand();
  const { needsWelcome, isLoading } = useOnboardingStatus();
  const completeWelcome = useCompleteWelcome();

  const defaultName = (user?.full_name || '').trim().split(' ')[0] || '';
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<string>('sales');
  const [brandId, setBrandId] = useState<string>(currentBrand?.id ?? '');

  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
    if (currentBrand?.id && !brandId) setBrandId(currentBrand.id);
  }, [defaultName, currentBrand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !needsWelcome) return null;

  const handleSubmit = async () => {
    try {
      await completeWelcome.mutateAsync({
        preferred_name: name.trim() || defaultName || 'Utente',
        primary_role_hint: role,
        preferred_brand_id: brandId || null,
      });
      toast.success(`Benvenuto, ${name.trim() || defaultName}!`);
    } catch (e) {
      toast.error('Impossibile salvare le preferenze. Riprova.');
    }
  };

  // Filter out system brand from selectable brands
  const selectableBrands = brands.filter(b => b.id !== '00000000-0000-0000-0000-000000000000');

  return (
    <Dialog open={true} onOpenChange={() => { /* non dismissibile finché non completato */ }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle>Benvenuto nel CRM</DialogTitle>
          </div>
          <DialogDescription>
            Pochi dati per personalizzare la tua esperienza.
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
            />
          </div>

          <div className="space-y-2">
            <Label>Qual è il tuo ruolo principale?</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectableBrands.length > 1 && (
            <div className="space-y-2">
              <Label>Brand di riferimento <span className="text-xs text-muted-foreground">(opzionale)</span></Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger><SelectValue placeholder="Seleziona un brand" /></SelectTrigger>
                <SelectContent>
                  {selectableBrands.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
